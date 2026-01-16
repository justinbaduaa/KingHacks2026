"""Microsoft OAuth helpers."""

import os
import requests


class MicrosoftOAuthError(ValueError):
    """Raised when Microsoft OAuth fails."""


def _token_url() -> str:
    tenant = os.environ.get("MICROSOFT_TENANT", "common")
    return f"https://login.microsoftonline.com/{tenant}/oauth2/v2.0/token"


def exchange_code_for_tokens(code: str, redirect_uri: str) -> dict:
    client_id = os.environ.get("MICROSOFT_CLIENT_ID")
    client_secret = os.environ.get("MICROSOFT_CLIENT_SECRET")
    scopes = os.environ.get("MICROSOFT_SCOPES")

    if not client_id:
        raise MicrosoftOAuthError("MICROSOFT_CLIENT_ID is not configured")
    if not client_secret:
        raise MicrosoftOAuthError("MICROSOFT_CLIENT_SECRET is not configured")

    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "code": code,
        "redirect_uri": redirect_uri,
        "grant_type": "authorization_code",
    }
    if scopes:
        data["scope"] = scopes

    try:
        response = requests.post(_token_url(), data=data, timeout=15)
    except requests.RequestException as exc:
        raise MicrosoftOAuthError(f"Microsoft OAuth request failed: {exc}") from exc

    if response.status_code != 200:
        raise MicrosoftOAuthError(f"Microsoft OAuth failed: HTTP {response.status_code}")

    payload = response.json()
    if "error" in payload:
        error = payload.get("error_description") or payload.get("error")
        raise MicrosoftOAuthError(f"Microsoft OAuth failed: {error}")

    return payload


def refresh_access_token(refresh_token: str) -> dict:
    client_id = os.environ.get("MICROSOFT_CLIENT_ID")
    client_secret = os.environ.get("MICROSOFT_CLIENT_SECRET")
    scopes = os.environ.get("MICROSOFT_SCOPES")

    if not client_id:
        raise MicrosoftOAuthError("MICROSOFT_CLIENT_ID is not configured")
    if not client_secret:
        raise MicrosoftOAuthError("MICROSOFT_CLIENT_SECRET is not configured")

    data = {
        "client_id": client_id,
        "client_secret": client_secret,
        "refresh_token": refresh_token,
        "grant_type": "refresh_token",
    }
    if scopes:
        data["scope"] = scopes

    try:
        response = requests.post(_token_url(), data=data, timeout=15)
    except requests.RequestException as exc:
        raise MicrosoftOAuthError(f"Microsoft token refresh failed: {exc}") from exc

    if response.status_code != 200:
        raise MicrosoftOAuthError(f"Microsoft token refresh failed: HTTP {response.status_code}")

    payload = response.json()
    if "error" in payload:
        error = payload.get("error_description") or payload.get("error")
        raise MicrosoftOAuthError(f"Microsoft token refresh failed: {error}")

    return payload
