"""Sample Gmail integration: list labels."""

import json
import os
from urllib.request import Request, urlopen

from lib.auth import get_user_id
from lib.dynamo import get_item
from lib.oauth_refresh import refresh_access_token
from lib.response import api_response, error_response


def handler(event, context):
    """List Gmail labels using the stored refresh token."""
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

    request = Request("https://gmail.googleapis.com/gmail/v1/users/me/labels")
    request.add_header("Authorization", f"Bearer {access_token}")

    try:
        with urlopen(request, timeout=10) as response:
            body = response.read().decode("utf-8")
            payload = json.loads(body)
    except Exception:
        return error_response(502, "Failed to call Gmail API")

    return api_response(200, {"labels": payload.get("labels", [])})
