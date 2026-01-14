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

DEFAULT_MODEL_ID = "arn:aws:bedrock:us-east-1:244271315858:inference-profile/us.anthropic.claude-haiku-4-5-20251001-v1:0"


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
    tool_uses = []
    latency_ms = 0
    error_warnings = []
    
    try:
        tool_uses, raw_response, latency_ms = call_converse(model_id, user_payload)
    except Exception as e:
        logger.error(f"Bedrock call failed: {str(e)}")
        error_warnings.append(f"Bedrock call failed: {str(e)}")
        tool_uses = []
        latency_ms = 0
    
    nodes = []
    node_ids = []
    
    if not tool_uses:
        # No tool call - create fallback node
        logger.warning("Bedrock returned no tool call")
        all_warnings = ["Model did not return a tool call - using fallback"] + error_warnings
        node = create_fallback_note(
            title="Captured Note",
            body=transcript,
            warnings=all_warnings
        )
        fallback_used = True
        tool_name = None
        
        node, time_warnings = normalize_node_times(node, timezone_offset)
        all_warnings.extend(time_warnings)
        node, validation_warnings, validation_fallback = validate_node(node, transcript)
        all_warnings.extend(validation_warnings)
        fallback_used = fallback_used or validation_fallback
        
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
        
        existing_warnings = node.get("global_warnings", [])
        node["global_warnings"] = list(set(existing_warnings + all_warnings))
        
        node_id = generate_node_id()
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
            node["global_warnings"].append(f"Storage failed: {str(e)}")
        
        nodes.append(node)
        node_ids.append(node_id)
        
        logger.info(json.dumps({
            "action": "ingest_complete",
            "node_id": node_id,
            "node_type": node.get("node_type"),
            "tool_used": tool_name,
            "latency_ms": latency_ms,
            "fallback_used": fallback_used,
            "user_id": user_id
        }))
    else:
        for tool_use in tool_uses:
            tool_name = tool_use.get("name")
            tool_input = tool_use.get("input")
            all_warnings = list(error_warnings)
            fallback_used = False
            
            if not tool_input:
                all_warnings.append("Model did not return a tool input - using fallback")
                node = create_fallback_note(
                    title="Captured Note",
                    body=transcript,
                    warnings=all_warnings
                )
                fallback_used = True
            else:
                node = tool_input
            
            node, time_warnings = normalize_node_times(node, timezone_offset)
            all_warnings.extend(time_warnings)
            node, validation_warnings, validation_fallback = validate_node(node, transcript)
            all_warnings.extend(validation_warnings)
            fallback_used = fallback_used or validation_fallback
            
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
            
            existing_warnings = node.get("global_warnings", [])
            node["global_warnings"] = list(set(existing_warnings + all_warnings))
            
            node_id = generate_node_id()
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
                node["global_warnings"].append(f"Storage failed: {str(e)}")
            
            nodes.append(node)
            node_ids.append(node_id)
            
            logger.info(json.dumps({
                "action": "ingest_complete",
                "node_id": node_id,
                "node_type": node.get("node_type"),
                "tool_used": tool_name,
                "latency_ms": latency_ms,
                "fallback_used": fallback_used,
                "user_id": user_id
            }))
    
    response_body = {
        "ok": True,
        "node_ids": node_ids,
        "nodes": nodes
    }
    
    if len(nodes) == 1:
        response_body["node_id"] = node_ids[0]
        response_body["node"] = nodes[0]
    
    return api_response(200, response_body)
