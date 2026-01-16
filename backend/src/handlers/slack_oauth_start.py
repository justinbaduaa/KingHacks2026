"""Start Slack OAuth flow by returning an auth URL."""

import os

from lib.auth import get_user_id
from lib.json_utils import parse_body
from lib.oauth_state import create_oauth_state
from lib.response import api_response, error_response


DEFAULT_SLACK_USER_SCOPE = "chat:write,im:write"


def _resolve_base_url(event: dict) -> str:
    headers = event.get("headers") or {}
    host = headers.get("Host") or headers.get("host")
    stage = (event.get("requestContext") or {}).get("stage")
    if host and stage:
        return f"https://{host}/{stage}"
    if host:
        return f"https://{host}"
    return ""


def handler(event, context):
    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized")

    try:
        body = parse_body(event)
    except Exception:
        body = {}

    client_id = os.environ.get("SLACK_CLIENT_ID")
    if not client_id:
        return error_response(500, "SLACK_CLIENT_ID is not configured")

    base_url = _resolve_base_url(event)
    redirect_uri = (body or {}).get("redirect_uri") or f"{base_url}/integrations/slack/callback"
    if not redirect_uri:
        return error_response(500, "Unable to resolve redirect_uri")

    user_scope = (body or {}).get("user_scope") or os.environ.get("SLACK_USER_SCOPES") or DEFAULT_SLACK_USER_SCOPE
    state_payload = create_oauth_state("slack", user_id, redirect_uri)
    state = state_payload["state"]

    auth_url = (
        "https://slack.com/oauth/v2/authorize"
        f"?client_id={client_id}"
        f"&redirect_uri={redirect_uri}"
        f"&user_scope={user_scope}"
        f"&state={state}"
    )

    return api_response(200, {"auth_url": auth_url, "redirect_uri": redirect_uri, "scope": user_scope})
