"""Handler for completing a node."""

from lib.response import api_response


def handler(event, context):
    """Complete node handler."""
    return api_response(200, {"message": "Complete node endpoint"})
