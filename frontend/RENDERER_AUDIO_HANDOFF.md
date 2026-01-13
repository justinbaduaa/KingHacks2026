# Renderer Audio Handoff

## Status
- Node-only mic capture + AWS Transcribe streaming works.
- Any renderer-based mic capture (Electron renderer with getUserMedia / AudioContext / MediaRecorder / ScriptProcessor) crashes the renderer with `exitCode 11` as soon as recording starts.

## What Works
### Node-only recorder
- Command: `RECORD_SECONDS=5 npm run record-node`
- Output: `frontend/recording_min/recordings/recording-*.wav`
- Requires: `sox` installed (`brew install sox`)

### Node-only transcribe
- Command: `RECORD_SECONDS=5 npm run record-node-transcribe`
- Streams partial transcripts to terminal, prints final transcript at the end.
- Auth options:
  - Use AWS creds in env (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`)
  - Or use Cognito id token: `COGNITO_ID_TOKEN="..." npm run record-node-transcribe`

## What Fails
- `npm run record-min` (minimal Electron renderer app in `frontend/recording_min/`)
- Renderer crashes right after mic starts, before any audio is saved.
- Crash signature: `Renderer crashed: { reason: 'crashed', exitCode: 11 }`

## Relevant Files
- Minimal Electron recorder (renderer path):
  - `frontend/recording_min/main.js`
  - `frontend/recording_min/preload.js`
  - `frontend/recording_min/renderer/record.js`
- Node-only recorder:
  - `frontend/recording_min/node_record.js`
- Node-only transcribe:
  - `frontend/recording_min/node_transcribe.js`

## Notes
- OS/mic path confirmed good (Node-only capture succeeds).
- AWS Transcribe path confirmed good (node-only streaming works).
- Likely Electron/Chromium audio stack crash in renderer.

## Suggestions To Investigate
- Check macOS crash report via Console.app for Audio/WebRTC/AVFoundation clues.
- Try minimal renderer in a new Electron version later (not done yet).
- Consider staying node-only for mic capture and pipe audio to renderer via IPC once stable.
