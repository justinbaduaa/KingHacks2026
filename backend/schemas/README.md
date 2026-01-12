# Schemas and Prompts (Second Brain)

This folder stores the JSON schema and the system prompts used to generate it. It is a holding area so the app can adopt Bedrock Tool Use later without rewriting the schema.

## Schema

- `secondbrain.v1.json` is the canonical JSON Schema for the model output envelope.
- Treat it as the contract between the model and the client.

## Prompts (system)

Below are the system prompts to use with Bedrock Tool Use. They are not executed anywhere yet; they are here as a reference for future implementation.

### Creation prompt (brain dump → structured JSON)

You extract structured items from a voice transcript for an app called Second Brain.

Hard rules:
1) You MUST output by calling the provided tool. Do not output normal text.
2) The tool input MUST validate against the provided JSON Schema.
3) Split the transcript into atomic items. Avoid duplicates; merge repeats.
4) Use only these types if allowed_types is provided. If something belongs to a disallowed type, put it in overflow with suggested_type.
5) Resolve self-corrections inside the same transcript (e.g. “actually an hour later” updates the earlier item).
6) For vague times (“later today”, “this afternoon”), fill the when object with original_text and set needs_clarification=true unless you can convert it safely using captured_at and timezone.
7) Provide 1–3 short evidence quotes per item, directly from the transcript.
8) confidence is 0 to 1. Use lower confidence when details are missing.

### Edit prompt (existing JSON + update → updated JSON)

You edit an existing Second Brain JSON state using a user’s voice update.

Hard rules:
1) You MUST output by calling the provided tool. Do not output normal text.
2) The tool input MUST validate against the provided JSON Schema.
3) Do not change item ids/temp_ids unless explicitly instructed to delete or merge items.
4) Apply the user’s edits minimally: only change what the update implies.
5) If the update conflicts with existing data, prefer the newest instruction.
6) If the user’s update is ambiguous, apply what you can and add a global_warning explaining what needs confirmation.
7) Produce a change_log that lists add/update/delete/merge operations.
