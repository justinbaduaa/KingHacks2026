#!/usr/bin/env python3
"""
Test Google OAuth login + backend code exchange.

This script:
- Opens Google OAuth in the system browser (PKCE)
- Captures the authorization code on the loopback redirect
- Calls POST /integrations/google/code with {code, code_verifier, redirect_uri}

Usage:
  python test_google_oauth_code.py
  python test_google_oauth_code.py --no-browser
  python test_google_oauth_code.py --token YOUR_ID_TOKEN
"""

import argparse
import base64
import hashlib
import http.server
import json
import os
import sys
import threading
import time
import urllib.parse
import webbrowser
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


GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"


def base64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def build_google_auth_url(config, code_challenge: str, state: str) -> str:
    params = {
        "response_type": "code",
        "client_id": config["clientId"],
        "redirect_uri": config["redirectUri"],
        "scope": " ".join(config.get("scopes", [])),
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "state": state,
        "access_type": config.get("accessType", "offline"),
        "prompt": config.get("prompt", "consent"),
        "include_granted_scopes": "true",
    }
    query = urllib.parse.urlencode(params)
    return f"{GOOGLE_AUTH_URL}?{query}"


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


def wait_for_code(redirect_uri: str, state: str, timeout_sec: int = 300) -> str:
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


def main():
    parser = argparse.ArgumentParser(description="Test Google OAuth backend code exchange")
    parser.add_argument("--api-url", default=os.environ.get("API_URL"))
    parser.add_argument("--stack-name", default=os.environ.get("STACK_NAME", "second-brain-backend-evan"))
    parser.add_argument("--token", default=os.environ.get("ID_TOKEN") or os.environ.get("ACCESS_TOKEN"))
    parser.add_argument("--token-type", choices=["id", "access"], default="id")
    parser.add_argument("--auth-config", default=os.environ.get("AUTH_CONFIG"))
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()

    auth_config_path = args.auth_config
    if not auth_config_path:
        repo_root = Path(__file__).resolve().parents[2]
        auth_config_path = repo_root / "frontend" / "auth.config.json"

    config = load_auth_config(auth_config_path)
    if not config:
        print(f"ERROR: Could not load auth config from {auth_config_path}")
        sys.exit(1)

    google_config = config.get("google") or {}
    if not google_config.get("clientId") or not google_config.get("redirectUri"):
        print("ERROR: Missing google clientId or redirectUri in auth.config.json")
        sys.exit(1)

    api_url = args.api_url
    if not api_url:
        api_url = get_stack_output(args.stack_name, "ApiEndpoint")
        if not api_url:
            print("ERROR: Could not resolve API URL.")
            sys.exit(1)

    token = args.token
    if not token:
        tokens = get_tokens_via_pkce(config, open_browser=not args.no_browser)
        token = tokens.get("id_token") if args.token_type == "id" else tokens.get("access_token")
        if not token:
            print("ERROR: Token missing from OAuth response.")
            sys.exit(1)

    verifier = base64url(os.urandom(32))
    challenge = base64url(hashlib.sha256(verifier.encode("utf-8")).digest())
    state = base64url(os.urandom(16))

    auth_url = build_google_auth_url(google_config, challenge, state)
    print("\nOpen this URL to authenticate with Google:")
    print(auth_url)

    if not args.no_browser:
        webbrowser.open(auth_url)

    print("\nWaiting for OAuth callback...")
    code = wait_for_code(google_config["redirectUri"], state)
    print("Authorization code received.")

    payload = {
        "code": code,
        "code_verifier": verifier,
        "redirect_uri": google_config["redirectUri"],
    }

    headers = {
        "Authorization": f"Bearer {token}",
        "Content-Type": "application/json",
    }

    if not api_url.endswith("/"):
        api_url += "/"
    url = f"{api_url}integrations/google/code"

    print("\n=== Backend Exchange ===")
    response = requests.post(url, headers=headers, json=payload, timeout=30)
    print(f"Status: {response.status_code}")
    try:
        print(json.dumps(response.json(), indent=2))
    except ValueError:
        print(response.text)


if __name__ == "__main__":
    main()
