# Authentication Guide

## Overview

This application uses **AWS Cognito User Pool** with **OAuth 2.0 Authorization Code flow with PKCE** for authentication.

### Authentication Flow

1. **User signs up** in Cognito User Pool (via Hosted UI or AWS CLI)
2. **User logs in** and gets authorization code
3. **Authorization code is exchanged** for tokens (access_token, id_token, refresh_token)
4. **Access token** is sent to API Gateway with `Authorization: Bearer <token>` header
5. **API Gateway validates** the JWT token using Cognito Authorizer
6. **Lambda function** extracts user info from validated token claims

## Your Cognito Configuration

From your stack, you have:

- **User Pool Domain**: `kinghacks2026.auth.us-east-1.amazoncognito.com`
- **Client ID**: `138cgajh062dr3fmgg6ln9ahg6`
- **Callback URL**: `http://127.0.0.1:4387/callback`
- **Scopes**: `openid`, `email`, `profile`

## Method 1: Sign Up via Cognito Hosted UI (Easiest)

### Step 1: Get Your Hosted UI URL

```bash
# Get the domain from stack outputs
aws cloudformation describe-stacks \
  --stack-name second-brain-backend \
  --query "Stacks[0].Outputs[?OutputKey=='CognitoHostedUiDomain'].OutputValue" \
  --output text
```

Or construct it manually:
```
https://kinghacks2026.auth.us-east-1.amazoncognito.com
```

### Step 2: Sign Up

1. Open the Hosted UI URL in your browser:
   ```
   https://kinghacks2026.auth.us-east-1.amazoncognito.com/login?client_id=138cgajh062dr3fmgg6ln9ahg6&response_type=code&redirect_uri=http://127.0.0.1:4387/callback&scope=openid+email+profile
   ```

2. Click **"Sign up"** link
3. Enter your email and password
4. Verify your email (check inbox for verification code)
5. After verification, you'll be redirected back

### Step 3: Get Tokens via Browser

After signing up and logging in, you'll be redirected to:
```
http://127.0.0.1:4387/callback?code=AUTHORIZATION_CODE&state=STATE
```

**Note**: The Electron app handles this automatically. For testing, see Method 2 or 3.

## Method 2: Sign Up via AWS CLI

### Step 1: Get User Pool ID and Client ID

```bash
# Get User Pool ID
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name second-brain-backend \
  --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" \
  --output text)

# Get Client ID
CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name second-brain-backend \
  --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolClientId'].OutputValue" \
  --output text)

echo "User Pool ID: $USER_POOL_ID"
echo "Client ID: $CLIENT_ID"
```

### Step 2: Create User

```bash
# Sign up a new user
aws cognito-idp sign-up \
  --client-id "$CLIENT_ID" \
  --username "your-email@example.com" \
  --password "YourSecurePassword123!" \
  --user-attributes Name=email,Value=your-email@example.com
```

### Step 3: Confirm User (if email verification is required)

```bash
# Confirm the user (use the code from email)
aws cognito-idp confirm-sign-up \
  --client-id "$CLIENT_ID" \
  --username "your-email@example.com" \
  --confirmation-code "123456"
```

### Step 4: Get Tokens

For testing, you can use `USER_PASSWORD_AUTH` flow (if enabled):

```bash
# Authenticate and get tokens
aws cognito-idp initiate-auth \
  --client-id "$CLIENT_ID" \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME=your-email@example.com,PASSWORD=YourSecurePassword123! \
  --query 'AuthenticationResult.AccessToken' \
  --output text
```

**Note**: `USER_PASSWORD_AUTH` may not be enabled. Use Method 3 for OAuth flow.

## Method 3: Use Electron App (Recommended for Testing)

The Electron app handles the full OAuth PKCE flow automatically:

### Step 1: Run the App

```bash
cd frontend
npm start
```

### Step 2: Log In

1. The app will prompt you to log in
2. It opens a browser window to Cognito Hosted UI
3. Sign up or log in
4. You'll be redirected back to the app
5. Tokens are automatically saved

### Step 3: Extract Token from App

The tokens are stored in:
- **Windows**: `%APPDATA%\secondbrain\auth.json`
- **Mac**: `~/Library/Application Support/secondbrain/auth.json`
- **Linux**: `~/.config/secondbrain/auth.json`

Or check the app logs/console for the token.

## Method 4: Manual OAuth PKCE Flow (Advanced)

If you want to manually get tokens for testing:

### Step 1: Generate PKCE Values

```python
import secrets
import base64
import hashlib

# Generate code verifier
verifier = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('utf-8').rstrip('=')
print(f"Verifier: {verifier}")

# Generate code challenge
challenge = base64.urlsafe_b64encode(
    hashlib.sha256(verifier.encode('utf-8')).digest()
).decode('utf-8').rstrip('=')
print(f"Challenge: {challenge}")
```

### Step 2: Build Authorization URL

