#!/usr/bin/env python3
"""
Full ingest pipeline test with Cognito OAuth (PKCE) and detailed output.

This script:
- Gets a Cognito token using the same PKCE flow as the Electron app, or uses a provided token
- Calls the /ingest API with a transcript
- Prints HTTP latency, model latency, warnings, and fallback status

Usage:
  python test_ingest_full.py --transcript "Remind me to call Sarah tomorrow at 3pm"
  python test_ingest_full.py --token YOUR_ID_TOKEN
  python test_ingest_full.py --token YOUR_ACCESS_TOKEN --token-type access
"""

import argparse
import base64
import hashlib
import http.server
import json
import os
import subprocess
import sys
import threading
import time
import urllib.parse
import webbrowser
from datetime import datetime, timezone
from pathlib import Path

try:
    import requests
except ImportError:
    print("ERROR: 'requests' library not found. Install with: pip install requests", file=sys.stderr)
    sys.exit(1)


def get_stack_output(stack_name, output_key):
    """Get CloudFormation stack output."""
    try:
        result = subprocess.run(
            [
                "aws", "cloudformation", "describe-stacks",
                "--stack-name", stack_name,
                "--query", f"Stacks[0].Outputs[?OutputKey=='{output_key}'].OutputValue",
                "--output", "text"
            ],
            capture_output=True,
            text=True,
            check=True
        )
        value = result.stdout.strip()
        return value if value and value != "None" else None
    except subprocess.CalledProcessError:
        return None


def load_auth_config(config_path):
    """Load frontend auth.config.json."""
    config_file = Path(config_path)
    if not config_file.exists():
        return None
    with config_file.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def base64url(data):
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def build_auth_url(config, code_challenge, state):
    params = {
        "response_type": "code",
        "client_id": config["clientId"],
        "redirect_uri": config["redirectUri"],
        "scope": " ".join(config.get("scopes", ["openid", "email", "profile"])),
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
    }
    query = urllib.parse.urlencode(params)
    return f"https://{config['domain']}/oauth2/authorize?{query}"


def exchange_code_for_tokens(config, code, verifier):
    data = {
        "grant_type": "authorization_code",
        "client_id": config["clientId"],
        "redirect_uri": config["redirectUri"],
        "code": code,
        "code_verifier": verifier,
    }
    token_url = f"https://{config['domain']}/oauth2/token"
    response = requests.post(token_url, data=data, timeout=20)
    if response.status_code != 200:
        raise RuntimeError(f"Token exchange failed: {response.status_code} {response.text}")
    payload = response.json()
    expires_at = int(time.time()) + int(payload.get("expires_in", 3600))
    return {
        "access_token": payload.get("access_token"),
        "id_token": payload.get("id_token"),
        "refresh_token": payload.get("refresh_token"),
        "expires_at": expires_at,
        "token_type": payload.get("token_type"),
    }


class OAuthCallbackHandler(http.server.BaseHTTPRequestHandler):
    expected_state = None
    result = {"code": None, "error": None}

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        params = urllib.parse.parse_qs(parsed.query)
        code = params.get("code", [None])[0]
        state = params.get("state", [None])[0]

        if self.expected_state and state != self.expected_state:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Invalid state")
            self.result["error"] = "Invalid OAuth state"
            return

        if not code:
            self.send_response(400)
            self.end_headers()
            self.wfile.write(b"Missing authorization code")
            self.result["error"] = "Missing authorization code"
            return

        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Authenticated. You can close this window.")
        self.result["code"] = code

    def log_message(self, format, *args):
        return


def wait_for_code(redirect_uri, state, timeout_sec=300):
    target = urllib.parse.urlparse(redirect_uri)
    host = target.hostname or "127.0.0.1"
    port = target.port or 80

    OAuthCallbackHandler.expected_state = state
    OAuthCallbackHandler.result = {"code": None, "error": None}

    httpd = http.server.HTTPServer((host, port), OAuthCallbackHandler)

    def serve_one():
        httpd.handle_request()

    thread = threading.Thread(target=serve_one, daemon=True)
    thread.start()

    start = time.time()
    while time.time() - start < timeout_sec:
        if OAuthCallbackHandler.result["code"] or OAuthCallbackHandler.result["error"]:
            break
        time.sleep(0.1)

    httpd.server_close()

    if OAuthCallbackHandler.result["error"]:
        raise RuntimeError(OAuthCallbackHandler.result["error"])
    if not OAuthCallbackHandler.result["code"]:
        raise RuntimeError("Timed out waiting for OAuth callback")

    return OAuthCallbackHandler.result["code"]


