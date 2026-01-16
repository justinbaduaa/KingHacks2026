"""Google OAuth helpers."""

import json
import os
from urllib.parse import urlencode
from urllib.request import Request, urlopen
from urllib.error import HTTPError


GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"


def _request_token(payload: dict) -> dict:
    encoded = urlencode(payload).encode("utf-8")
    request = Request(GOOGLE_TOKEN_URL, data=encoded, method="POST")
    request.add_header("Content-Type", "application/x-www-form-urlencoded")

    try:
        with urlopen(request, timeout=10) as response:
            body = response.read().decode("utf-8")
            response_payload = json.loads(body)
    except HTTPError as exc:
        body = exc.read().decode("utf-8")
        try:
            response_payload = json.loads(body)
        except json.JSONDecodeError:
            raise ValueError(f"http_error:{exc.code}:{body}")
        error = response_payload.get("error", "http_error")
        description = response_payload.get("error_description", "")
        raise ValueError(f"{error}:{description}")

    if "error" in response_payload:
        error = response_payload.get("error", "unknown_error")
        description = response_payload.get("error_description", "")
        raise ValueError(f"{error}:{description}")

    return response_payload


def refresh_access_token(refresh_token: str) -> dict:
    """Refresh a Google access token using a stored refresh token."""
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
    if not client_id:
        raise RuntimeError("GOOGLE_OAUTH_CLIENT_ID is not configured")

    payload = {
        "client_id": client_id,
        "grant_type": "refresh_token",
        "refresh_token": refresh_token,
    }

    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
    if client_secret:
        payload["client_secret"] = client_secret

    return _request_token(payload)


def exchange_code_for_tokens(code: str, code_verifier: str, redirect_uri: str) -> dict:
    """Exchange an authorization code for tokens using PKCE."""
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID", "")
    if not client_id:
        raise RuntimeError("GOOGLE_OAUTH_CLIENT_ID is not configured")

    payload = {
        "client_id": client_id,
        "grant_type": "authorization_code",
        "code": code,
        "code_verifier": code_verifier,
        "redirect_uri": redirect_uri,
    }

    client_secret = os.environ.get("GOOGLE_OAUTH_CLIENT_SECRET")
    if client_secret:
        payload["client_secret"] = client_secret

    return _request_token(payload)
