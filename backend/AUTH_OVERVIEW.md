# Auth and OAuth Overview (Detailed)

This document summarizes the authentication and OAuth work in this repo, plus general guidance you can reuse later. It is intentionally long and detailed for learning.

## 1) Two different problems (and two different solutions)

There are two distinct problems:

1. **App authentication** (who is the user of your app?)
2. **Third‑party API authorization** (can the app access the user’s Google data?)

These are solved by different systems:

- **Cognito (User Pool + API Gateway authorizer)** handles app authentication.
- **Google OAuth (Desktop app + PKCE)** handles access to Google APIs like Gmail and Calendar.

Keeping these separate is important. Cognito does not grant Gmail access, and Google OAuth does not grant access to your API.

## 2) App authentication (Cognito)

### Goal
Prove a user is authenticated before your API (API Gateway + Lambda) executes.

### Flow (high level)
1. The Electron app opens the Cognito Hosted UI.
2. User signs in.
3. Cognito redirects to the app callback with an authorization code.
4. The app exchanges the code for Cognito tokens.
5. The app sends the **Cognito access token** in `Authorization: Bearer <token>` to your API.
6. API Gateway validates the token; if valid, Lambda receives the request with user claims.

### Tokens
- **Access token**: short‑lived (about 1 hour).
- **Refresh token**: long‑lived (days/weeks, configurable).

### Practical behavior
The app should refresh the access token silently using the refresh token. This means the user does **not** have to log in every time the app opens.

## 3) Google OAuth for Gmail/Calendar (Desktop app + PKCE)

### Goal
Allow the user to grant your app access to their Gmail/Calendar data.

### Why PKCE
Desktop apps can’t safely store a client secret. PKCE avoids that by proving that the same client who started the login is the one exchanging the code.

### PKCE summary
1. App creates a random `code_verifier`.
2. App derives `code_challenge = base64url(sha256(code_verifier))`.
3. App starts OAuth with `code_challenge`.
4. Google returns `code`.
5. App exchanges `code` + `code_verifier` for tokens.

### Tokens
- **Access token**: short‑lived (minutes to an hour).
- **Refresh token**: long‑lived, used to get new access tokens.

### What happens if refresh token stops working
If Google returns `invalid_grant`, the refresh token is expired or revoked. The app must prompt the user to reconnect Google.

## 4) Why loopback callback is required (and what you must do)

The loopback callback is a local URL that the **Electron app itself** listens on, for example:

```
http://127.0.0.1:4387/auth/google/callback
```

Google will redirect the user to that URL after consent. Your app runs a local server on that port, receives the code, and continues the flow.

### Do you need to “register” this in Google?
Yes. You must create a Google OAuth client in Google Cloud Console:

- Create OAuth consent screen.
- Create **OAuth client ID** for a **Desktop app**.
- Desktop apps support loopback callbacks.

This is not automatic and cannot be done just by code alone. You must do this in the Google Cloud Console.

Reference:
https://console.cloud.google.com/apis/credentials

## 5) Where tokens are stored

### App authentication tokens (Cognito)
- Stored in the Electron app (for MVP).
- Use them to call API Gateway.

### Google refresh tokens
- Stored in `IntegrationsTable` (DynamoDB).
- This allows backend‑side Gmail/Calendar calls and persistent access.

### Why DynamoDB for refresh tokens
- Scales to many users.
- Easy to query by user ID.
- Supports TTL cleanup for retired tokens.

## 6) Current backend structure (what exists now)

### Tables
- `DynamoDBTable` for app data (nodes, etc).
- `IntegrationsTable` for OAuth refresh tokens.

Both use the same partition key pattern:
```
pk = user#<cognito_sub>
```
This lets you link records across tables by a stable user id.

### Endpoints
- `POST /integrations/google/token`  
  Store refresh token in Dynamo.
- `GET /integrations/google/token`  
  Returns connection status.
- `DELETE /integrations/google/token`  
  Removes the stored token.
- `GET /integrations/google/gmail/labels`  
  Sample Gmail API call that refreshes the access token first.

### Refresh architecture
- `backend/src/lib/oauth_refresh.py` is the provider‑agnostic entry point.
- `backend/src/lib/google_oauth.py` is the provider‑specific implementation.

This is how you scale to other providers:
- Add a new `integration#<provider>` row.
- Implement a provider refresh helper.
- Register it in `oauth_refresh.py`.

## 7) How this would work for other providers

The structure supports:
- Google (Gmail/Calendar)
- Microsoft (Outlook/Calendar)
- Slack
- Notion
- Any OAuth provider with refresh tokens

