#!/usr/bin/env python3
"""
Test script for complete_node API endpoint.

This script:
- Gets a Cognito token using PKCE flow (or uses provided token)
- Creates a test node with all required fields
- Calls the /node/{node_id}/complete API
- Logs the request and response

Usage:
  python test_complete_node.py
  python test_complete_node.py --token YOUR_ID_TOKEN
  python test_complete_node.py --node-id node_abc123
"""

import argparse
import base64
import json
import os
import subprocess
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library not found. Install with: pip install requests", file=sys.stderr)
    sys.exit(1)

# Import auth utilities from the test_ingest_full script
sys.path.insert(0, str(Path(__file__).parent))
try:
    from test_ingest_full import (
        get_stack_output,
        load_auth_config,
        get_tokens_via_pkce,
    )
except ImportError:
    print("ERROR: Could not import from test_ingest_full.py. Make sure it exists.", file=sys.stderr)
    sys.exit(1)

# Import verify_token from lib/auth
sys.path.insert(0, str(Path(__file__).parent.parent / "src"))
try:
    from lib.auth import verify_token
except ImportError:
    print("ERROR: Could not import verify_token from lib.auth", file=sys.stderr)
    sys.exit(1)


def generate_node_id():
    """Generate a test node ID."""
    import uuid
    timestamp_hex = hex(int(time.time() * 1000))[2:]
    random_suffix = uuid.uuid4().hex[:8]
    return f"node_{timestamp_hex}_{random_suffix}"


def create_test_node(node_id, user_id):
    """Create a test node with all required fields."""
    now_iso = datetime.now(timezone.utc).isoformat()
    
    node = {
        "schema_version": "braindump.node.v1",
        "node_type": "todo",
        "title": "Test Task from complete_node script",
        "body": "This is a test task created by the complete_node test script",
        "tags": ["test", "script"],
        "status": "active",
        "confidence": 0.95,
        "evidence": [
            {
                "quote": "Test task created by script",
                "word_time_range": {
                    "start_ms": 0,
                    "end_ms": 1000
                }
            }
        ],
        "time_interpretation": {
            "original_text": "now",
            "kind": "unspecified",
            "needs_clarification": False,
            "resolved_start_iso": now_iso,
            "resolved_end_iso": None
        },
        "location_context": {
            "location_used": False
        },
        "todo": {
            "task": "Test task created by complete_node script",
            "priority": "normal",
            "status_detail": "open",
            "due": {
                "original_text": "no due date",
                "kind": "unspecified",
                "needs_clarification": False
            }
        },
        "created_at_iso": now_iso,
        "captured_at_iso": now_iso,
        "timezone": "+00:00",
        "node_id": node_id,
        "parse_debug": {
            "model_id": "test-script",
            "latency_ms": 0,
            "tool_name_used": "test",
            "fallback_used": False
        },
        "global_warnings": []
    }
    
    return node


def call_complete_node(api_url, token, node, node_id):
    """Call the complete_node API endpoint."""
    url = f"{api_url.rstrip('/')}/node/{node_id}/complete"
    
    payload = {
        "node": node,
        "node_id": node_id,
        "captured_at_iso": node.get("captured_at_iso") or datetime.now(timezone.utc).isoformat(),
    }
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    print(f"\n=== Complete Node Request ===")
    print(f"URL: {url}")
    print(f"Method: POST")
    print(f"Node ID: {node_id}")
    print(f"Payload (node keys): {list(node.keys())}")
    
    start = time.monotonic()
    response = requests.post(url, headers=headers, json=payload, timeout=30)
    duration_ms = int((time.monotonic() - start) * 1000)
    
    print(f"\n=== Response ===")
    print(f"Status Code: {response.status_code}")
    print(f"HTTP Latency: {duration_ms} ms")
    
    try:
        data = response.json()
        print(f"Response Body:")
        print(json.dumps(data, indent=2))
        return response, data, duration_ms
    except ValueError:
        print(f"Response was not JSON:")
        print(response.text)
        return response, None, duration_ms


