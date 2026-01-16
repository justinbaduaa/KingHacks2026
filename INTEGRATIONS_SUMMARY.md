# Integrations Summary (Google, Slack, Microsoft, Reminders)

This document summarizes the integration architecture, data flows, auth flows, data storage, and developer setup steps for:
- Google (Gmail + Google Calendar)
- Slack (user token messaging)
- Microsoft (Outlook Mail + Microsoft Calendar) – implemented, not yet tested
- Apple Reminders (local macOS AppleScript execution)

No secrets are included. Public client IDs and required ARNs are listed for convenience.

## 1) Shared Architecture and Data Flow

### Core request flow (all integrations)
1. **Ingest** (`POST /ingest`) calls Bedrock and returns node(s).
2. **Approve** in the app triggers `POST /node/{node_id}/complete`.
3. Backend executes the integration (if supported) via `execute_node_integration`.
4. Node is persisted to DynamoDB (main table).

### Execution routing (backend)
`backend/src/lib/integration_execute.py` routes by `node_type`:
- `calendar_placeholder` → Google Calendar
- `email` → Gmail
- `slack_message` → Slack
- `ms_email` → Microsoft Outlook
- `ms_calendar` → Microsoft Calendar

### Data storage (DynamoDB)
There are two tables:
- **Main nodes table** (DynamoDBTable): stores nodes per user/day.
- **Integrations table** (IntegrationsTable): stores tokens and settings.

Key patterns in IntegrationsTable:
- `pk=user#{cognito_sub}`
- `sk=integration#google` (Google refresh token)
- `sk=integration#slack` (Slack user access token)
- `sk=integration#microsoft` (Microsoft refresh token)
- `sk=settings#contacts` (Gmail/Microsoft alias map)
- `sk=settings#slack_targets` (Slack channel/user map)
- `sk=reminder_exec#{node_id}` (Apple Reminders execution status)

### Bedrock tool outputs (node types)
Implemented node types and payloads:
- `calendar_placeholder` (Google Calendar)
- `email` (Gmail)
- `slack_message` (Slack)
- `ms_email` (Outlook)
- `ms_calendar` (Microsoft Calendar)
- `reminder` (Apple Reminders local execution)

Bedrock is instructed to use Microsoft tools only if the user explicitly mentions Outlook/Microsoft.

---

## 2) Google Integration (Gmail + Google Calendar)

### Auth flow
- **Frontend** uses PKCE (system browser + local loopback).
- **Electron** sends `code` + `code_verifier` to backend.
- **Backend** exchanges for tokens and stores refresh token.

Endpoints:
- `POST /integrations/google/code` (exchange code + store refresh token)
- `GET /integrations/google/token` (connected status)
- `GET /integrations/google/access-token` (debug)

### Execution
- **Gmail** (`node_type = email`) → Gmail API send (not draft by default)
- **Calendar** (`node_type = calendar_placeholder`) → Google Calendar event

### Provider metadata stored in node payloads
- `calendar_placeholder.provider_event_id`
- `calendar_placeholder.provider_event_link`
- `email.provider_message_id`, `email.provider_thread_id`, `email.provider_draft_id`, `email.provider_status`

### Gmail alias/contacts
Stored in IntegrationsTable:
- `sk=settings#contacts` with map: `{ "Evan": "evan@example.com", "Matt": "matt@example.com" }`

Seed script:
- `backend/scripts/seed_contacts.py`

### Public IDs and ARNs
- Google client ID (Desktop): `889539163514-10nft2cs9sg6r66ssrusa649qm82kajr.apps.googleusercontent.com`
- Google secret ARN: `arn:aws:secretsmanager:us-east-1:244271315858:secret:second-brain-google-client-secret-F4OpJ3`

### Redirect URIs
- Google Desktop OAuth redirect: `http://localhost:4387/`
- Cognito auth redirect: `http://127.0.0.1:4387/callback`

---

## 3) Slack Integration (User Token, Not Bot)

### Auth flow (backend HTTPS callback)
- `POST /integrations/slack/start` → returns Slack OAuth URL + state
- Slack redirects to HTTPS callback:
  `https://<ApiEndpoint>/integrations/slack/callback`
- Backend exchanges code and stores **user access token**

Endpoints:
- `POST /integrations/slack/start`
- `GET /integrations/slack/callback`
- `GET /integrations/slack/token`

### Execution
- `node_type = slack_message`
- Uses user token to:
  - `conversations.open` if DM
  - `chat.postMessage` to channel or DM channel ID

### Slack targets mapping
Stored in IntegrationsTable:
- `sk=settings#slack_targets`
- Structure:
  - `channels`: `{ "general": "C123..." }`
  - `users`: `{ "Evan": "U123..." }`

Seed script:
- `backend/scripts/seed_slack_targets.py`

### Public IDs and ARNs
- Slack client ID: `10308493085346.10302160874339`
- Slack secret ARN: `arn:aws:secretsmanager:us-east-1:244271315858:secret:second-brain-slack-client-secret-dqDHt1`

### Redirect URI to register in Slack
- `https://<ApiEndpoint>/integrations/slack/callback`

---

## 4) Microsoft Integration (Outlook + Microsoft Calendar)

### Status
- **Implemented but not tested** (Azure account not yet set up).
- Supports both personal and org accounts (`tenant=common`).

### Auth flow (backend HTTPS callback)
- `POST /integrations/microsoft/start`
- Microsoft redirects to:
  `https://<ApiEndpoint>/integrations/microsoft/callback`
