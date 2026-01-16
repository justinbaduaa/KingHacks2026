"""Microsoft token storage helpers."""

from datetime import datetime, timezone
import os

from lib.auth import verify_token
from lib.dynamo import get_item, put_item


def _parse_id_token(id_token: str) -> dict:
    try:
        return verify_token(id_token)
    except Exception:
        return {}


def store_microsoft_tokens(user_id: str, payload: dict) -> dict:
    access_token = payload.get("access_token")
    refresh_token = payload.get("refresh_token")
    if not access_token or not refresh_token:
        raise ValueError("Microsoft access_token or refresh_token missing from response")

    id_claims = _parse_id_token(payload.get("id_token", ""))
    provider_user_id = id_claims.get("oid") or id_claims.get("sub")
    tenant_id = id_claims.get("tid")

    now = datetime.now(timezone.utc)
    expires_in = payload.get("expires_in")
    expires_at = None
    if expires_in:
        try:
            expires_at = int(now.timestamp() + int(expires_in))
        except (TypeError, ValueError):
            expires_at = None

    table_name = os.environ.get("INTEGRATIONS_TABLE_NAME")
    pk = f"user#{user_id}"
    sk = "integration#microsoft"
    existing = get_item(pk, sk, table_name=table_name)
    created_at = (existing or {}).get("created_at", now.isoformat())

    item = {
        "pk": pk,
        "sk": sk,
        "provider": "microsoft",
        "access_token": access_token,
        "refresh_token": refresh_token,
        "token_hint": access_token[-4:],
        "scope": payload.get("scope"),
        "provider_user_id": provider_user_id,
        "tenant_id": tenant_id,
        "created_at": created_at,
        "updated_at": now.isoformat(),
    }
    if expires_at:
        item["expires_at"] = expires_at

    put_item(item, table_name=table_name)
    return item
