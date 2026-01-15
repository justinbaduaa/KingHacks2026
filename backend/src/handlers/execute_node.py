"""Handler for executing a node integration (calendar)."""

import json

from lib.auth import get_user_id
from lib.integration_execute import IntegrationExecutionError, execute_node_integration
from lib.json_utils import parse_body
from lib.response import api_response, error_response


def handler(event, context):
    """Execute a node by type (currently calendar_placeholder)."""
    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized")

    path_params = event.get("pathParameters") or {}
    node_id = path_params.get("node_id")

    try:
        body = parse_body(event)
    except json.JSONDecodeError:
        return error_response(400, "Invalid JSON in request body")
    node = body.get("node") if isinstance(body, dict) else None
    if not node:
        node = body

    if not isinstance(node, dict):
        return error_response(400, "Node must be a JSON object")

    if node_id and node.get("node_id") and node.get("node_id") != node_id:
        return error_response(400, "node_id in path does not match node payload")

    try:
        updated_node, event_response = execute_node_integration(
            user_id, node, require_supported=True
        )
    except IntegrationExecutionError as exc:
        return error_response(exc.status_code, str(exc))

    return api_response(
        200,
        {
            "ok": True,
            "node": updated_node,
            "calendar_event": {
                "id": (event_response or {}).get("id"),
                "html_link": (event_response or {}).get("htmlLink"),
                "status": (event_response or {}).get("status"),
            },
        },
    )
