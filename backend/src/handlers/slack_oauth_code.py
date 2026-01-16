"""Exchange Slack OAuth code for user token and store it."""

from lib.auth import get_user_id
from lib.json_utils import parse_body
from lib.response import api_response, error_response
from lib.slack_oauth import SlackOAuthError, exchange_code_for_tokens
from lib.slack_store import store_slack_tokens


def handler(event, context):
    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized")

    try:
        body = parse_body(event)
    except Exception:
        return error_response(400, "Invalid JSON in request body")

    code = (body or {}).get("code")
    redirect_uri = (body or {}).get("redirect_uri")
    if not code:
        return error_response(400, "Missing code")
    if not redirect_uri:
        return error_response(400, "Missing redirect_uri")

    try:
        payload = exchange_code_for_tokens(code, redirect_uri)
    except SlackOAuthError as exc:
        return error_response(400, str(exc))
    except Exception:
        return error_response(502, "Failed to exchange Slack OAuth code")

    try:
        item = store_slack_tokens(user_id, payload)
    except ValueError as exc:
        return error_response(502, str(exc))

    return api_response(
        200,
        {
            "stored": True,
            "provider_user_id": item.get("provider_user_id"),
            "team_id": item.get("team_id"),
        },
    )