- Backend exchanges code → access + refresh tokens stored in IntegrationsTable

Endpoints:
- `POST /integrations/microsoft/start`
- `GET /integrations/microsoft/callback`
- `GET /integrations/microsoft/token`

### Execution
- `node_type = ms_email` → Microsoft Graph `POST /me/sendMail`
- `node_type = ms_calendar` → Microsoft Graph `POST /me/events`

### Scopes (default)
- `User.Read`
- `offline_access`
- `Mail.Send`
- `Calendars.ReadWrite`

### Redirect URI to register in Azure
- `https://<ApiEndpoint>/integrations/microsoft/callback`

### Next steps (to test)
1. Create Azure app + enable Microsoft Graph permissions above.
2. Store Microsoft client secret in Secrets Manager.
3. Update `backend/samconfig.toml` with Microsoft client ID + secret ARN + tenant.
4. Deploy and run:
   - `backend/scripts/test_microsoft_oauth_code.py`
   - `backend/scripts/test_ms_email_execute.py`
   - `backend/scripts/test_ms_calendar_execute.py`

---

## 5) Apple Reminders (Local macOS Only)

### Why local
Apple Reminders has no public cloud API. Execution must happen **on the user’s Mac**.

### Execution flow
- When a reminder is approved, the app:
  1. Stores the node normally (backend)
  2. Locally runs AppleScript via `osascript` to create a reminder
  3. Posts status to backend: `POST /integrations/apple/reminders/status`

### Status values
- `queued_local` (set before save)
- `created` (success on macOS)
- `failed` (AppleScript error)
- `skipped_non_macos` (Windows/Linux)

### Where status is stored
IntegrationsTable item:
- `pk=user#{sub}`
- `sk=reminder_exec#{node_id}`

---

## 6) API Endpoints Summary

Base API endpoint (current):
- `https://4miiwjzbv6.execute-api.us-east-1.amazonaws.com/Prod/`

Google:
- `POST /integrations/google/code`
- `GET /integrations/google/token`
- `GET /integrations/google/access-token`

Slack:
- `POST /integrations/slack/start`
- `GET /integrations/slack/callback`
- `GET /integrations/slack/token`

Microsoft:
- `POST /integrations/microsoft/start`
- `GET /integrations/microsoft/callback`
- `GET /integrations/microsoft/token`

Reminders:
- `POST /integrations/apple/reminders/status`

---

## 7) Developer Setup Checklist (new machine)

### Prereqs
- AWS CLI configured (`aws configure`)
- Node + npm installed
- Python + pip installed

### Backend deploy
```bash
sam build
sam deploy
```

### Get API endpoint
```bash
aws cloudformation describe-stacks \
  --stack-name second-brain-backend-evan \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" \
  --output text
```

### Google connect
1. Run Google auth in app (or test scripts).
2. Confirm stored token:
   - `GET /integrations/google/token`

### Gmail/Outlook contacts (aliases)
Seed contacts for new dev:
```bash
python backend/scripts/seed_contacts.py \
  --user-id <COGNITO_SUB> \
  --contacts '{"Evan":"evan@example.com","Matt":"matt@example.com"}' \
  --table-name <INTEGRATIONS_TABLE_NAME>
```

### Slack connect
1. Register Slack redirect:
   - `https://<ApiEndpoint>/integrations/slack/callback`
2. Run:
```bash
python backend/scripts/test_slack_oauth_code.py
```
3. Seed Slack targets:
```bash
python backend/scripts/seed_slack_targets.py \
  --user-id <COGNITO_SUB> \
  --users '{"Evan":"U123..."}' \
  --channels '{"general":"C123..."}' \
  --table-name <INTEGRATIONS_TABLE_NAME>
```

### Apple Reminders (macOS only)
- Approve a reminder; macOS will prompt for Reminders access.
- On Windows/Linux: status is stored as `skipped_non_macos`.

### Microsoft (when ready)
1. Create Azure app (tenant `common`).
2. Add redirect URI:
   `https://<ApiEndpoint>/integrations/microsoft/callback`
3. Store secret in Secrets Manager, update `samconfig.toml`.
4. Deploy and run:
   - `backend/scripts/test_microsoft_oauth_code.py`
   - `backend/scripts/test_ms_email_execute.py`
   - `backend/scripts/test_ms_calendar_execute.py`

---

## 8) Test Scripts

Google:
- `backend/scripts/test_google_oauth_code.py`
- `backend/scripts/test_calendar_execute.py`
- `backend/scripts/test_email_execute.py`

Slack:
- `backend/scripts/test_slack_oauth_code.py`
- `backend/scripts/test_slack_execute.py`

Microsoft:
- `backend/scripts/test_microsoft_oauth_code.py`
- `backend/scripts/test_ms_email_execute.py`
- `backend/scripts/test_ms_calendar_execute.py`

Reminders:
- Use normal app flow on macOS; status is recorded via `/integrations/apple/reminders/status`.

---

## 9) Notes on Future Work
- **Apple Reminders → EventKit**: AppleScript can be swapped for a Swift CLI later.
- **Microsoft Timezone**: currently uses ISO offsets; can add explicit timezone field later.
- **Slack/Contacts UI**: contacts + slack targets are still CLI‑seeded; add settings UI later.
- **Status surface**: provider status currently stored but not displayed in dashboard.
