"""Handler for ingesting voice transcripts and creating structured nodes."""

import json
import os
import logging
from typing import Any

from lib.response import api_response, error_response
from lib.bedrock_converse import call_converse
from lib.time_normalize import (
    parse_offset_from_user_time_iso,
    compute_local_day,
    utc_now_iso,
    normalize_node_times
)
from lib.validate import validate_node, create_fallback_note
from lib.dynamo import put_node_item
from lib.ids import generate_node_id
from lib.schemas import SCHEMA_VERSION

logger = logging.getLogger()
logger.setLevel(logging.INFO)

DEFAULT_MODEL_ID = "anthropic.claude-3-haiku-20240307-v1:0"


def parse_request_body(event: dict) -> tuple[dict | None, str | None]:
    """Parse and validate request body. Returns (body, error_message)."""
    body_str = event.get("body", "")
    if not body_str:
        return None, "Request body is required"
    
    try:
        body = json.loads(body_str) if isinstance(body_str, str) else body_str
    except json.JSONDecodeError:
        return None, "Invalid JSON in request body"
    
    # Validate required fields
    transcript = body.get("transcript", "").strip()
    if not transcript:
        return None, "transcript is required and must be non-empty"
    
    user_time_iso = body.get("user_time_iso", "").strip()
    if not user_time_iso:
        return None, "user_time_iso is required"
    
    return body, None


def build_user_payload(body: dict) -> dict:
    """Build the payload to send to Bedrock."""
    user_time_iso = body["user_time_iso"]
    captured_at_iso = body.get("captured_at_iso") or user_time_iso
    
    user_location = body.get("user_location")
    if not user_location:
        user_location = {"kind": "unknown"}
    
    return {
        "transcript": body["transcript"],
        "transcript_meta": body.get("transcript_meta", {}),
        "captured_at_iso": captured_at_iso,
        "user_time_iso": user_time_iso,
        "user_location": user_location
    }


def build_raw_payload_subset(body: dict) -> dict:
    """Build a small subset of the raw payload for storage."""
    return {
        "user_time_iso": body.get("user_time_iso"),
        "user_location_kind": body.get("user_location", {}).get("kind", "unknown"),
        "has_transcript_meta": bool(body.get("transcript_meta"))
    }


def finalize_node(
    node: dict,
    captured_at_iso: str,
    created_at_iso: str,
    timezone_offset: str,
    model_id: str,
    latency_ms: int,
    tool_name: str,
    fallback_used: bool
) -> dict:
    """Add server-side fields to the node."""
    node = dict[Any, Any](node)
    
    # Set server timestamps
    node["created_at_iso"] = created_at_iso
    node["captured_at_iso"] = captured_at_iso
    node["timezone"] = timezone_offset
    
    # Ensure schema version
    node["schema_version"] = SCHEMA_VERSION
    
    # Add parse debug info
    node["parse_debug"] = {
        "model_id": model_id,
        "latency_ms": latency_ms,
        "tool_name_used": tool_name or "none",
        "fallback_used": fallback_used
    }
    
    return node


def handler(event, context):
    """
    Ingest handler - processes voice transcripts into structured nodes.
    
    Input: JSON with transcript, user_time_iso, optional user_location
    Output: JSON with ok, node_id, node
    """
    # Parse request
    body, error = parse_request_body(event)
    if error:
        return error_response(400, error)
    
    user_id = body.get("user_id", "demo")
    transcript = body["transcript"]
    user_time_iso = body["user_time_iso"]
    captured_at_iso = body.get("captured_at_iso") or user_time_iso
    
    # Extract timezone offset for time normalization
    timezone_offset = parse_offset_from_user_time_iso(user_time_iso)
    local_day = compute_local_day(user_time_iso)
    created_at_iso = utc_now_iso()
    
    # Build payload for Bedrock
    user_payload = build_user_payload(body)
    
    # Get model ID from environment
    model_id = os.environ.get("BEDROCK_MODEL_ID", DEFAULT_MODEL_ID)
    
    # Call Bedrock
    tool_name = None
    tool_input = None
    latency_ms = 0
    fallback_used = False
    all_warnings = []
    
    try:
        tool_name, tool_input, raw_response, latency_ms = call_converse(model_id, user_payload)
        
        if not tool_name or not tool_input:
            # No tool call - create fallback
            logger.warning("Bedrock returned no tool call")
            all_warnings.append("Model did not return a tool call - using fallback")
            node = create_fallback_note(
                title="Captured Note",
                body=transcript,
                warnings=all_warnings
            )
            fallback_used = True
        else:
            node = tool_input
            
    except Exception as e:
        logger.error(f"Bedrock call failed: {str(e)}")
        all_warnings.append(f"Bedrock call failed: {str(e)}")
        node = create_fallback_note(
            title="Captured Note",
            body=transcript,
            warnings=all_warnings
        )
        fallback_used = True
        latency_ms = 0
    
    # Normalize times in the node
    node, time_warnings = normalize_node_times(node, timezone_offset)
    all_warnings.extend(time_warnings)
    
    # Validate the node
    node, validation_warnings, validation_fallback = validate_node(node, transcript)
    all_warnings.extend(validation_warnings)
    fallback_used = fallback_used or validation_fallback
    
    # Finalize with server-side fields
    node = finalize_node(
        node=node,
        captured_at_iso=captured_at_iso,
        created_at_iso=created_at_iso,
        timezone_offset=timezone_offset,
        model_id=model_id,
        latency_ms=latency_ms,
        tool_name=tool_name,
        fallback_used=fallback_used
    )
    
    # Merge all warnings
    existing_warnings = node.get("global_warnings", [])
    node["global_warnings"] = list(set(existing_warnings + all_warnings))
    
    # Generate node ID
    node_id = generate_node_id()
    
    # Store in DynamoDB
    try:
        put_node_item(
            user_id=user_id,
            local_day=local_day,
            node_id=node_id,
            raw_transcript=transcript,
            raw_payload_subset=build_raw_payload_subset(body),
            node_obj=node,
            captured_at_iso=captured_at_iso,
            created_at_iso=created_at_iso
        )
    except Exception as e:
        logger.error(f"DynamoDB write failed: {str(e)}")
        # Still return the node even if storage fails
        node["global_warnings"].append(f"Storage failed: {str(e)}")
    
    # Log summary
    logger.info(json.dumps({
        "action": "ingest_complete",
        "node_id": node_id,
        "node_type": node.get("node_type"),
        "tool_used": tool_name,
        "latency_ms": latency_ms,
        "fallback_used": fallback_used,
        "user_id": user_id
    }))
    
    return api_response(200, {
        "ok": True,
        "node_id": node_id,
        "node": node
    })
