"""Slack OAuth helpers."""

import os
import requests


SLACK_OAUTH_URL = "https://slack.com/api/oauth.v2.access"


class SlackOAuthError(ValueError):
    """Raised when Slack OAuth fails."""


def exchange_code_for_tokens(code: str, redirect_uri: str) -> dict:
    client_id = os.environ.get("SLACK_CLIENT_ID")
    client_secret = os.environ.get("SLACK_CLIENT_SECRET")

    if not client_id:
        raise SlackOAuthError("SLACK_CLIENT_ID is not configured")
    if not client_secret:
        raise SlackOAuthError("SLACK_CLIENT_SECRET is not configured")

    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri,
    }

    try:
        response = requests.post(SLACK_OAUTH_URL, data=data, timeout=15)
    except requests.RequestException as exc:
        raise SlackOAuthError(f"Slack OAuth request failed: {exc}") from exc

    if response.status_code != 200:
        raise SlackOAuthError(f"Slack OAuth failed: HTTP {response.status_code}")

    payload = response.json()
    if not payload.get("ok"):
        error = payload.get("error") or "unknown_error"
        raise SlackOAuthError(f"Slack OAuth failed: {error}")

    return payload
