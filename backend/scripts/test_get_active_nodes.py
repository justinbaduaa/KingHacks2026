#!/usr/bin/env python3
"""
Test script for get_active_nodes API endpoint.

This script:
- Gets a Cognito token using PKCE flow (or uses provided token)
- Calls the GET /nodes/active API
- Prints all nodes for the authenticated user in a readable format

Usage:
  python test_get_active_nodes.py
  python test_get_active_nodes.py --token YOUR_ID_TOKEN
"""

import argparse
import json
import os
import subprocess
import sys
import time
from datetime import datetime
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


def format_datetime(iso_string):
    """Format ISO datetime string for display."""
    if not iso_string:
        return "N/A"
    try:
        dt = datetime.fromisoformat(iso_string.replace('Z', '+00:00'))
        return dt.strftime("%Y-%m-%d %H:%M:%S")
    except (ValueError, AttributeError):
        return iso_string


def print_node(node, index, total):
    """Print a single node in a readable format."""
    print(f"\n{'=' * 80}")
    print(f"Node {index + 1} of {total}")
    print(f"{'=' * 80}")
    
    print(f"Node ID:     {node.get('node_id', 'N/A')}")
    print(f"Type:        {node.get('node_type', 'N/A').upper()}")
    print(f"Title:       {node.get('title', 'N/A')}")
    print(f"Status:      {node.get('status', 'N/A')}")
    print(f"Created:     {format_datetime(node.get('created_at_iso'))}")
    print(f"Captured:    {format_datetime(node.get('captured_at_iso'))}")
    
    # Body
    body = node.get('body', '')
    if body:
        print(f"\nBody:")
        # Wrap long lines
        words = body.split()
        line = ""
        for word in words:
            if len(line + word) > 75:
                print(f"  {line}")
                line = word + " "
            else:
                line += word + " "
        if line:
            print(f"  {line}")
    
    # Tags
    tags = node.get('tags', [])
    if tags:
        print(f"\nTags:        {', '.join(tags)}")
    
    # Type-specific details
    node_type = node.get('node_type', '')
    
    if node_type == 'todo' and 'todo' in node:
        todo = node['todo']
        print(f"\nTodo Details:")
        print(f"  Task:           {todo.get('task', 'N/A')}")
        print(f"  Priority:       {todo.get('priority', 'N/A')}")
        print(f"  Status:         {todo.get('status_detail', 'N/A')}")
        if todo.get('due_datetime_iso'):
            print(f"  Due:            {format_datetime(todo['due_datetime_iso'])}")
        if todo.get('estimated_minutes'):
            print(f"  Est. Minutes:   {todo['estimated_minutes']}")
        if todo.get('project'):
            print(f"  Project:        {todo['project']}")
    
    elif node_type == 'reminder' and 'reminder' in node:
        reminder = node['reminder']
        print(f"\nReminder Details:")
        print(f"  Text:           {reminder.get('reminder_text', 'N/A')}")
        print(f"  Priority:       {reminder.get('priority', 'N/A')}")
        if reminder.get('trigger_datetime_iso'):
            print(f"  Trigger:        {format_datetime(reminder['trigger_datetime_iso'])}")
    
    elif node_type == 'calendar_placeholder' and 'calendar_placeholder' in node:
        cal = node['calendar_placeholder']
        print(f"\nCalendar Details:")
        print(f"  Event Title:    {cal.get('event_title', 'N/A')}")
        print(f"  Intent:         {cal.get('intent', 'N/A')}")
        if cal.get('start_datetime_iso'):
            print(f"  Start:          {format_datetime(cal['start_datetime_iso'])}")
        if cal.get('end_datetime_iso'):
            print(f"  End:            {format_datetime(cal['end_datetime_iso'])}")
        if cal.get('duration_minutes'):
            print(f"  Duration:       {cal['duration_minutes']} minutes")
    
    elif node_type == 'note' and 'note' in node:
        note = node['note']
        print(f"\nNote Details:")
        print(f"  Content:        {note.get('content', 'N/A')[:100]}...")
        print(f"  Category:       {note.get('category_hint', 'N/A')}")
        print(f"  Pinned:         {note.get('pin', False)}")
    
    # Confidence and warnings
    confidence = node.get('confidence')
    if confidence is not None:
        print(f"\nConfidence:   {confidence * 100:.1f}%")
    
    warnings = node.get('global_warnings', [])
    if warnings:
        print(f"\nWarnings ({len(warnings)}):")
        for warning in warnings:
            print(f"  ⚠️  {warning}")


def call_get_active_nodes(api_url, token):
    """Call the get_active_nodes API endpoint."""
    url = f"{api_url.rstrip('/')}/nodes/active"
    
    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }
    
    print(f"\n=== Get Active Nodes Request ===")
    print(f"URL: {url}")
    print(f"Method: GET")
    
    start = time.monotonic()
    response = requests.get(url, headers=headers, timeout=30)
    duration_ms = int((time.monotonic() - start) * 1000)
    
    print(f"\n=== Response ===")
    print(f"Status Code: {response.status_code}")
    print(f"HTTP Latency: {duration_ms} ms")
    
    try:
        data = response.json()
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
    parser = argparse.ArgumentParser(description="Test get_active_nodes API endpoint")
    parser.add_argument("--api-url", default=os.environ.get("API_URL"))
    parser.add_argument("--stack-name", default=os.environ.get("STACK_NAME", "second-brain-backend-evan"))
    parser.add_argument("--token", default=os.environ.get("ID_TOKEN") or os.environ.get("ACCESS_TOKEN"))
    parser.add_argument("--token-type", choices=["id", "access"], default="id")
    parser.add_argument("--auth-config", default=os.environ.get("AUTH_CONFIG"))
    parser.add_argument("--no-browser", action="store_true", help="Do not open the browser automatically")
    parser.add_argument("--json", action="store_true", help="Output raw JSON instead of formatted")
    
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
    
    # Call the API
    response, data, latency_ms = call_get_active_nodes(api_url, token)
    
    # Handle response
    if response.status_code != 200:
        print(f"\n❌ FAILED: HTTP {response.status_code}")
        if data and 'error' in data:
            print(f"Error: {data['error']}")
        sys.exit(1)
    
    if not data:
        print("\n❌ No data in response")
        sys.exit(1)
    
    # Print results
    print(f"\n{'=' * 80}")
    print(f"RESULTS")
    print(f"{'=' * 80}")
    
    nodes = data.get("nodes", [])
    node_ids = data.get("node_ids", [])
    count = data.get("count", len(nodes))
    
    print(f"\nTotal Nodes: {count}")
    print(f"Node IDs: {len(node_ids)}")
    
    if args.json:
        # Output raw JSON
        print(f"\n=== Raw JSON ===")
        print(json.dumps(data, indent=2))
    else:
        # Print formatted nodes
        if not nodes:
            print("\n📭 No nodes found for this user.")
        else:
            print(f"\nShowing {len(nodes)} node(s):")
            for i, node in enumerate(nodes):
                print_node(node, i, len(nodes))
            
            print(f"\n{'=' * 80}")
            print(f"SUMMARY")
            print(f"{'=' * 80}")
            print(f"Total nodes retrieved: {len(nodes)}")
            print(f"Node IDs: {', '.join(node_ids[:10])}" + (f" ... and {len(node_ids) - 10} more" if len(node_ids) > 10 else ""))


if __name__ == "__main__":
    main()
