"""Slack target utilities for channels and users."""

import os
from datetime import datetime, timezone
from typing import Dict

from lib.dynamo import get_item, put_item

SLACK_TARGETS_SK = "settings#slack_targets"


def _normalize_name(value: str) -> str:
    return " ".join(value.strip().lower().lstrip("#").split())


def get_slack_targets(user_id: str, table_name: str | None = None) -> dict:
    if not user_id:
        return {}
    resolved_table = table_name or os.environ.get("INTEGRATIONS_TABLE_NAME")
    if not resolved_table:
        return {}
    pk = f"user#{user_id}"
    item = get_item(pk, SLACK_TARGETS_SK, table_name=resolved_table)
    return item or {}


def format_slack_targets_for_payload(targets: dict) -> dict:
    channels = targets.get("channels") or {}
    users = targets.get("users") or {}
    return {
        "channels": [{"name": name, "id": channel_id} for name, channel_id in channels.items()],
        "users": [{"name": name, "id": user_id} for name, user_id in users.items()],
    }


def resolve_channel_id(channel_id: str, channel_name: str, targets: dict) -> str:
    if channel_id:
        return channel_id
    if not channel_name:
        return ""
    if channel_name.startswith(("C", "G")) and len(channel_name) >= 8:
        return channel_name
    if channel_name.startswith("#"):
        return channel_name
    channels = targets.get("channels") or {}
    normalized = _normalize_name(channel_name)
    for name, cid in channels.items():
        if _normalize_name(name) == normalized:
            return cid
    return ""


def resolve_user_id(user_id: str, user_name: str, targets: dict) -> str:
    if user_id:
        return user_id
    if not user_name:
        return ""
    if user_name.startswith("U") and len(user_name) >= 8:
        return user_name
    users = targets.get("users") or {}
    normalized = _normalize_name(user_name)
    for name, uid in users.items():
        if _normalize_name(name) == normalized:
            return uid
    return ""


def upsert_slack_targets(user_id: str, channels: Dict[str, str], users: Dict[str, str], table_name: str | None = None) -> None:
    if not user_id:
        raise ValueError("user_id is required")
    resolved_table = table_name or os.environ.get("INTEGRATIONS_TABLE_NAME")
    if not resolved_table:
        raise ValueError("INTEGRATIONS_TABLE_NAME is not configured")

    now = datetime.now(timezone.utc).isoformat()
    pk = f"user#{user_id}"
    existing = get_item(pk, SLACK_TARGETS_SK, table_name=resolved_table)
    created_at = (existing or {}).get("created_at") or now

    item = {
        "pk": pk,
        "sk": SLACK_TARGETS_SK,
        "type": "slack_targets",
        "channels": channels,
        "users": users,
        "created_at": created_at,
        "updated_at": now,
    }
    put_item(item, table_name=resolved_table)
