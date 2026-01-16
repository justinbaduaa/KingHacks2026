#!/usr/bin/env python3
"""
Test script for Microsoft Outlook email execution.

Usage:
  python test_ms_email_execute.py --to someone@example.com --subject "Hello" --body "Hi"
"""

import argparse
import json
import os
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library not found. Install with: pip install requests", file=sys.stderr)
    sys.exit(1)

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


def generate_node_id():
    import uuid

    timestamp_hex = hex(int(time.time() * 1000))[2:]
    random_suffix = uuid.uuid4().hex[:8]
    return f"node_{timestamp_hex}_{random_suffix}"


def build_email_node(node_id, subject, body, to_email=None, to_name=None):
    now_iso = datetime.now(timezone.utc).isoformat()
    payload = {
        "subject": subject,
        "body": body,
        "send_mode": "send",
    }
    if to_email:
        payload["to_email"] = to_email
    if to_name:
        payload["to_name"] = to_name

    return {
        "schema_version": "braindump.node.v1",
        "node_type": "ms_email",
        "title": subject[:120],
        "body": body[:4000],
        "tags": ["ms", "email"],
        "status": "active",
        "confidence": 0.9,
        "evidence": [{"quote": "Test Microsoft email"}],
        "location_context": {"location_used": False},
        "time_interpretation": {
            "original_text": "now",
            "kind": "unspecified",
            "needs_clarification": False,
        },
        "ms_email": payload,
        "global_warnings": [],
        "created_at_iso": now_iso,
        "captured_at_iso": now_iso,
        "timezone": "+00:00",
        "node_id": node_id,
        "parse_debug": {
            "model_id": "test-script",
            "latency_ms": 0,
            "tool_name_used": "test",
            "fallback_used": False,
        },
    }


def resolve_api_url(stack_name, api_url):
    if api_url:
        return api_url
    return get_stack_output(stack_name, "ApiEndpoint")


def call_api(api_url, token, node, node_id, mode):
    if not api_url.endswith("/"):
        api_url += "/"
    if mode == "execute":
        url = f"{api_url}node/{node_id}/execute"
    else:
        url = f"{api_url}node/{node_id}/complete"

    payload = {
        "node": node,
        "node_id": node_id,
        "captured_at_iso": node.get("captured_at_iso"),
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    print(f"\n=== Request ===")
    print(f"URL: {url}")
    print(f"Mode: {mode}")
    print(f"Node ID: {node_id}")

    response = requests.post(url, headers=headers, json=payload, timeout=30)
    print(f"\n=== Response ===")
    print(f"Status Code: {response.status_code}")
    try:
        data = response.json()
        print(json.dumps(data, indent=2))
    except ValueError:
        print(response.text)
        data = None

    return response, data


def main() -> int:
    parser = argparse.ArgumentParser(description="Test Microsoft email execution")
    parser.add_argument("--api-url", default=os.environ.get("API_URL"))
    parser.add_argument("--stack-name", default=os.environ.get("STACK_NAME", "second-brain-backend-evan"))
    parser.add_argument("--token", default=os.environ.get("ID_TOKEN") or os.environ.get("ACCESS_TOKEN"))
    parser.add_argument("--auth-config")
    parser.add_argument("--mode", choices=["complete", "execute"], default="complete")
    parser.add_argument("--to", dest="to_email")
    parser.add_argument("--to-name")
    parser.add_argument("--subject", default="Test Microsoft Email")
    parser.add_argument("--body", default="Hello from Microsoft Outlook integration.")
    args = parser.parse_args()

    api_url = resolve_api_url(args.stack_name, args.api_url)
    if not api_url:
        print("ERROR: API URL not found. Set API_URL or STACK_NAME.", file=sys.stderr)
        return 1

    token = args.token
    if not token:
        auth_config_path = args.auth_config
        if not auth_config_path:
            repo_root = Path(__file__).resolve().parents[2]
            auth_config_path = repo_root / "frontend" / "auth.config.json"
        auth_config = load_auth_config(auth_config_path)
        if not auth_config:
            print(f"ERROR: Could not load auth config from {auth_config_path}", file=sys.stderr)
            return 1
        tokens = get_tokens_via_pkce(auth_config)
        token = tokens.get("id_token")
    if not token:
        print("ERROR: Could not obtain auth token.", file=sys.stderr)
        return 1

    node_id = generate_node_id()
    node = build_email_node(
        node_id=node_id,
        subject=args.subject,
        body=args.body,
        to_email=args.to_email,
        to_name=args.to_name,
    )

    response, _ = call_api(api_url, token, node, node_id, args.mode)
    return 0 if response.status_code < 300 else 2


if __name__ == "__main__":
    raise SystemExit(main())
