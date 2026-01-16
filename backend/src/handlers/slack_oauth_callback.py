"""Handle Slack OAuth callback and store user token."""

from html import escape

from lib.oauth_state import consume_oauth_state
from lib.response import api_response
from lib.slack_oauth import SlackOAuthError, exchange_code_for_tokens
from lib.slack_store import store_slack_tokens


def _html_response(status_code: int, message: str):
    body = f"""
    <html>
      <head><title>Slack Auth</title></head>
      <body style="font-family: Arial, sans-serif; padding: 24px;">
        <h2>{escape(message)}</h2>
        <p>You can close this window.</p>
      </body>
    </html>
    """
    return api_response(
        status_code,
        {},
        headers={"Content-Type": "text/html"},
    ) | {"body": body}


def handler(event, context):
    params = event.get("queryStringParameters") or {}
    code = params.get("code")
    state = params.get("state")

    if not code or not state:
        return _html_response(400, "Missing code or state.")

    state_item = consume_oauth_state("slack", state)
    if not state_item:
        return _html_response(400, "Invalid or expired OAuth state.")

    user_id = state_item.get("user_id")
    redirect_uri = state_item.get("redirect_uri")
    if not user_id or not redirect_uri:
        return _html_response(400, "Invalid OAuth state.")

    try:
        payload = exchange_code_for_tokens(code, redirect_uri)
        store_slack_tokens(user_id, payload)
    except SlackOAuthError as exc:
        return _html_response(400, f"Slack OAuth failed: {exc}")
    except Exception:
        return _html_response(502, "Slack OAuth failed.")

    return _html_response(200, "Slack connected successfully.")
