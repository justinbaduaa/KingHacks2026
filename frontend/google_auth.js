const { shell } = require("electron");
const crypto = require("crypto");
const http = require("http");
const { URL } = require("url");

const { loadConfig } = require("./auth");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const DEFAULT_SCOPES = ["openid", "email", "profile"];

function base64url(buffer) {
  return buffer
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
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
  const configuredSecret = (google.clientSecret || "").trim();
  console.log("[GOOGLE] OAuth config:", {
    clientId: google.clientId,
    redirectUri: google.redirectUri,
    scopes: google.scopes,
    clientSecretPresent: Boolean(configuredSecret),
  });
  return {
    clientId: google.clientId,
    clientSecret: configuredSecret || null,
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
      if (expectedPath && expectedPath !== "/" && url.pathname !== expectedPath) {
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

async function loginGoogleInteractive() {
  const config = loadGoogleConfig();
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash("sha256").update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));

  const codePromise = startCallbackServer(config.redirectUri, state);
  const authUrl = buildAuthUrl(config, challenge, state);
  await shell.openExternal(authUrl);

  const code = await codePromise;
  return {
    code,
    code_verifier: verifier,
    redirect_uri: config.redirectUri,
  };
}

module.exports = {
  loginGoogleInteractive,
  loadGoogleConfig,
};
