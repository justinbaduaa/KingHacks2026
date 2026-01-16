# KingHacks2026 Architecture (Full Detail)

This repo contains an Electron frontend and an AWS SAM backend. The system captures voice, streams audio to AWS Transcribe, turns transcripts into structured "nodes" using AWS Bedrock, and stores approved nodes in DynamoDB. Google OAuth tokens are stored to enable Gmail/Calendar integrations.

## Repo map (top-level)

- `backend/`: AWS SAM app (API Gateway + Lambda + DynamoDB + Cognito + IAM).
- `frontend/`: Electron app (overlay + dashboard + auth + audio + AWS SDK).
- `README.md`: root placeholder.

## AWS infrastructure (SAM template)

Defined in `backend/template.yaml`.

### API Gateway

- `BackendApi` (AWS::Serverless::Api)
  - Stage: `Prod`
  - Cognito authorizer: `CognitoAuthorizer` using `CognitoUserPool`
  - CORS: `GET,POST,PATCH,DELETE,OPTIONS` with `Content-Type,Authorization`

### DynamoDB

- `DynamoDBTable` (core app data)
  - TableName: `${StackName}-table`
  - Keys:
    - `pk` (S) partition key
    - `sk` (S) sort key
- `IntegrationsTable` (OAuth tokens)
  - TableName: `${StackName}-integrations`
  - Keys:
    - `pk` (S)
    - `sk` (S)

### Cognito (App Auth)

- `CognitoUserPool`
  - Username: email
  - Auto-verified: email
- `CognitoUserPoolDomain`
  - `Domain`: `CognitoDomainPrefix` parameter
- `CognitoUserPoolClient`
  - OAuth flow: `code`
  - Scopes: `openid email profile`
  - Callback/Logout: `http://127.0.0.1:4387/callback`, `http://127.0.0.1:4387/logout`

### Cognito Identity Pool (AWS service access)

- `CognitoIdentityPool`
  - Authenticated identities only
- `CognitoIdentityPoolAuthenticatedRole`
  - Permissions: `transcribe:StartStreamTranscription`, `transcribe:StartStreamTranscriptionWebSocket`
- `CognitoIdentityPoolUnauthenticatedRole` (no policies)
- `CognitoIdentityPoolRoleAttachment`

### Lambda functions and routes

All functions run Python 3.13 with 256 MB memory unless overridden. Environment variables at the function level inherit globals:

- `TABLE_NAME` = `DynamoDBTable`
- `INTEGRATIONS_TABLE_NAME` = `IntegrationsTable`
- `GOOGLE_OAUTH_CLIENT_ID` = `GoogleDesktopClientId` parameter

Functions:

- `IngestFunction`
  - `handlers.ingest.handler`
  - Env: `BEDROCK_MODEL_ID` (inference profile ARN)
  - Policies: DynamoDB CRUD for `DynamoDBTable`, Bedrock `InvokeModel`/`Converse`
  - Route: `POST /ingest`
- `GetActiveNodesFunction`
  - `handlers.get_active_nodes.handler`
  - Policy: DynamoDB Read for `DynamoDBTable`
  - Route: `GET /nodes/active`
- `PatchNodeFunction`
  - `handlers.patch_node.handler`
  - Route: `PATCH /node/{node_id}`
- `DeleteNodeFunction`
  - `handlers.delete_node.handler`
  - Policy: DynamoDB CRUD for `DynamoDBTable`
  - Route: `DELETE /node/{node_id}`
- `CompleteNodeFunction`
  - `handlers.complete_node.handler`
  - Policy: DynamoDB CRUD for `DynamoDBTable`
  - Route: `POST /node/{node_id}/complete`
- `GoogleTokenFunction`
  - `handlers.google_token.handler`
  - Policy: DynamoDB CRUD for `IntegrationsTable`
  - Route: `ANY /integrations/google/token`
- `GoogleGmailLabelsFunction`
  - `handlers.google_gmail_labels.handler`
  - Policy: DynamoDB Read for `IntegrationsTable`
  - Route: `GET /integrations/google/gmail/labels`
- `WhoAmIFunction`
  - `handlers.whoami.handler`
  - Route: `GET /whoami`

### CloudFormation outputs

