"""Handlers for Microsoft integration tokens."""

import os

from lib.auth import get_user_id
from lib.dynamo import delete_item, get_item
from lib.response import api_response, error_response


def handler(event, context):
    method = (event.get("httpMethod") or "").upper()
    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized")

    table_name = os.environ.get("INTEGRATIONS_TABLE_NAME")
    pk = f"user#{user_id}"
    sk = "integration#microsoft"

    if method == "GET":
        item = get_item(pk, sk, table_name=table_name)
        if not item:
            return api_response(200, {"connected": False})
        return api_response(
            200,
            {
                "connected": True,
                "provider_user_id": item.get("provider_user_id"),
                "tenant_id": item.get("tenant_id"),
                "scope": item.get("scope"),
                "updated_at": item.get("updated_at"),
                "token_hint": item.get("token_hint"),
            },
        )

    if method == "DELETE":
        delete_item(pk, sk, table_name=table_name)
        return api_response(200, {"deleted": True})

    return error_response(405, "Method not allowed")
