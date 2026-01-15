const { shell } = require("electron");
const crypto = require("crypto");
const http = require("http");
const https = require("https");
const { URL, URLSearchParams } = require("url");

const { loadConfig } = require("./auth");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DEFAULT_SCOPES = ["openid", "email", "profile"];

function base64url(buffer) {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function decodeJwt(token) {
  const payload = token.split(".")[1];
  if (!payload) {
    return {};
  }
  const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
  return JSON.parse(Buffer.from(padded, "base64").toString("utf-8"));
}

function loadGoogleConfig() {
  const config = loadConfig();
  const google = config.google || config.googleOauth || config.googleOAuth;
  if (!google) {
    throw new Error("Missing google config in auth.config.json");
  }
  if (!google.clientId || !google.redirectUri) {
    throw new Error("Missing google clientId or redirectUri");
  }
  console.log("[GOOGLE] OAuth config:", {
    clientId: google.clientId,
    redirectUri: google.redirectUri,
    scopes: google.scopes,
    clientSecretPresent: Boolean(google.clientSecret || process.env.GOOGLE_CLIENT_SECRET),
  });
  return {
    clientId: google.clientId,
    clientSecret: google.clientSecret || process.env.GOOGLE_CLIENT_SECRET,
    redirectUri: google.redirectUri,
    scopes: google.scopes && google.scopes.length ? google.scopes : DEFAULT_SCOPES,
    accessType: google.accessType || "offline",
    prompt: google.prompt || "consent",
  };
}

function buildAuthUrl(config, codeChallenge, state) {
  const url = new URL(GOOGLE_AUTH_URL);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("scope", config.scopes.join(" "));
  url.searchParams.set("code_challenge", codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  url.searchParams.set("state", state);
  url.searchParams.set("access_type", config.accessType);
  url.searchParams.set("prompt", config.prompt);
  url.searchParams.set("include_granted_scopes", "true");
  return url.toString();
}

function startCallbackServer(redirectUri, expectedState) {
  const target = new URL(redirectUri);
  const port = parseInt(target.port, 10) || 80;
  const hostname = target.hostname;
  const expectedPath = target.pathname;

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      if (expectedPath && url.pathname !== expectedPath) {
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
        return;
      }

      const code = url.searchParams.get("code");
      const state = url.searchParams.get("state");

      if (state && state !== expectedState) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end("Invalid state. You can close this window.");
        server.close();
        reject(new Error("Invalid OAuth state"));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Authenticated. You can close this window.");
      server.close();

      if (!code) {
        reject(new Error("Missing authorization code"));
        return;
      }
      resolve(code);
    });

    server.listen(port, hostname, () => {});
    server.on("error", reject);
  });
}

function tokenRequest(params) {
  const body = new URLSearchParams(params).toString();
  const url = new URL(GOOGLE_TOKEN_URL);
  const options = {
    method: "POST",
    hostname: url.hostname,
    path: url.pathname,
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Content-Length": Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => {
        data += chunk;
      });
      res.on("end", () => {
        try {
          const payload = JSON.parse(data);
          if (payload.error) {
            const description = payload.error_description ? `: ${payload.error_description}` : "";
            reject(new Error(`${payload.error}${description}`));
          } else {
            resolve(payload);
          }
        } catch (err) {
          reject(new Error(`Token response parse failed (${res.statusCode}): ${err.message}`));
        }
      });
    });
    req.on("error", reject);
    req.write(body);
    req.end();
  });
}

async function exchangeCodeForTokens(config, code, verifier) {
  const params = {
    grant_type: "authorization_code",
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code,
    code_verifier: verifier,
  };
  if (config.clientSecret) {
    params.client_secret = config.clientSecret;
  }

  const payload = await tokenRequest(params);

  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + (payload.expires_in || 3600);
  return {
    access_token: payload.access_token,
    refresh_token: payload.refresh_token,
    id_token: payload.id_token,
    expires_at: expiresAt,
    scope: payload.scope,
    token_type: payload.token_type,
  };
}

async function loginGoogleInteractive() {
  const config = loadGoogleConfig();
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));

  const codePromise = startCallbackServer(config.redirectUri, state);
  const authUrl = buildAuthUrl(config, challenge, state);
  await shell.openExternal(authUrl);

  const code = await codePromise;
  const tokens = await exchangeCodeForTokens(config, code, verifier);

  let providerUserId = null;
  if (tokens.id_token) {
    const claims = decodeJwt(tokens.id_token);
    providerUserId = claims.sub || null;
  }

  return {
    ...tokens,
    provider_user_id: providerUserId,
  };
}

module.exports = {
  loginGoogleInteractive,
  loadGoogleConfig,
};