- `ApiEndpoint`, `CognitoUserPoolId`, `CognitoUserPoolClientId`, `CognitoIdentityPoolId`, `CognitoHostedUiDomain`, `IntegrationsTableName`

### SAM deploy config

`backend/samconfig.toml` pins:
- Stack name: `second-brain-backend-evan`
- Region: `us-east-1`
- Parameter overrides for Cognito domain + Google OAuth client ID

## Core data model (BrainDump Node)

Defined in `backend/src/lib/schemas.py` and duplicated in `backend/schemas/secondbrain.v1.json`.

### Envelope fields (common to all node types)

- `schema_version` (string, const `braindump.node.v1`)
- `node_type` (string enum: `reminder`, `todo`, `note`, `calendar_placeholder`)
- `title` (string, max 120)
- `body` (string, max 4000)
- `tags` (string[])
- `created_at_iso` (string, ISO datetime in UTC, set server-side)
- `captured_at_iso` (string, ISO datetime in user timezone)
- `timezone` (string, offset like `-05:00`)
- `status` (string enum: `active`, `completed`)
- `confidence` (number 0..1)
- `evidence` (array of 1..5 objects with `quote` string)
- `time_interpretation` (object with parsed time info)
- `location_context` (object with `location_used` boolean, optional relevance string)
- `global_warnings` (string[])
- `parse_debug` (object: `model_id`, `latency_ms`, `tool_name_used`, `fallback_used`)

### Node-type payloads

- Reminder: `reminder`
  - `reminder_text` (string)
  - `when` (time_interpretation)
  - `trigger_datetime_iso` (string or null)
  - `recurrence` (pattern/interval/byweekday)
  - `priority` (`low`/`normal`/`high`)
  - `snooze_minutes_default` (int)
- Todo: `todo`
  - `task` (string)
  - `due` (time_interpretation)
  - `due_date_iso` (string or null)
  - `due_datetime_iso` (string or null)
  - `priority` (`low`/`normal`/`high`)
  - `status_detail` (`open`/`done`)
  - `estimated_minutes`, `project`, `checklist`
- Note: `note`
  - `content` (string)
  - `category_hint` (enum)
  - `pin` (boolean)
  - `related_entities` (string[])
- Calendar placeholder: `calendar_placeholder`
  - `intent` (string)
  - `event_title` (string)
  - `start` (time_interpretation)
  - `start_datetime_iso`, `end_datetime_iso` (string or null)
  - `duration_minutes` (int or null)
  - `location_text` (string or null)
  - `attendees_text` (string[])

### DynamoDB item shapes

#### Nodes table (`DynamoDBTable`)

Stored via `lib.dynamo.put_node_item`:

- `pk`: `user#{cognito_sub}`
- `sk`: `day#{local_day}#node#{node_id}`
- `node_id`: string
- `created_at_iso`, `captured_at_iso`: ISO strings
- `local_day`: `YYYY-MM-DD`
- `status`: `active` or `completed`
- `raw_transcript`: string (truncated to 10k)
- `raw_payload_subset`: object (float values converted to Decimal)
- `node`: full node object (float values converted to Decimal)
- `node_type`: copy of `node.node_type`

#### Integrations table (`IntegrationsTable`)

Stored via `handlers.google_token`:

- `pk`: `user#{cognito_sub}`
- `sk`: `integration#google`
- `provider`: `google`
- `refresh_token`: string (full token)
- `token_hint`: last 4 chars of refresh token
- `provider_user_id`: string
- `scope`: string
- `created_at`, `updated_at`: ISO strings
- `ttl` (optional): epoch seconds (if `expires_at` provided)

Retired tokens are stored on rotation:

- `sk`: `integration#google#retired#{epoch}`
- `refresh_token_hash`: SHA256 hash of the old token
- `retired_at`: ISO string
- `ttl`: epoch seconds (24h after retirement)

## Backend runtime architecture (Lambda + libs)

### Handlers (`backend/src/handlers`)

