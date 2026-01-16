"""Start Microsoft OAuth flow by returning an auth URL."""

import os
from urllib.parse import urlencode

from lib.auth import get_user_id
from lib.json_utils import parse_body
from lib.oauth_state import create_oauth_state
from lib.response import api_response, error_response


DEFAULT_SCOPES = "User.Read offline_access Mail.Send Calendars.ReadWrite"


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

    client_id = os.environ.get("MICROSOFT_CLIENT_ID")
    if not client_id:
        return error_response(500, "MICROSOFT_CLIENT_ID is not configured")

    tenant = os.environ.get("MICROSOFT_TENANT", "common")
    base_url = _resolve_base_url(event)
    redirect_uri = (body or {}).get("redirect_uri") or f"{base_url}/integrations/microsoft/callback"
    if not redirect_uri:
        return error_response(500, "Unable to resolve redirect_uri")

    scopes = (body or {}).get("scope") or os.environ.get("MICROSOFT_SCOPES") or DEFAULT_SCOPES
    state_payload = create_oauth_state("microsoft", user_id, redirect_uri)
    state = state_payload["state"]

    query = urlencode(
        {
            "client_id": client_id,
            "response_type": "code",
            "redirect_uri": redirect_uri,
            "response_mode": "query",
            "scope": scopes,
            "state": state,
        }
    )
    auth_url = f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/authorize?{query}"

    return api_response(
        200,
        {
            "auth_url": auth_url,
            "redirect_uri": redirect_uri,
            "scope": scopes,
            "tenant": tenant,
        },
    )
