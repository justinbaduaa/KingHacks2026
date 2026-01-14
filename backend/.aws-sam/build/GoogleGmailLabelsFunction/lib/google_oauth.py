"""Google OAuth helpers."""

import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen


GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


def refresh_access_token(refresh_token: str) -> dict:
    """Refresh a Google access token using a stored refresh token."""
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
    if not client_id:
        raise RuntimeError("GOOGLE_OAUTH_CLIENT_ID is not configured")

    payload = urlencode(
        {
            "client_id": client_id,
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
        }
    ).encode("utf-8")

    request = Request(GOOGLE_TOKEN_URL, data=payload, method="POST")
    request.add_header("Content-Type", "application/x-www-form-urlencoded")

    with urlopen(request, timeout=10) as response:
        body = response.read().decode("utf-8")
        payload = json.loads(body)

    if "error" in payload:
        error = payload.get("error", "unknown_error")
        description = payload.get("error_description", "")
        raise ValueError(f"{error}:{description}")

    return payload
