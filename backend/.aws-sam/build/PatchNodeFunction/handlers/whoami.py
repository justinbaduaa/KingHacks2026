"""Handler for returning the authenticated user's identity."""

from lib.auth import get_user_id
from lib.response import api_response, error_response


def _get_claims(event: dict) -> dict:
    request_context = event.get("requestContext", {})
    authorizer = request_context.get("authorizer", {})
    claims = authorizer.get("claims")
    if not claims:
        jwt_context = authorizer.get("jwt", {})
        claims = jwt_context.get("claims", {})
    return claims or {}


def handler(event, context):
    """Return the Cognito subject and key claims for the caller."""
    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized")

    claims = _get_claims(event)
    return api_response(
        200,
        {
            "user_id": user_id,
            "email": claims.get("email"),
            "username": claims.get("cognito:username") or claims.get("username"),
        },
    )