- `ingest.handler` (`backend/src/handlers/ingest.py`)
  - Input: JSON body `{ transcript, user_time_iso, captured_at_iso?, user_location?, transcript_meta? }`
  - Calls Bedrock via `lib.bedrock_converse.call_converse`
  - If Bedrock returns tool uses, normalizes time and validates against schema
  - If Bedrock returns no tool use or validation fails, uses fallback note
  - Adds server-side fields (`created_at_iso`, `captured_at_iso`, `timezone`, `parse_debug`, `schema_version`)
  - Generates `node_id` via `lib.ids.generate_node_id`
  - Response:
    - Always: `{ ok: true, node_ids: [...], nodes: [...] }`
    - If one node: also `node_id`, `node`
  - NOTE: does NOT persist to DynamoDB; storage happens on `/node/{id}/complete`

- `get_active_nodes.handler` (`backend/src/handlers/get_active_nodes.py`)
  - Extracts user id via `lib.auth.get_user_id`
  - Queries DynamoDB for all items by `pk=user#{sub}` (no sk prefix)
  - Returns `{ ok: true, nodes, node_ids, count }`
  - Sorts nodes by `created_at_iso` descending (best-effort)

- `patch_node.handler` (`backend/src/handlers/patch_node.py`)
  - Stub handler, returns `{ message: "Patch node endpoint" }`

- `delete_node.handler` (`backend/src/handlers/delete_node.py`)
  - Extracts `node_id` from path
  - Queries all items by `pk` to find matching `node_id`
  - Deletes by `pk` + `sk` when found
  - Returns `{ ok: true, node_id, message }`

- `complete_node.handler` (`backend/src/handlers/complete_node.py`)
  - Extracts user id from Cognito claims
  - Parses JSON body with `lib.json_utils.parse_body`
  - Accepts either `node` inside body or the body itself as node
  - Uses provided `node_id` or generates one
  - Computes `local_day` from `captured_at_iso`
  - Writes DynamoDB item via `lib.dynamo.put_node_item`
  - Returns `{ ok: true, node_id, message }`

- `google_token.handler` (`backend/src/handlers/google_token.py`)
  - Supports GET, POST, DELETE
  - GET: returns connection status + metadata
  - POST: stores refresh token in `IntegrationsTable` and retires previous token
  - DELETE: removes integration record
  - Uses `GOOGLE_OAUTH_CLIENT_ID` for refresh flow if needed elsewhere

- `google_gmail_labels.handler` (`backend/src/handlers/google_gmail_labels.py`)
  - Loads stored refresh token from integrations table
  - Calls `lib.oauth_refresh.refresh_access_token("google", refresh_token)`
  - Calls Gmail API labels endpoint with access token
  - Returns `{ labels: [...] }`

- `whoami.handler` (`backend/src/handlers/whoami.py`)
  - Returns `{ user_id, email, username }` from Cognito claims

### Helpers (`backend/src/lib`)

Core runtime helpers:

- `auth.py`
  - `get_user_id(event)`: reads Cognito `sub` from `requestContext.authorizer`
  - `verify_token(token)`: decodes JWT payload without signature verification
- `bedrock_converse.py`
  - Builds tool specs (4 tools for reminder/todo/note/calendar)
  - System prompt to force tool use
  - Calls `bedrock-runtime.converse`
  - Parses `toolUse` blocks into `tool_uses`
- `dynamo.py`
  - `get_table`, `get_item`, `put_item`, `delete_item`, `query_items`
  - `put_node_item`: writes node item with pk/sk
  - `_convert_floats`: float to Decimal for DynamoDB
- `ids.py`
  - `generate_node_id()` -> `node_{timestamp_hex}_{suffix}`
  - `generate_ulid_like()` (unused)
- `json_utils.py`
  - `parse_body` for API Gateway event body
  - `json_serial` for Decimal/Datetime JSON encoding
- `response.py`
  - `api_response` with CORS headers
  - `error_response` helper
- `schemas.py`
  - `SCHEMA_VERSION` and JSON Schema definitions
  - `get_node_schema`, `get_schema_version`
- `time_normalize.py`
  - `parse_offset_from_user_time_iso`
  - `ensure_iso_datetime`, `ensure_iso_date`, `date_to_datetime_iso`
  - `normalize_node_times` post-processes node subfields
  - `compute_local_day`, `utc_now_iso`
- `validate.py`
  - Manual required-field validation
  - Optional JSON Schema validation if `jsonschema` is installed
  - `create_fallback_note` on validation failure