def get_tokens_via_pkce(config, open_browser=True):
    verifier = base64url(os.urandom(32))
    challenge = base64url(hashlib.sha256(verifier.encode("utf-8")).digest())
    state = base64url(os.urandom(16))

    auth_url = build_auth_url(config, challenge, state)
    print("\nOpen this URL to authenticate:")
    print(auth_url)

    if open_browser:
        webbrowser.open(auth_url)

    print("\nWaiting for OAuth callback...")
    code = wait_for_code(config["redirectUri"], state)
    print("Authorization code received.")

    return exchange_code_for_tokens(config, code, verifier)


def format_duration_ms(seconds):
    return int(seconds * 1000)


def call_ingest(api_url, token, transcript):
    if not api_url.endswith("/"):
        api_url += "/"
    url = f"{api_url}ingest"

    payload = {
        "transcript": transcript,
        "user_time_iso": datetime.now(timezone.utc).isoformat(),
        "user_id": "test-user",
        "user_location": {"kind": "unknown"},
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    start = time.monotonic()
    response = requests.post(url, headers=headers, json=payload, timeout=60)
    duration_ms = format_duration_ms(time.monotonic() - start)
    return response, duration_ms


def summarize_nodes(nodes):
    for idx, node in enumerate(nodes, start=1):
        node_type = node.get("node_type", "unknown")
        node_title = node.get("title") or node.get("body") or ""
        parse_debug = node.get("parse_debug", {})
        warnings = node.get("global_warnings", [])

        print(f"\nNode {idx}:")
        print(f"  Type: {node_type}")
        print(f"  Title: {node_title}")
        if parse_debug:
            print(f"  Model: {parse_debug.get('model_id', 'N/A')}")
            print(f"  Tool Used: {parse_debug.get('tool_name_used', 'N/A')}")
            print(f"  Model Latency: {parse_debug.get('latency_ms', 0)} ms")
            print(f"  Fallback Used: {parse_debug.get('fallback_used', False)}")
        if warnings:
            print(f"  Warnings ({len(warnings)}):")
            for warning in warnings:
                print(f"    - {warning}")


def main():
    parser = argparse.ArgumentParser(description="Full ingest pipeline test with Cognito PKCE auth")
    parser.add_argument("--transcript", default=(
        "Remind me to email Sarah tomorrow morning about the project update, "
        "schedule a meeting with the design team next Tuesday afternoon, "
        "and add a task to review competitor pricing by Friday."
    ))
    parser.add_argument("--api-url", default=os.environ.get("API_URL"))
    parser.add_argument("--stack-name", default=os.environ.get("STACK_NAME", "second-brain-backend-evan"))
    parser.add_argument("--token", default=os.environ.get("ID_TOKEN") or os.environ.get("ACCESS_TOKEN"))
    parser.add_argument("--token-type", choices=["id", "access"], default="id")
    parser.add_argument("--auth-config", default=os.environ.get("AUTH_CONFIG"))
    parser.add_argument("--no-browser", action="store_true", help="Do not open the browser automatically")

    args = parser.parse_args()

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

    print("\n=== Ingest Request ===")
    print(f"API URL: {api_url}")
    print(f"Transcript: {args.transcript}")

    response, http_latency_ms = call_ingest(api_url, token, args.transcript)
    print(f"\nHTTP Status: {response.status_code}")
    print(f"HTTP Latency: {http_latency_ms} ms")

    try:
        data = response.json()
    except ValueError:
        print("Response was not JSON:")
        print(response.text)
        sys.exit(1)

    print("\n=== Raw Response ===")
    print(json.dumps(data, indent=2))

    nodes = data.get("nodes") or ([] if not data.get("node") else [data.get("node")])
    if not nodes:
        print("\nNo nodes returned in response.")
        sys.exit(1)

    print("\n=== Summary ===")
    print(f"Nodes Returned: {len(nodes)}")
    summarize_nodes(nodes)


if __name__ == "__main__":
    main()
