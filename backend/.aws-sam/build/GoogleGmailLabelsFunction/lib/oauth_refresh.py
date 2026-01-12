"""Provider-agnostic OAuth refresh interface."""

from lib.google_oauth import refresh_access_token as _refresh_google


def refresh_access_token(provider: str, refresh_token: str) -> dict:
    """Refresh an access token for the given provider."""
    if provider == "google":
        return _refresh_google(refresh_token)
    raise ValueError(f"Unsupported provider: {provider}")
