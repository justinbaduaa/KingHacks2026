"""Handler for exchanging Google OAuth auth codes on the backend."""

import base64
import hashlib
import json
import os
from datetime import datetime, timezone
from typing import Optional

from lib.auth import get_user_id
from lib.dynamo import get_item, put_item
from lib.google_oauth import exchange_code_for_tokens
from lib.response import api_response, error_response


def _decode_jwt_sub(id_token: Optional[str]) -> Optional[str]:
    if not id_token or id_token.count(".") != 2:
        return None
    payload = id_token.split(".")[1]
    padding = "=" * (-len(payload) % 4)
    try:
        decoded = base64.urlsafe_b64decode(payload + padding)
        data = json.loads(decoded)
        return data.get("sub")
    except Exception:
        return None


def _retire_previous_token(pk: str, sk: str, existing: dict, table_name: str):
    previous_token = existing.get("refresh_token")
    if not previous_token:
        return
    retired_at = datetime.now(timezone.utc)
    token_hash = hashlib.sha256(previous_token.encode("utf-8")).hexdigest()
    retired_item = {
        "pk": pk,
        "sk": f"{sk}#retired#{int(retired_at.timestamp())}",
        "provider": "google",
        "refresh_token_hash": token_hash,
        "retired_at": retired_at.isoformat(),
        "ttl": int((retired_at.timestamp() + 86400)),
    }
    put_item(retired_item, table_name=table_name)


def handler(event, context):
    """Exchange authorization code for tokens and store refresh token."""
    method = (event.get("httpMethod") or "").upper()
    if method != "POST":
        return error_response(405, "Method not allowed")

    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized")

    try:
        body = json.loads(event.get("body") or "{}")
    except json.JSONDecodeError:
        return error_response(400, "Invalid JSON in request body")

    code = body.get("code")
    code_verifier = body.get("code_verifier")
    redirect_uri = body.get("redirect_uri")
    if not code or not code_verifier or not redirect_uri:
        return error_response(400, "Missing code, code_verifier, or redirect_uri")

    try:
        token_response = exchange_code_for_tokens(code, code_verifier, redirect_uri)
    except ValueError as exc:
        message = str(exc)
        if message.startswith("invalid_grant"):
            return error_response(401, "Authorization code invalid or expired; re-auth required")
        return error_response(502, f"Failed to exchange code: {message}")
    except Exception:
        return error_response(502, "Failed to exchange code")

    refresh_token = token_response.get("refresh_token")
    if not refresh_token:
        return error_response(
            400,
            "Google did not return a refresh token. Ensure access_type=offline and prompt=consent.",
        )

    now = datetime.now(timezone.utc).isoformat()
    table_name = os.environ.get("INTEGRATIONS_TABLE_NAME")
    pk = f"user#{user_id}"
    sk = "integration#google"

    existing = get_item(pk, sk, table_name=table_name) or {}
    if existing.get("refresh_token") and existing.get("refresh_token") != refresh_token:
        _retire_previous_token(pk, sk, existing, table_name)

    provider_user_id = _decode_jwt_sub(token_response.get("id_token")) or existing.get("provider_user_id")
    item = {
        "pk": pk,
        "sk": sk,
        "provider": "google",
        "refresh_token": refresh_token,
        "token_hint": refresh_token[-4:],
        "provider_user_id": provider_user_id,
        "scope": token_response.get("scope"),
        "created_at": existing.get("created_at", now),
        "updated_at": now,
    }

    put_item(item, table_name=table_name)
    return api_response(200, {"stored": True, "provider_user_id": provider_user_id})
