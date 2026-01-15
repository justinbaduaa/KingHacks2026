"""Handler for getting active nodes for the authenticated user."""

import json
import logging

from lib.response import api_response, error_response
from lib.auth import get_user_id
from lib.dynamo import query_items

logger = logging.getLogger()
logger.setLevel(logging.INFO)


def handler(event, context):
    """
    Get active nodes handler.
    
    Retrieves all nodes for the authenticated user from DynamoDB.
    Uses the user ID from the JWT token claims.
    
    Returns:
        - nodes: List of all node objects for the user
        - node_ids: List of all node IDs for the user
    """
    # Get user ID from event (extracted from JWT token by API Gateway)
    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized: user ID not found")
    
    try:
        # Query all nodes for this user
        # pk format: user#{user_id}
        # sk format: day#{local_day}#node#{node_id}
        # We query by pk only to get all nodes regardless of day
        pk = f"user#{user_id}"
        
        logger.info(json.dumps({
            "action": "get_active_nodes",
            "user_id": user_id,
            "pk": pk
        }))
        
        # Query all items for this user (no sk_prefix means get all)
        items = query_items(pk=pk)
        
        # Extract nodes and node_ids from the items
        nodes = []
        node_ids = []
        
        for item in items:
            # Each item has: pk, sk, node_id, node, and other metadata
            if "node" in item:
                nodes.append(item["node"])
            if "node_id" in item:
                node_ids.append(item["node_id"])
        
        # Sort nodes by created_at_iso (newest first) if available
        try:
            nodes.sort(key=lambda n: n.get("created_at_iso", ""), reverse=True)
        except (KeyError, TypeError):
            # If sorting fails, just return in whatever order
            pass
        
        logger.info(json.dumps({
            "action": "get_active_nodes_complete",
            "user_id": user_id,
            "nodes_count": len(nodes),
            "node_ids_count": len(node_ids)
        }))
        
        return api_response(200, {
            "ok": True,
            "nodes": nodes,
            "node_ids": node_ids,
            "count": len(nodes)
        })
    
    except Exception as e:
        logger.error(f"Error getting nodes: {str(e)}", exc_info=True)
        return error_response(500, f"Failed to get nodes: {str(e)}")
