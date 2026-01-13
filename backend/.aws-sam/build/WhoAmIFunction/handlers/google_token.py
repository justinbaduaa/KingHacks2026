"""Handlers for storing Google OAuth refresh tokens."""

import hashlib
import os
from datetime import datetime, timezone
from typing import Optional

from dateutil.parser import isoparse

from lib.auth import get_user_id
from lib.dynamo import delete_item, get_item, put_item
from lib.json_utils import parse_body
from lib.response import api_response, error_response


def _parse_ttl(expires_at: Optional[object]) -> Optional[int]:
    if expires_at is None:
        return None
    if isinstance(expires_at, (int, float)):
        return int(expires_at)
    if isinstance(expires_at, str):
        try:
            return int(expires_at)
        except ValueError:
            try:
                return int(isoparse(expires_at).timestamp())
            except ValueError:
                return None
    return None


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _retire_previous_token(pk: str, sk: str, existing: dict, table_name: str):
    previous_token = existing.get("refresh_token")
    if not previous_token:
        return
    retired_at = datetime.now(timezone.utc)
    retired_item = {
        "pk": pk,
        "sk": f"{sk}#retired#{int(retired_at.timestamp())}",
        "provider": "google",
        "refresh_token_hash": _hash_token(previous_token),
        "retired_at": retired_at.isoformat(),
        "ttl": int((retired_at.timestamp() + 86400)),
    }
    put_item(retired_item, table_name=table_name)


def handler(event, context):
    """Create/read/delete Google refresh token metadata."""
    method = (event.get("httpMethod") or "").upper()
    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized")

    table_name = os.environ.get("INTEGRATIONS_TABLE_NAME")
    pk = f"user#{user_id}"
    sk = "integration#google"

    if method == "GET":
        item = get_item(pk, sk, table_name=table_name)
        if not item:
            return api_response(200, {"connected": False})
        return api_response(
            200,
            {
                "connected": True,
                "provider_user_id": item.get("provider_user_id"),
                "scope": item.get("scope"),
                "updated_at": item.get("updated_at"),
                "token_hint": item.get("token_hint"),
            },
        )

    if method == "DELETE":
        delete_item(pk, sk, table_name=table_name)
        return api_response(200, {"deleted": True})

    if method != "POST":
        return error_response(405, "Method not allowed")

    body = parse_body(event)
    refresh_token = body.get("refresh_token")
    if not refresh_token:
        return error_response(400, "Missing refresh_token")

    now = datetime.now(timezone.utc).isoformat()
    existing = get_item(pk, sk, table_name=table_name)
    if existing and existing.get("refresh_token") != refresh_token:
        _retire_previous_token(pk, sk, existing, table_name)

    item = {
        "pk": pk,
        "sk": sk,
        "provider": "google",
        "refresh_token": refresh_token,
        "token_hint": refresh_token[-4:],
        "provider_user_id": body.get("provider_user_id"),
        "scope": body.get("scope"),
        "created_at": (existing or {}).get("created_at", now),
        "updated_at": now,
    }

    ttl = _parse_ttl(body.get("expires_at"))
    if ttl:
        item["ttl"] = ttl

    put_item(item, table_name=table_name)
    return api_response(200, {"stored": True})
