"""API response utilities."""

import json
from lib.json_utils import json_serial


def api_response(status_code: int, body: dict, headers: dict = None):
    """Create an API Gateway response."""
    default_headers = {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type,Authorization",
        "Access-Control-Allow-Methods": "GET,POST,PATCH,DELETE,OPTIONS",
    }
    if headers:
        default_headers.update(headers)

    return {
        "statusCode": status_code,
        "headers": default_headers,
        "body": json.dumps(body, default=json_serial),
    }


def error_response(status_code: int, message: str):
    """Create an error response."""
    return api_response(status_code, {"error": message})
