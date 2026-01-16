#!/usr/bin/env python3
"""
Interactive Microsoft OAuth tester using backend redirect.

Usage:
  python test_microsoft_oauth_code.py
"""

import argparse
import json
import os
import sys
import time
import webbrowser
from pathlib import Path

import requests

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


def main() -> int:
    parser = argparse.ArgumentParser(description="Test Microsoft OAuth flow")
    parser.add_argument("--api-url", default=os.environ.get("API_URL"))
    parser.add_argument("--stack-name", default=os.environ.get("STACK_NAME", "second-brain-backend-evan"))
    parser.add_argument("--token", default=os.environ.get("ID_TOKEN") or os.environ.get("ACCESS_TOKEN"))
    parser.add_argument("--auth-config")
    parser.add_argument("--no-open", action="store_true")
    parser.add_argument("--timeout", type=int, default=120)
    args = parser.parse_args()

    api_url = args.api_url or get_stack_output(args.stack_name, "ApiEndpoint")
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

    if not api_url.endswith("/"):
        api_url += "/"

    start_url = f"{api_url}integrations/microsoft/start"
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    response = requests.post(start_url, headers=headers, data="{}", timeout=30)
    if response.status_code >= 300:
        print("ERROR: Failed to start Microsoft OAuth", file=sys.stderr)
        print(response.text)
        return 2

    payload = response.json()
    auth_url = payload.get("auth_url")
    redirect_uri = payload.get("redirect_uri")
    print("Open this URL to authenticate with Microsoft:")
    print(auth_url)
    print(f"Redirect URI: {redirect_uri}")
    if not args.no_open:
        try:
            webbrowser.open(auth_url)
        except Exception:
            pass

    token_url = f"{api_url}integrations/microsoft/token"
    print("Waiting for Microsoft connection...")
    deadline = time.time() + args.timeout
    while time.time() < deadline:
        status = requests.get(token_url, headers=headers, timeout=15)
        if status.status_code < 300:
            data = status.json()
            if data.get("connected"):
                print("Microsoft connected.")
                print(json.dumps(data, indent=2))
                return 0
        time.sleep(2)

    print("Timed out waiting for Microsoft connection.")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
