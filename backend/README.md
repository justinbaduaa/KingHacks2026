# Backend

AWS SAM backend for the application.

## Auth Overview

Two separate flows:
- Cognito (app authentication). The app gets Cognito JWTs and calls API Gateway with `Authorization: Bearer <token>`.
- Google OAuth (Gmail/Calendar access). The app performs OAuth directly with Google and sends the refresh token to the backend for storage.

### Token lifetimes (practical expectations)

- Cognito access tokens are short-lived (commonly 1 hour). The Electron app should use the Cognito refresh token to fetch new JWTs without a new login.
- Cognito refresh tokens are long-lived (commonly 30 days, configurable). Store them in the app and refresh silently.
- Google refresh tokens are long-lived but can be revoked by the user or Google. When that happens, you must prompt the user to re-connect Google.

## Google OAuth (Desktop App + PKCE)

For Electron, use a Google OAuth **Desktop app** client with PKCE. No client secret is required.

Callback (loopback):
- `http://127.0.0.1:<port>/auth/google/callback`

The callback is the redirect target Google sends the user to after consent. Your app listens for it and exchanges the code for tokens.

### PKCE in plain terms

PKCE is a safer OAuth flow for public clients (like Electron) that cannot keep secrets.
- The client generates a random `code_verifier`.
- It derives a `code_challenge` from that verifier and sends the challenge to Google.
- When Google returns an auth `code`, the client sends the original `code_verifier` to redeem it.
- Google checks the verifier matches the challenge, preventing code interception.

### Electron client flow (minimal)

1) Create `code_verifier` (random 32-64 chars) and `code_challenge` (SHA-256 + base64url).
2) Open the auth URL in a browser window.
3) Google redirects to your callback with `?code=...&state=...`.
4) Exchange `code` + `code_verifier` for tokens.
5) Send `refresh_token` to `POST /integrations/google/token`.

Example authorization URL (fill in your values):
```
https://accounts.google.com/o/oauth2/v2/auth
  ?client_id=YOUR_DESKTOP_CLIENT_ID
  &redirect_uri=http%3A%2F%2F127.0.0.1%3A4387%2Fauth%2Fgoogle%2Fcallback
  &response_type=code
  &scope=openid%20email%20profile%20https%3A%2F%2Fwww.googleapis.com%2Fauth%2Fcalendar.readonly
  &code_challenge=YOUR_CODE_CHALLENGE
  &code_challenge_method=S256
  &access_type=offline
  &prompt=consent
  &state=RANDOM_STATE
```

### Scopes (examples)
- Identity: `openid email profile`
- Calendar read: `https://www.googleapis.com/auth/calendar.readonly`
- Calendar read/write: `https://www.googleapis.com/auth/calendar.events`
- Gmail read: `https://www.googleapis.com/auth/gmail.readonly`
- Gmail modify: `https://www.googleapis.com/auth/gmail.modify`
- Gmail send: `https://www.googleapis.com/auth/gmail.send`

### Token Storage

The backend stores Google refresh tokens in the integrations table. The row is keyed by the Cognito user id:
- `pk = user#<cognito_sub>`
- `sk = integration#google`

The handler also writes a short-lived retired-token record on rotation:
- `sk = integration#google#retired#<timestamp>` with `ttl` for cleanup.

If Google rejects a refresh token (`invalid_grant`), the backend returns 401 and the app should prompt the user to reconnect Google.

Endpoints:
- `POST /integrations/google/token` stores the refresh token and metadata.
- `GET /integrations/google/token` returns connection status.
- `DELETE /integrations/google/token` removes the token.
- `GET /integrations/google/gmail/labels` sample Gmail API call (uses refresh + access token flow).

### Backend refresh architecture (modular)

1) Store refresh tokens per provider in the integrations table.
2) Backend refreshes access tokens on demand via a provider-agnostic interface.
3) Provider API calls happen after refresh, using the short-lived access token.

This scales to other providers by adding:
- A new `integration#<provider>` row.
- A new provider refresh helper and registering it.
- A new sample endpoint (or shared handler) for its API.

Provider refresh entry point:
- `backend/src/lib/oauth_refresh.py`

## Second Brain schema (future)

The JSON envelope and schema live here for future Bedrock tool-use integration:
- `backend/schemas/secondbrain.v1.json`

## DynamoDB Tables

- `DynamoDBTable` holds core app data (nodes, etc).
- `IntegrationsTable` holds OAuth integration tokens and metadata.

Both tables use the same `pk = user#<cognito_sub>` convention so data can be linked by the user id.

## Setup

```bash
pip install -r requirements.txt
```

## Deployment

```bash
sam build
sam deploy --guided
```

You will need:
- An AWS account and AWS CLI configured (`aws configure`).
- A Google OAuth consent screen and Desktop app client in Google Cloud Console.

Google Console setup checklist:
- Create OAuth consent screen (External).
- Add scopes you need (Gmail/Calendar).
- Create OAuth client ID (Desktop app).
- Use loopback redirect: `http://127.0.0.1:<port>/auth/google/callback`
- Copy the Desktop client ID into the SAM parameter `GoogleDesktopClientId`.

Reference:
- https://console.cloud.google.com/apis/credentials

## Local Development

```bash
sam local start-api
```
