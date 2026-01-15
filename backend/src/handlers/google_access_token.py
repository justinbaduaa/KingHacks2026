"""Handler for refreshing and returning a Google access token."""

import os
from datetime import datetime, timezone

from lib.auth import get_user_id
from lib.dynamo import get_item, put_item
from lib.oauth_refresh import refresh_access_token
from lib.response import api_response, error_response


def handler(event, context):
    """Refresh and return a Google access token for the authenticated user."""
    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized")

    table_name = os.environ.get("INTEGRATIONS_TABLE_NAME")
    pk = f"user#{user_id}"
    sk = "integration#google"
    item = get_item(pk, sk, table_name=table_name)
    if not item or not item.get("refresh_token"):
        return error_response(404, "Google integration not connected")

    try:
        token_response = refresh_access_token("google", item["refresh_token"])
    except ValueError as exc:
        message = str(exc)
        if message.startswith("invalid_grant"):
            return error_response(401, "Google refresh token expired or revoked; reconnect required")
        return error_response(502, "Failed to refresh Google access token")
    except Exception:
        return error_response(502, "Failed to refresh Google access token")

    access_token = token_response.get("access_token")
    if not access_token:
        return error_response(502, "Missing access token in refresh response")

    rotated_refresh = token_response.get("refresh_token")
    if rotated_refresh:
        now = datetime.now(timezone.utc).isoformat()
        item["refresh_token"] = rotated_refresh
        item["token_hint"] = rotated_refresh[-4:]
        item["updated_at"] = now
        if token_response.get("scope"):
            item["scope"] = token_response["scope"]
        put_item(item, table_name=table_name)

    return api_response(
        200,
        {
            "access_token": access_token,
            "token_type": token_response.get("token_type", "Bearer"),
            "expires_in": token_response.get("expires_in"),
            "scope": token_response.get("scope"),
        },
    )
