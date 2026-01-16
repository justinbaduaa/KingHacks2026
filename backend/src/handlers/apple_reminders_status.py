"""Store local Apple Reminders execution status."""

import os
from datetime import datetime, timezone

from lib.auth import get_user_id
from lib.dynamo import put_item
from lib.json_utils import parse_body
from lib.response import api_response, error_response


def handler(event, context):
    method = (event.get("httpMethod") or "").upper()
    if method != "POST":
        return error_response(405, "Method not allowed")

    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized")

    try:
        body = parse_body(event)
    except Exception:
        return error_response(400, "Invalid JSON in request body")

    node_id = (body or {}).get("node_id")
    status = (body or {}).get("status")
    if not node_id:
        return error_response(400, "Missing node_id")
    if not status:
        return error_response(400, "Missing status")

    now = datetime.now(timezone.utc).isoformat()
    table_name = os.environ.get("INTEGRATIONS_TABLE_NAME")
    item = {
        "pk": f"user#{user_id}",
        "sk": f"reminder_exec#{node_id}",
        "type": "apple_reminder_status",
        "node_id": node_id,
        "status": status,
        "provider_reminder_id": (body or {}).get("provider_reminder_id"),
        "error": (body or {}).get("error"),
        "updated_at": now,
    }

    put_item(item, table_name=table_name)
    return api_response(200, {"stored": True})
