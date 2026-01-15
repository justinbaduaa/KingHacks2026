import json
import logging
from lib.response import api_response, error_response
from lib.auth import get_user_id
from lib.dynamo import put_node_item
from lib.ids import generate_node_id
from lib.integration_execute import IntegrationExecutionError, execute_node_integration
from lib.json_utils import parse_body
from lib.time_normalize import compute_local_day, utc_now_iso

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """
    Complete node handler - saves a completed node to DynamoDB.
    
    Expected request body:
    - node: (required) The node object to save
    - node_id: (optional) Node ID, will be generated if not provided
    - captured_at_iso: (optional) ISO timestamp when captured, defaults to created_at_iso
    """
    # Get user ID from event
    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized: user ID not found")
    
    # Parse request body
    try:
        body = parse_body(event)
    except json.JSONDecodeError:
        return error_response(400, "Invalid JSON in request body")
    
    # Extract node from body
    node = body.get("node")
    if not node:
        # If "node" key doesn't exist, assume the entire body is the node
        node = body
    
    if not isinstance(node, dict):
        return error_response(400, "Node must be a JSON object")
    
    # Extract or generate node_id
    node_id = body.get("node_id") or node.get("node_id")
    if not node_id:
        # Try to get from path parameters
        path_params = event.get("pathParameters") or {}
        node_id = path_params.get("node_id")
    
    if not node_id:
        node_id = generate_node_id()
        logger.info(f"Generated new node_id: {node_id}")
    
    # Extract timestamps
    created_at_iso = node.get("created_at_iso") or utc_now_iso()
    captured_at_iso = node.get("captured_at_iso") or body.get("captured_at_iso") or created_at_iso
    
    # Compute local_day from captured_at_iso
    local_day = compute_local_day(captured_at_iso)
    
    # Extract raw_transcript if available (for backwards compatibility)
    raw_transcript = body.get("raw_transcript") or node.get("raw_transcript") or ""
    
    # Extract raw_payload_subset if available
    raw_payload_subset = body.get("raw_payload_subset") or {}
    
    # Ensure node has node_id
    node["node_id"] = node_id

    # Execute integrations before persisting
    try:
        node, _event_response = execute_node_integration(
            user_id, node, require_supported=False
        )
    except IntegrationExecutionError as exc:
        return error_response(exc.status_code, str(exc))
    
    try:
        # Save to DynamoDB
        put_node_item(
            user_id=user_id,
            local_day=local_day,
            node_id=node_id,
            raw_transcript=raw_transcript,
            raw_payload_subset=raw_payload_subset,
            node_obj=node,
            captured_at_iso=captured_at_iso,
            created_at_iso=created_at_iso
        )
        
        logger.info(json.dumps({
            "action": "complete_node",
            "node_id": node_id,
            "user_id": user_id,
            "node_type": node.get("node_type"),
            "local_day": local_day
        }))
        
        return api_response(200, {
            "ok": True,
            "node_id": node_id,
            "message": "Node saved successfully"
        })
    
    except Exception as e:
        logger.error(f"Error saving node: {str(e)}", exc_info=True)
        return error_response(500, f"Failed to save node: {str(e)}")
