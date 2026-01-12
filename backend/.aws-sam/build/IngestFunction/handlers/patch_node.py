"""Handler for patching a node."""

from lib.response import api_response


def handler(event, context):
    """Patch node handler."""
    return api_response(200, {"message": "Patch node endpoint"})
