/**
 * OAuth Loopback Server for Google PKCE Authentication
 *
 * This module implements the OAuth 2.0 authorization code flow with PKCE
 * (Proof Key for Code Exchange) for desktop applications.
 *
 * Flow:
 * 1. Generate code_verifier and code_challenge
 * 2. Start local HTTP server on loopback address
 * 3. Open browser to Google OAuth consent screen
 * 4. Capture authorization code from redirect
 * 5. Exchange code for tokens
 */

const http = require("http");
const crypto = require("crypto");
const { URL } = require("url");
const { shell } = require("electron");

const OAUTH_PORT = 4387;
const REDIRECT_URI = `http://127.0.0.1:${OAUTH_PORT}`;

// Google OAuth Client credentials (loaded from environment variables)
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Scopes for Gmail and Calendar access
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/gmail.send",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

/**
 * Generate a cryptographically secure random string for PKCE code_verifier.
 * Per RFC 7636, must be 43-128 characters using [A-Z], [a-z], [0-9], "-", ".", "_", "~"
 */
function generateCodeVerifier() {
  return crypto.randomBytes(32).toString("base64url");
}

/**
 * Generate code_challenge from code_verifier using SHA256.
 * Per RFC 7636, this is BASE64URL(SHA256(code_verifier))
 */
function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

/**
 * OAuth Server class that handles the loopback authentication flow.
 */
class OAuthServer {
  constructor() {
    this.server = null;
    this.pendingResolve = null;
    this.pendingReject = null;
    this.codeVerifier = null;
    this.timeoutId = null;
  }

  /**
   * Start the OAuth authentication flow.
   * Returns a promise that resolves with { code, codeVerifier } on success.
   */
  startAuthFlow() {
    return new Promise((resolve, reject) => {
      this.pendingResolve = resolve;
      this.pendingReject = reject;

      // Generate PKCE values
      this.codeVerifier = generateCodeVerifier();
      const codeChallenge = generateCodeChallenge(this.codeVerifier);

      // Start local server to receive callback
      this.startServer();

      // Build authorization URL
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", REDIRECT_URI);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set("scope", SCOPES);
      authUrl.searchParams.set("code_challenge", codeChallenge);
      authUrl.searchParams.set("code_challenge_method", "S256");
      authUrl.searchParams.set("access_type", "offline"); // Get refresh token
      authUrl.searchParams.set("prompt", "consent"); // Always show consent to get refresh token

      // Open in default browser
      shell.openExternal(authUrl.toString());

      // Set timeout (2 minutes)
      this.timeoutId = setTimeout(() => {
        this.cleanup();
        reject(new Error("OAuth flow timed out"));
      }, 120000);
    });
  }

  /**
   * Start the local HTTP server to capture the OAuth callback.
   */
  startServer() {
    this.server = http.createServer((req, res) => {
      // Parse the callback URL
      const url = new URL(req.url, REDIRECT_URI);
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");

      // Handle error from Google
      if (error) {
        const errorDescription =
          url.searchParams.get("error_description") || error;
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Authentication Failed</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff; }
              .container { text-align: center; }
              h1 { color: #ff4444; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Authentication Failed</h1>
              <p>${errorDescription}</p>
              <p>You can close this window.</p>
            </div>
          </body>
          </html>
        `);
        this.cleanup();
        this.pendingReject(new Error(errorDescription));
        return;
      }

      // Handle successful authorization
      if (code) {
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head>
            <title>Success!</title>
            <style>
              body { font-family: -apple-system, BlinkMacSystemFont, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #1a1a1a; color: #fff; }
              .container { text-align: center; }
              h1 { color: #34C759; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>Success!</h1>
              <p>Google account connected successfully.</p>
              <p>You can close this window and return to SecondBrain.</p>
            </div>
          </body>
          </html>
        `);
        this.cleanup();
        this.pendingResolve({ code, codeVerifier: this.codeVerifier });
        return;
      }

      // Handle other requests (favicon, etc.)
      res.writeHead(404);
      res.end();
    });

    this.server.listen(OAUTH_PORT, "127.0.0.1");
  }

  /**
   * Clean up resources (server and timeout).
   */
  cleanup() {
    if (this.timeoutId) {
      clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }
    if (this.server) {
      this.server.close();
      this.server = null;
    }
  }
}

/**
 * Exchange authorization code for tokens.
 * @param {string} code - The authorization code from Google
 * @param {string} codeVerifier - The PKCE code verifier
 * @returns {Promise<Object>} Token response containing access_token, refresh_token, etc.
 */
async function exchangeCodeForTokens(code, codeVerifier) {
  const tokenUrl = "https://oauth2.googleapis.com/token";

  const params = new URLSearchParams({
    client_id: GOOGLE_CLIENT_ID,
    client_secret: GOOGLE_CLIENT_SECRET,
    code: code,
    code_verifier: codeVerifier,
    grant_type: "authorization_code",
    redirect_uri: REDIRECT_URI,
  });

  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(
      errorData.error_description || errorData.error || "Token exchange failed"
    );
  }

  return response.json();
}

/**
 * Decode a JWT token without verification (for extracting claims).
 * @param {string} token - The JWT token
 * @returns {Object} The decoded payload
 */
function decodeJWT(token) {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = Buffer.from(parts[1], "base64url").toString("utf8");
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

module.exports = {
  OAuthServer,
  exchangeCodeForTokens,
  decodeJWT,
  GOOGLE_CLIENT_ID,
  REDIRECT_URI,
};
