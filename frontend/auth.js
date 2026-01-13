const { app, safeStorage, shell } = require('electron');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { URL, URLSearchParams } = require('url');

const CONFIG_PATH = path.join(__dirname, 'auth.config.json');
const TOKEN_SKEW_SECONDS = 60;

function getStoragePath() {
  const electronApp = app || require('electron').app;
  return path.join(electronApp.getPath('userData'), 'auth.json');
}

function loadConfig() {
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  return JSON.parse(raw);
}

function base64url(buffer) {
  return buffer
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
}

function encryptPayload(payload) {
  const data = Buffer.from(JSON.stringify(payload), 'utf-8');
  if (safeStorage.isEncryptionAvailable()) {
    return safeStorage.encryptString(data.toString('utf-8'));
  }
  return data;
}

function decryptPayload(blob) {
  if (safeStorage.isEncryptionAvailable() && Buffer.isBuffer(blob)) {
    return JSON.parse(safeStorage.decryptString(blob));
  }
  if (Buffer.isBuffer(blob)) {
    return JSON.parse(blob.toString('utf-8'));
  }
  return JSON.parse(blob);
}

function loadTokens() {
  const storagePath = getStoragePath();
  if (!fs.existsSync(storagePath)) {
    return null;
  }
  const raw = fs.readFileSync(storagePath);
  try {
    return decryptPayload(raw);
  } catch (err) {
    return null;
  }
}

function saveTokens(tokens) {
  const payload = encryptPayload(tokens);
  fs.writeFileSync(getStoragePath(), payload);
}

function isTokenValid(tokens) {
  if (!tokens || !tokens.access_token || !tokens.expires_at) {
    return false;
  }
  const now = Math.floor(Date.now() / 1000);
  return tokens.expires_at - TOKEN_SKEW_SECONDS > now;
}

function buildAuthUrl(config, codeChallenge, state) {
  const url = new URL(`https://${config.domain}/oauth2/authorize`);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', config.clientId);
  url.searchParams.set('redirect_uri', config.redirectUri);
  url.searchParams.set('scope', config.scopes.join(' '));
  url.searchParams.set('code_challenge', codeChallenge);
  url.searchParams.set('code_challenge_method', 'S256');
  url.searchParams.set('state', state);
  return url.toString();
}

function startCallbackServer(redirectUri, expectedState) {
  const target = new URL(redirectUri);
  const port = parseInt(target.port, 10) || 80;
  const hostname = target.hostname;

  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, redirectUri);
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');

      if (state && state !== expectedState) {
        res.writeHead(400, { 'Content-Type': 'text/plain' });
        res.end('Invalid state. You can close this window.');
        server.close();
        reject(new Error('Invalid OAuth state'));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Authenticated. You can close this window.');
      server.close();

      if (!code) {
        reject(new Error('Missing authorization code'));
        return;
      }
      resolve(code);
    });

    server.listen(port, hostname, () => {});
    server.on('error', reject);
  });
}

function tokenRequest(config, params) {
  const body = new URLSearchParams(params).toString();
  const options = {
    method: 'POST',
    hostname: config.domain,
    path: '/oauth2/token',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      res.on('end', () => {
        try {
          const payload = JSON.parse(data);
          if (payload.error) {
            reject(new Error(payload.error));
          } else {
            resolve(payload);
          }
        } catch (err) {
          reject(err);
        }
      });
    });
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function exchangeCodeForTokens(config, code, verifier) {
  const payload = await tokenRequest(config, {
    grant_type: 'authorization_code',
    client_id: config.clientId,
    redirect_uri: config.redirectUri,
    code,
    code_verifier: verifier,
  });

  const expiresAt = Math.floor(Date.now() / 1000) + (payload.expires_in || 3600);
  return {
    access_token: payload.access_token,
    id_token: payload.id_token,
    refresh_token: payload.refresh_token,
    expires_at: expiresAt,
    token_type: payload.token_type,
  };
}

async function refreshTokens(config, refreshToken, existing) {
  const payload = await tokenRequest(config, {
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: refreshToken,
  });

  const expiresAt = Math.floor(Date.now() / 1000) + (payload.expires_in || 3600);
  return {
    access_token: payload.access_token,
    id_token: payload.id_token || existing.id_token,
    refresh_token: refreshToken,
    expires_at: expiresAt,
    token_type: payload.token_type || existing.token_type,
  };
}

async function ensureValidTokens() {
  const config = loadConfig();
  const stored = loadTokens();
  if (isTokenValid(stored)) {
    return stored;
  }
  if (stored && stored.refresh_token) {
    const refreshed = await refreshTokens(config, stored.refresh_token, stored);
    saveTokens(refreshed);
    return refreshed;
  }
  return null;
}

async function loginInteractive() {
  const config = loadConfig();
  const verifier = base64url(crypto.randomBytes(32));
  const challenge = base64url(crypto.createHash('sha256').update(verifier).digest());
  const state = base64url(crypto.randomBytes(16));

  const codePromise = startCallbackServer(config.redirectUri, state);
  const authUrl = buildAuthUrl(config, challenge, state);
  await shell.openExternal(authUrl);

  const code = await codePromise;
  const tokens = await exchangeCodeForTokens(config, code, verifier);
  saveTokens(tokens);
  return tokens;
}

module.exports = {
  ensureValidTokens,
  loginInteractive,
  loadConfig,
};