- OAuth integrations
  - `google_oauth.py`: refreshes access token using Google OAuth token endpoint
  - `oauth_refresh.py`: provider-agnostic refresh dispatch
  - `gmail.py`: helper functions to send email/drafts (unused by handlers)
  - `google_calendar.py`: helper functions to create events (unused by handlers)

Other helpers:

- `bedrock.py`: stubbed client wrapper (unused)
- `time_utils.py`: alternate time helpers (unused)
- `models.py`: Pydantic `Node` model (unused)

## Frontend architecture (Electron)

### Main process (`frontend/main.js`)

Responsibilities:

- Creates overlay window (`renderer/index.html`) and dashboard window (`renderer/dashboard.html`)
- Registers global shortcut `Alt+Shift+Space`
- Manages tray icon and menu actions
- Handles IPC between renderer and Node APIs
- Handles auth flow startup and ensures Google integration
- Sends transcripts to backend, retrieves nodes, deletes nodes

Key functions:

- `getStackOutput()` runs AWS CLI:
  - `aws cloudformation describe-stacks` to resolve `ApiEndpoint`
  - Stack name hardcoded to `second-brain-backend-evan`
- `callApi()`:
  - Adds `Authorization: Bearer <id_token>`
  - Uses HTTPS to API Gateway
- `ensureCognitoLogin()`:
  - Uses `frontend/auth.js` to login or refresh tokens
- `ensureGoogleConnected()`:
  - Uses `/integrations/google/token` to check status
  - Runs `frontend/google_auth.js` OAuth flow if not connected
  - Stores refresh token via `POST /integrations/google/token`
- Transcribe integration:
  - `createTranscribeSession()` from `frontend/transcribe.js`
  - IPC endpoints: `transcribe-start`, `transcribe-stop`, `audio-chunk`, `transcribe-finish`
- Backend integration:
  - `ingest-transcript` -> `POST /ingest`
  - `complete-node` -> `POST /node/{node_id}/complete`
  - `get-active-nodes` -> `GET /nodes/active`
  - `delete-node` -> `DELETE /node/{node_id}`

### Preload bridge (`frontend/preload.js`)

Exposes `window.braindump` API for renderer:

- Auth: `authStatus`, `authLogin`
- Transcribe: `transcribeStart`, `transcribeStop`, `transcribeFinish`, `sendAudioChunk`
- Ingest: `ingestTranscript`
- Node lifecycle: `completeNode`, `getActiveNodes`, `deleteNode`
- Window events: `onStartListening`, `onStopListening`, `onWindowHidden`
- Transcribe events: `onTranscript`, `onTranscribeReady`, `onTranscribeError`, `onTranscribeEnded`

### Renderer overlay (`frontend/renderer/app.js`)

Responsibilities:

- UI state machine for voice capture (idle -> listening -> processing -> confirmed)
- Captures audio from microphone
  - Prefers `AudioWorklet` via `audio-processor.js`
  - Falls back to `ScriptProcessorNode`
- Sends audio chunks to main process via IPC
- Buffers partial and final transcripts from AWS Transcribe
- Sends transcript to `/ingest` and renders cards from response
- On approve, calls `/node/{node_id}/complete` to persist

Data flow:

1. User holds shortcut -> overlay opens -> `transcribeStart`
2. AudioWorklet converts Float32 to Int16 PCM and sends via `sendAudioChunk`
3. Main process streams to AWS Transcribe
4. Transcribe results emit `transcribe-transcript` events
5. On key release, app calls `transcribeFinish` and waits for `transcribe-ended`
6. Final transcript sent to `/ingest`
7. Bedrock returns structured nodes -> cards rendered
8. User approves -> `completeNode` writes to DynamoDB

### Renderer dashboard (`frontend/renderer/dashboard.js`)

Responsibilities:

- Fetches active nodes via `getActiveNodes`
- Normalizes node types for UI (todo -> task, calendar_placeholder -> calendar)
- Renders Kanban-style cards and activity timeline
- Allows delete via `deleteNode`

### Auth flows (frontend)