def extract_user_id_from_token(token):
    """Extract user ID (sub claim) from JWT token."""
    try:
        claims = verify_token(token)
        user_id = claims.get("sub", "")
        if not user_id:
            print("WARNING: Could not extract 'sub' claim from token")
        return user_id
    except Exception as e:
        print(f"WARNING: Could not decode token to get user_id: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(description="Test complete_node API endpoint")
    parser.add_argument("--api-url", default=os.environ.get("API_URL"))
    parser.add_argument("--stack-name", default=os.environ.get("STACK_NAME", "second-brain-backend-evan"))
    parser.add_argument("--token", default=os.environ.get("ID_TOKEN") or os.environ.get("ACCESS_TOKEN"))
    parser.add_argument("--token-type", choices=["id", "access"], default="id")
    parser.add_argument("--auth-config", default=os.environ.get("AUTH_CONFIG"))
    parser.add_argument("--node-id", default=None, help="Node ID to use (will generate if not provided)")
    parser.add_argument("--no-browser", action="store_true", help="Do not open the browser automatically")
    
    args = parser.parse_args()
    
    # Resolve auth config
    auth_config_path = args.auth_config
    if not auth_config_path:
        repo_root = Path(__file__).resolve().parents[2]
        auth_config_path = repo_root / "frontend" / "auth.config.json"
    
    # Resolve API URL
    api_url = args.api_url
    if not api_url:
        print("Fetching API URL from CloudFormation stack...")
        api_url = get_stack_output(args.stack_name, "ApiEndpoint")
        if not api_url:
            print("ERROR: Could not resolve API URL.")
            sys.exit(1)
    
    # Resolve token
    token = args.token
    if not token:
        config = load_auth_config(auth_config_path)
        if not config:
            print(f"ERROR: Could not load auth config from {auth_config_path}")
            sys.exit(1)
        print(f"Using auth config: {auth_config_path}")
        tokens = get_tokens_via_pkce(config, open_browser=not args.no_browser)
        token = tokens.get("id_token") if args.token_type == "id" else tokens.get("access_token")
        if not token:
            print("ERROR: Token missing from OAuth response.")
            sys.exit(1)
    else:
        print("Using provided token.")
    
    # Extract user ID from token
    print("\n=== Token Info ===")
    user_id = extract_user_id_from_token(token)
    if user_id:
        print(f"User ID (from token): {user_id}")
    else:
        print("WARNING: Could not extract user ID from token")
        user_id = "unknown-user"
    
    # Generate or use provided node ID
    node_id = args.node_id or generate_node_id()
    print(f"\n=== Test Node ===")
    print(f"Node ID: {node_id}")
    
    # Create test node
    node = create_test_node(node_id, user_id)
    print(f"Node Type: {node['node_type']}")
    print(f"Node Title: {node['title']}")
    print(f"Created At: {node['created_at_iso']}")
    print(f"Captured At: {node['captured_at_iso']}")
    
    # Call the API
    response, data, latency_ms = call_complete_node(api_url, token, node, node_id)
    
    # Summary
    print(f"\n=== Summary ===")
    if response.status_code == 200:
        print("✅ SUCCESS: Node saved to DynamoDB")
        if data:
            print(f"Response OK: {data.get('ok', False)}")
            print(f"Message: {data.get('message', 'N/A')}")
            if data.get('node_id'):
                print(f"Saved Node ID: {data['node_id']}")
    else:
        print(f"❌ FAILED: HTTP {response.status_code}")
        if data and 'error' in data:
            print(f"Error: {data['error']}")
    
    print(f"\nYou can now check DynamoDB in AWS Console to verify the node was saved.")
    print(f"Look for:")
    print(f"  - pk: user#{user_id}")
    print(f"  - sk: day#YYYY-MM-DD#node#{node_id}")


if __name__ == "__main__":
    main()
