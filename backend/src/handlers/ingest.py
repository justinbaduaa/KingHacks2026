"""Handler for ingesting new data."""

from lib.response import api_response


def handler(event, context):
    """Ingest handler."""
    return api_response(200, {"message": "Ingest endpoint"})
