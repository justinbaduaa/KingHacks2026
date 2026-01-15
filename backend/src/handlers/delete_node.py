"""Handler for deleting a node."""

import json
import logging

from lib.response import api_response, error_response
from lib.auth import get_user_id
from lib.dynamo import query_items, delete_item

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """
    Delete node handler.
    
    Deletes a specific node for the authenticated user.
    Uses the user ID from the JWT token and node_id from path parameters.
    
    Path parameters:
        - node_id: The ID of the node to delete
    """
    # Get user ID from event (extracted from JWT token by API Gateway)
    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized: user ID not found")
    
    # Get node_id from path parameters
    path_params = event.get("pathParameters") or {}
    node_id = path_params.get("node_id")
    
    if not node_id:
        return error_response(400, "node_id is required in path parameters")
    
    try:
        # Query all nodes for this user to find the one with matching node_id
        # We need to find the item to get its sk (sort key) for deletion
        pk = f"user#{user_id}"
        
        logger.info(json.dumps({
            "action": "delete_node",
            "user_id": user_id,
            "node_id": node_id,
            "pk": pk
        }))
        
        # Query all items for this user
        items = query_items(pk=pk)
        
        # Find the item with matching node_id
        target_item = None
        for item in items:
            if item.get("node_id") == node_id:
                target_item = item
                break
        
        if not target_item:
            logger.warning(json.dumps({
                "action": "delete_node_not_found",
                "user_id": user_id,
                "node_id": node_id
            }))
            return error_response(404, f"Node with id '{node_id}' not found for this user")
        
        # Extract pk and sk from the found item
        item_pk = target_item.get("pk")
        item_sk = target_item.get("sk")
        
        if not item_pk or not item_sk:
            logger.error(json.dumps({
                "action": "delete_node_invalid_item",
                "user_id": user_id,
                "node_id": node_id,
                "item": target_item
            }))
            return error_response(500, "Invalid node item structure")
        
        # Verify the pk matches the user (security check)
        if item_pk != pk:
            logger.error(json.dumps({
                "action": "delete_node_pk_mismatch",
                "user_id": user_id,
                "node_id": node_id,
                "expected_pk": pk,
                "item_pk": item_pk
            }))
            return error_response(403, "Node does not belong to this user")
        
        # Delete the item
        delete_item(pk=item_pk, sk=item_sk)
        
        logger.info(json.dumps({
            "action": "delete_node_complete",
            "user_id": user_id,
            "node_id": node_id,
            "pk": item_pk,
            "sk": item_sk
        }))
        
        return api_response(200, {
            "ok": True,
            "node_id": node_id,
            "message": "Node deleted successfully"
        })
    
    except Exception as e:
        logger.error(f"Error deleting node: {str(e)}", exc_info=True)
        return error_response(500, f"Failed to delete node: {str(e)}")