- `frontend/auth.js` (Cognito Hosted UI + PKCE)
  - Uses `auth.config.json` for domain/clientId/redirectUri/scopes
  - Stores tokens in Electron `userData` using `safeStorage` if available
  - Refreshes access tokens via `/oauth2/token`
- `frontend/google_auth.js` (Google OAuth Desktop + PKCE)
  - Uses `auth.config.json` `google` block
  - Starts local HTTP server for loopback redirect
  - Exchanges code for tokens at Google token endpoint
  - Returns `refresh_token` for backend storage

### Transcribe streaming (`frontend/transcribe.js`)

- Uses AWS SDK v3:
  - `TranscribeStreamingClient`
  - `fromCognitoIdentityPool` credentials provider
- Uses Cognito ID token to derive provider key (issuer host + userPoolId)
- Streams `AudioEvent` chunks of Int16 PCM
- Emits events: `ready`, `transcript`, `error`, `ended`

## End-to-end data paths

### 1) Cognito authentication (app login)

1. Renderer requests auth status via `window.braindump.authStatus()`
2. Main process uses `auth.ensureValidTokens()`
3. If missing/expired, `auth.loginInteractive()` opens Hosted UI
4. OAuth code -> loopback callback -> tokens stored on disk
5. `Authorization: Bearer <id_token>` used for API Gateway

AWS tie-ins:
- Cognito Hosted UI
- Cognito User Pool Client (OAuth code flow)
- API Gateway authorizer uses User Pool to validate JWT

### 2) Audio capture -> AWS Transcribe

1. Renderer opens microphone and creates `AudioWorklet`
2. PCM audio is chunked into Int16 buffers
3. IPC sends chunks to main process
4. `TranscribeSession` streams audio to AWS Transcribe Streaming
5. Transcribe returns partial/final transcripts via event stream

AWS tie-ins:
- Cognito Identity Pool provides temporary credentials
- IAM role permits `transcribe:StartStreamTranscription*`
- AWS Transcribe Streaming service

### 3) Transcript -> Bedrock tool use -> nodes

1. Renderer calls `ingestTranscript(transcript)`
2. Main process calls `POST /ingest` with `transcript` and `user_time_iso`
3. Lambda `handlers.ingest` calls Bedrock `converse` with tools
4. Bedrock tool outputs are validated and normalized
5. Response returns structured nodes (not yet stored)

AWS tie-ins:
- API Gateway -> Lambda
- Bedrock runtime (Converse API)
- IAM permissions for Bedrock

### 4) Node approval -> DynamoDB persistence

1. User clicks approve on a card
2. Renderer calls `completeNode(node, nodeId)`
3. Main process calls `POST /node/{node_id}/complete`
4. Lambda writes DynamoDB item using pk/sk model
5. Response confirms storage

AWS tie-ins:
- API Gateway -> Lambda
- DynamoDB CRUD

### 5) Dashboard read/delete

- Read:
  1. Dashboard calls `getActiveNodes`
  2. Lambda queries all items for pk `user#{sub}`
  3. Returns array of nodes
- Delete:
  1. Dashboard calls `deleteNode(nodeId)`
  2. Lambda queries pk to find matching node_id
  3. Deletes by pk/sk

AWS tie-ins:
- API Gateway -> Lambda
- DynamoDB

### 6) Google OAuth and Gmail labels

1. Electron checks `/integrations/google/token` for status
2. If disconnected, runs Google OAuth loopback flow
3. Refresh token is stored in IntegrationsTable
4. `GET /integrations/google/gmail/labels`:
   - Refreshes access token
   - Calls Gmail API labels endpoint

AWS tie-ins:
- DynamoDB IntegrationsTable
- API Gateway -> Lambda
- Google OAuth + Gmail API

## Configuration points

Backend:
- `backend/template.yaml`: AWS resources, routes, env vars
- `backend/samconfig.toml`: stack name + region
- `backend/requirements.txt`: Lambda deps

Frontend:
- `frontend/auth.config.json`: Cognito domain, client ID, identity pool, region, Google OAuth client
- `frontend/package.json`: Electron version and AWS SDK v3 deps

## Scripts and local tooling

- `backend/scripts/`: manual test scripts and curl examples (not used at runtime)
- `backend/schemas/`: schema reference + prompt notes (not used at runtime)

