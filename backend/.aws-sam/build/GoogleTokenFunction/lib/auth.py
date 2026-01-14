"""Authentication utilities."""

import base64
import json


def verify_token(token: str) -> dict:
    """Decode a JWT payload without signature verification.

    API Gateway should enforce Cognito validation via the authorizer; this helper
    is only for inspecting claims when needed.
    """
    parts = token.split(".")
    if len(parts) != 3:
        raise ValueError("Invalid JWT format")
    payload = parts[1]
    padding = "=" * (-len(payload) % 4)
    decoded = base64.urlsafe_b64decode(payload + padding)
    return json.loads(decoded)


def get_user_id(event: dict) -> str:
    """Extract user ID from the request event."""
    request_context = event.get("requestContext", {})
    authorizer = request_context.get("authorizer", {})
    claims = authorizer.get("claims")
    if not claims:
        jwt_context = authorizer.get("jwt", {})
        claims = jwt_context.get("claims", {})
    if not claims:
        return ""
    return claims.get("sub", "")