```
https://kinghacks2026.auth.us-east-1.amazoncognito.com/oauth2/authorize?
  response_type=code&
  client_id=138cgajh062dr3fmgg6ln9ahg6&
  redirect_uri=http://127.0.0.1:4387/callback&
  scope=openid+email+profile&
  code_challenge=YOUR_CHALLENGE&
  code_challenge_method=S256&
  state=random_state_string
```

### Step 3: Get Authorization Code

1. Open the URL in browser
2. Log in
3. You'll be redirected to: `http://127.0.0.1:4387/callback?code=CODE&state=STATE`
4. Extract the `code` parameter

### Step 4: Exchange Code for Tokens

```bash
curl -X POST "https://kinghacks2026.auth.us-east-1.amazoncognito.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=authorization_code" \
  -d "client_id=138cgajh062dr3fmgg6ln9ahg6" \
  -d "code=AUTHORIZATION_CODE_FROM_STEP_3" \
  -d "redirect_uri=http://127.0.0.1:4387/callback" \
  -d "code_verifier=YOUR_VERIFIER_FROM_STEP_1"
```

This returns:
```json
{
  "access_token": "eyJraWQ...",
  "id_token": "eyJraWQ...",
  "refresh_token": "...",
  "expires_in": 3600,
  "token_type": "Bearer"
}
```

## Testing APIs with Tokens

Once you have an access token:

### Test WhoAmI Endpoint

```bash
# Using the test script
cd backend/scripts
python test_whoami.py --access-token YOUR_ACCESS_TOKEN

# Or with curl
curl -X GET "https://hli510vwci.execute-api.us-east-1.amazonaws.com/Prod/whoami" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
```

### Test Ingest Endpoint

```bash
# Using the test script
python test_ingest.py --access-token YOUR_ACCESS_TOKEN --transcript "Remind me to call Sarah"

# Or with curl
curl -X POST "https://hli510vwci.execute-api.us-east-1.amazonaws.com/Prod/ingest" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "transcript": "Remind me to call Sarah tomorrow at 3pm",
    "user_time_iso": "2026-01-13T17:00:00Z"
  }'
```

## Token Refresh

Access tokens expire after 1 hour. Use the refresh token to get a new one:

```bash
curl -X POST "https://kinghacks2026.auth.us-east-1.amazonaws.com/oauth2/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=refresh_token" \
  -d "client_id=138cgajh062dr3fmgg6ln9ahg6" \
  -d "refresh_token=YOUR_REFRESH_TOKEN"
```

## Quick Start Script

Here's a complete script to sign up and get a token:

```bash
#!/bin/bash

# Get IDs from stack
USER_POOL_ID=$(aws cloudformation describe-stacks \
  --stack-name second-brain-backend \
  --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolId'].OutputValue" \
  --output text)

CLIENT_ID=$(aws cloudformation describe-stacks \
  --stack-name second-brain-backend \
  --query "Stacks[0].Outputs[?OutputKey=='CognitoUserPoolClientId'].OutputValue" \
  --output text)

EMAIL="test@example.com"
PASSWORD="TestPassword123!"

# Sign up
echo "Signing up user..."
aws cognito-idp sign-up \
  --client-id "$CLIENT_ID" \
  --username "$EMAIL" \
  --password "$PASSWORD" \
  --user-attributes Name=email,Value="$EMAIL"

# Note: You may need to confirm via email first
# aws cognito-idp confirm-sign-up --client-id "$CLIENT_ID" --username "$EMAIL" --confirmation-code "123456"

# Get token (if USER_PASSWORD_AUTH is enabled)
echo "Getting access token..."
TOKEN=$(aws cognito-idp initiate-auth \
  --client-id "$CLIENT_ID" \
  --auth-flow USER_PASSWORD_AUTH \
  --auth-parameters USERNAME="$EMAIL",PASSWORD="$PASSWORD" \
  --query 'AuthenticationResult.AccessToken' \
  --output text)

echo "Access Token: $TOKEN"
echo ""
echo "Test whoami:"
echo "python test_whoami.py --access-token $TOKEN"
```

## Troubleshooting

### 401 Unauthorized
- Token is expired → Refresh it
- Token is invalid → Get a new one
- Token format is wrong → Ensure it's the full JWT string

### User Pool Not Found
- Check stack is deployed: `aws cloudformation describe-stacks --stack-name second-brain-backend`
- Verify User Pool exists in Cognito Console

### Sign Up Fails
- Email may already exist → Try a different email or reset password
- Password doesn't meet requirements → Must be 8+ chars with uppercase, lowercase, number

### USER_PASSWORD_AUTH Not Working
- This flow may not be enabled in your User Pool Client
- Use OAuth flow (Method 1, 3, or 4) instead

## References

- [Cognito User Pools](https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-identity-pools.html)
- [OAuth 2.0 PKCE](https://oauth.net/2/pkce/)
- [API Gateway Cognito Authorizer](https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-integrate-with-cognito.html)
