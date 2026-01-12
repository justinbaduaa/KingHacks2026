"""Handler for getting active nodes from a recent timeframe."""

from lib.response import api_response


def handler(event, context):
    """Get active nodes handler.
    
    Retrieves all nodes from a recent timeframe (default: last 7 days).
    Query params:
        - days: Number of days to look back (default: 7)
    """
    return api_response(200, {"message": "Get active nodes endpoint"})
