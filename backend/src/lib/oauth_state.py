"""OAuth state helpers for callback-based flows."""

import os
import secrets
from datetime import datetime, timezone

from lib.dynamo import delete_item, get_item, put_item

STATE_TTL_SECONDS = 600


def create_oauth_state(provider: str, user_id: str, redirect_uri: str) -> dict:
    if not provider:
        raise ValueError("provider is required")
    if not user_id:
        raise ValueError("user_id is required")
    if not redirect_uri:
        raise ValueError("redirect_uri is required")

    state = secrets.token_urlsafe(16)
    now = datetime.now(timezone.utc)
    ttl = int(now.timestamp()) + STATE_TTL_SECONDS

    table_name = os.environ.get("INTEGRATIONS_TABLE_NAME")
    item = {
        "pk": f"oauth_state#{state}",
        "sk": provider,
        "provider": provider,
        "user_id": user_id,
        "redirect_uri": redirect_uri,
        "created_at": now.isoformat(),
        "ttl": ttl,
    }
    put_item(item, table_name=table_name)
    return {"state": state, "redirect_uri": redirect_uri}


def consume_oauth_state(provider: str, state: str) -> dict | None:
    if not provider or not state:
        return None
    table_name = os.environ.get("INTEGRATIONS_TABLE_NAME")
    pk = f"oauth_state#{state}"
    item = get_item(pk, provider, table_name=table_name)
    if not item:
        return None
    delete_item(pk, provider, table_name=table_name)
    return item
