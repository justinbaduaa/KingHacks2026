"""Slack token storage helpers."""

import os
from datetime import datetime, timezone

from lib.dynamo import get_item, put_item


def store_slack_tokens(user_id: str, payload: dict) -> dict:
    authed_user = payload.get("authed_user") or {}
    access_token = authed_user.get("access_token")
    if not access_token:
        raise ValueError("Slack user access token missing from response")

    now = datetime.now(timezone.utc).isoformat()
    table_name = os.environ.get("INTEGRATIONS_TABLE_NAME")
    pk = f"user#{user_id}"
    sk = "integration#slack"
    existing = get_item(pk, sk, table_name=table_name)

    item = {
        "pk": pk,
        "sk": sk,
        "provider": "slack",
        "access_token": access_token,
        "token_hint": access_token[-4:],
        "provider_user_id": authed_user.get("id"),
        "scope": authed_user.get("scope"),
        "team_id": (payload.get("team") or {}).get("id"),
        "team_name": (payload.get("team") or {}).get("name"),
        "bot_access_token": payload.get("access_token"),
        "bot_scope": payload.get("scope"),
        "created_at": (existing or {}).get("created_at", now),
        "updated_at": now,
    }

    refresh_token = authed_user.get("refresh_token")
    expires_in = authed_user.get("expires_in")
    if refresh_token:
        item["refresh_token"] = refresh_token
    if expires_in:
        try:
            item["expires_at"] = int(datetime.now(timezone.utc).timestamp() + int(expires_in))
        except (TypeError, ValueError):
            pass

    put_item(item, table_name=table_name)
    return item
