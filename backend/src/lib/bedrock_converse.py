"""Bedrock Converse API client with tool use for BrainDump."""

import json
import time
import boto3
from lib.schemas import SCHEMA_VERSION

_client = None


def get_client():
    """Get cached Bedrock Runtime client."""
    global _client
    if _client is None:
        _client = boto3.client("bedrock-runtime")
    return _client


# Tool input schema for model output - shared base fields
TOOL_BASE_PROPERTIES = {
    "schema_version": {
        "type": "string",
        "description": f"Must be exactly '{SCHEMA_VERSION}'"
    },
    "node_type": {
        "type": "string",
        "description": "The type of node being created"
    },
    "title": {
        "type": "string",
        "description": "Short summary for UI display (max 120 chars)"
    },
    "body": {
        "type": "string",
        "description": "Main text content, cleaned version of transcript intent (max 4000 chars)"
    },
    "tags": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Relevant tags (max 12 items, each max 40 chars)"
    },
    "status": {
        "type": "string",
        "enum": ["active", "completed"],
        "description": "Node status"
    },
    "confidence": {
        "type": "number",
        "description": "Your confidence in this interpretation (0.0 to 1.0)"
    },
    "evidence": {
        "type": "array",
        "items": {
            "type": "object",
            "properties": {
                "quote": {"type": "string", "description": "Exact quote from transcript"}
            },
            "required": ["quote"]
        },
        "description": "1-5 quotes from transcript supporting this interpretation"
    },
    "time_interpretation": {
        "type": "object",
        "properties": {
            "original_text": {"type": "string", "description": "The exact time-related text from transcript"},
            "kind": {
                "type": "string",
                "enum": ["datetime", "date", "time_window", "relative", "unspecified"],
                "description": "Type of time specification found"
            },
            "resolved_start_iso": {"type": "string", "description": "ISO 8601 datetime with offset for start"},
            "resolved_end_iso": {"type": "string", "description": "ISO 8601 datetime with offset for end (time windows)"},
            "needs_clarification": {"type": "boolean", "description": "True if time is ambiguous"},
            "clarification_question": {"type": "string", "description": "Question to ask user if ambiguous"},
            "resolution_notes": {"type": "string", "description": "How you interpreted the time"}
        },
        "required": ["original_text", "kind", "needs_clarification"]
    },
    "location_context": {
        "type": "object",
        "properties": {
            "location_used": {"type": "boolean", "description": "Whether user_location influenced your interpretation"},
            "location_relevance": {"type": "string", "description": "Explanation of why location was/wasn't used"}
        },
        "required": ["location_used"]
    },
    "global_warnings": {
        "type": "array",
        "items": {"type": "string"},
        "description": "Any warnings about the interpretation"
    }
}

REMINDER_TOOL_PROPERTIES = {
    **TOOL_BASE_PROPERTIES,
    "reminder": {
        "type": "object",
        "properties": {
            "reminder_text": {"type": "string", "description": "What to remind the user about"},
            "when": {
                "type": "object",
                "properties": {
                    "original_text": {"type": "string"},
                    "kind": {"type": "string", "enum": ["datetime", "date", "time_window", "relative", "unspecified"]},
                    "resolved_start_iso": {"type": "string"},
                    "resolved_end_iso": {"type": "string"},
                    "needs_clarification": {"type": "boolean"},
                    "clarification_question": {"type": "string"},
                    "resolution_notes": {"type": "string"}
                },
                "required": ["original_text", "kind", "needs_clarification"]
            },
            "trigger_datetime_iso": {"type": "string", "description": "ISO 8601 datetime when reminder triggers (with offset)"},
            "recurrence": {
                "type": "object",
                "properties": {
                    "pattern": {"type": "string", "enum": ["none", "daily", "weekly", "monthly"]},
                    "interval": {"type": "integer"},
                    "byweekday": {"type": "array", "items": {"type": "string"}}
                },
                "required": ["pattern"]
            },
            "priority": {"type": "string", "enum": ["low", "normal", "high"]},
            "snooze_minutes_default": {"type": "integer"}
        },
        "required": ["reminder_text", "when", "priority"]
    }
}

TODO_TOOL_PROPERTIES = {
    **TOOL_BASE_PROPERTIES,
    "todo": {
        "type": "object",
        "properties": {
            "task": {"type": "string", "description": "The task to complete"},
            "due": {
                "type": "object",
                "properties": {
                    "original_text": {"type": "string"},
                    "kind": {"type": "string", "enum": ["datetime", "date", "time_window", "relative", "unspecified"]},
                    "resolved_start_iso": {"type": "string"},
                    "needs_clarification": {"type": "boolean"},
                    "clarification_question": {"type": "string"},
                    "resolution_notes": {"type": "string"}
                },
                "required": ["original_text", "kind", "needs_clarification"]
            },
            "due_date_iso": {"type": "string", "description": "ISO date YYYY-MM-DD if date specified"},
            "due_datetime_iso": {"type": "string", "description": "ISO 8601 datetime if time specified"},
            "priority": {"type": "string", "enum": ["low", "normal", "high"]},
            "status_detail": {"type": "string", "enum": ["open", "done"]},
            "estimated_minutes": {"type": "integer"},
            "project": {"type": "string"},
            "checklist": {"type": "array", "items": {"type": "string"}}
        },
        "required": ["task", "priority", "status_detail"]
    }
}

NOTE_TOOL_PROPERTIES = {
    **TOOL_BASE_PROPERTIES,
    "note": {
        "type": "object",
        "properties": {
            "content": {"type": "string", "description": "Main note content"},
            "category_hint": {"type": "string", "enum": ["personal", "school", "work", "health", "finance", "idea", "other"]},
            "pin": {"type": "boolean"},
            "related_entities": {"type": "array", "items": {"type": "string"}, "description": "People, places, things mentioned"}
        },
        "required": ["content", "category_hint", "pin"]
    }
}

CALENDAR_TOOL_PROPERTIES = {
    **TOOL_BASE_PROPERTIES,
    "calendar_placeholder": {
        "type": "object",
        "properties": {
            "intent": {"type": "string", "description": "Description of calendar event intent"},
            "event_title": {"type": "string", "description": "Title for the event"},
            "start": {
                "type": "object",
                "properties": {
                    "original_text": {"type": "string"},
                    "kind": {"type": "string", "enum": ["datetime", "date", "time_window", "relative", "unspecified"]},
                    "resolved_start_iso": {"type": "string"},
                    "resolved_end_iso": {"type": "string"},
                    "needs_clarification": {"type": "boolean"},
                    "clarification_question": {"type": "string"},
                    "resolution_notes": {"type": "string"}
                },
                "required": ["original_text", "kind", "needs_clarification"]
            },
            "start_datetime_iso": {"type": "string", "description": "ISO 8601 start datetime"},
            "end_datetime_iso": {"type": "string", "description": "ISO 8601 end datetime"},
            "duration_minutes": {"type": "integer"},
            "location_text": {"type": "string"},
            "attendees_text": {"type": "array", "items": {"type": "string"}}
        },
        "required": ["intent", "event_title", "start"]
    }
}


def build_tools():
    """Build tool specifications for Bedrock Converse."""
    base_required = ["schema_version", "node_type", "title", "body", "tags", "status", "confidence", "evidence", "location_context"]
    
    return [
        {
            "toolSpec": {
                "name": "create_reminder_node",
                "description": "Create a reminder node for time-triggered reminders. Use when user wants to be reminded of something at a specific time or in a relative timeframe.",
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": REMINDER_TOOL_PROPERTIES,
                        "required": base_required + ["reminder", "time_interpretation"]
                    }
                }
            }
        },
        {
            "toolSpec": {
                "name": "create_todo_node",
                "description": "Create a todo/task node. Use when user describes something they need to do, a task, or action item. May or may not have a due date.",
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": TODO_TOOL_PROPERTIES,
                        "required": base_required + ["todo"]
                    }
                }
            }
        },
        {
            "toolSpec": {
                "name": "create_note_node",
                "description": "Create a note node for capturing information, thoughts, or ideas. Use when user is recording information without a specific action or reminder attached.",
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": NOTE_TOOL_PROPERTIES,
                        "required": base_required + ["note"]
                    }
                }
            }
        },
        {
            "toolSpec": {
                "name": "create_calendar_placeholder_node",
                "description": "Create a calendar event placeholder. Use when user wants to schedule a meeting, event, or appointment. This is a placeholder until calendar integration pushes the event.",
                "inputSchema": {
                    "json": {
                        "type": "object",
                        "properties": CALENDAR_TOOL_PROPERTIES,
                        "required": base_required + ["calendar_placeholder"]
                    }
                }
            }
        }
    ]


SYSTEM_PROMPT = '''You are BrainDump, an AI that converts messy voice transcripts into ONE structured node.

## Your Task
Analyze the transcript and create exactly ONE node by calling one of these tools:
- create_reminder_node: For time-based reminders ("remind me to...", "don't forget to...")
- create_todo_node: For tasks/action items ("I need to...", "add to my list...")
- create_note_node: For information capture, thoughts, ideas (no specific action)
- create_calendar_placeholder_node: For scheduling events/meetings ("schedule...", "set up meeting...")

## Critical Rules
1. You MUST call exactly one tool. Do not respond with text.
2. All timestamps MUST be ISO 8601 with timezone offset matching user_time_iso (e.g., 2026-01-12T15:00:00-05:00)
3. Include 1-5 evidence quotes copied EXACTLY from the transcript
4. Set confidence 0.0-1.0 honestly. Lower if ambiguous.
5. Only use location if transcript implies it ("here", "near me", "when I get there")
6. Set needs_clarification=true if time is ambiguous, with a clarification_question

## Time Resolution Rules
Given user_time_iso, interpret relative times:
- "today" = same date as user_time_iso
- "tomorrow" = next day from user_time_iso
- "tonight"/"this evening" = same date, 18:00-21:00 range (set needs_clarification=true)
- "later" without context = needs_clarification=true
- "next Monday" = the coming Monday after user_time_iso date
- "in 2 hours" = user_time_iso + 2 hours
- If only date given for reminder, default to 09:00 local time, note in resolution_notes
- "afternoon" = 13:00-17:00 time window, needs_clarification=true
- "morning" = 06:00-12:00 time window, needs_clarification=true

## Node Type Decision Guide
- REMINDER: User wants a future alert/notification. Has trigger time (explicit or implied).
- TODO: User describes a task to complete. May have due date or not. Action-oriented.
- NOTE: User is capturing information, thoughts, or ideas. No specific action required.
- CALENDAR: User wants to schedule an event with others or block time. Meetings, appointments.

## Output Requirements
- schema_version: must be "braindump.node.v1"
- node_type: must match the tool you're calling
- title: Short, clear UI label (max 120 chars)
- body: Cleaned, coherent version of intent (max 4000 chars)
- tags: Relevant keywords (max 12 tags)
- status: Usually "active" for new nodes
- evidence: 1-5 exact quotes from transcript
- confidence: 0.0-1.0
- location_context.location_used: true only if location influenced interpretation
- time_interpretation: How you resolved any time references
- global_warnings: Any concerns about interpretation

## Examples

### Example 1: Reminder with relative time
Transcript: "remind me to call mom tomorrow at 7"
user_time_iso: "2026-01-12T17:00:00-05:00"
→ Call create_reminder_node with:
- trigger_datetime_iso: "2026-01-13T07:00:00-05:00" (tomorrow = Jan 13, at 7:00)
- Note: "7" likely means 7 PM given context, but 07:00 is ambiguous
- If unsure AM/PM: needs_clarification=true, ask "Did you mean 7 AM or 7 PM?"

### Example 2: Todo without due date
Transcript: "I need to buy groceries and pick up dry cleaning"
→ Call create_todo_node with:
- task: "Buy groceries and pick up dry cleaning"
- due.kind: "unspecified"
- due.needs_clarification: false (no time mentioned is okay for todos)
- status_detail: "open"

### Example 3: Calendar with ambiguous time
Transcript: "set up a meeting with Sam next week"
user_time_iso: "2026-01-12T17:00:00-05:00"
→ Call create_calendar_placeholder_node with:
- event_title: "Meeting with Sam"
- start.kind: "relative"
- start.original_text: "next week"
- start.needs_clarification: true
- start.clarification_question: "What day and time next week would you like to meet with Sam?"
- attendees_text: ["Sam"]

Now analyze the provided transcript and context, then call exactly one tool.'''


def build_system_prompt():
    """Return the system prompt for Bedrock."""
    return SYSTEM_PROMPT


def call_converse(model_id: str, user_payload: dict):
    """
    Call Bedrock Converse API with tools.
    
    Returns: (tool_name, tool_input, raw_response, latency_ms)
    """
    client = get_client()
    tools = build_tools()
    system_prompt = build_system_prompt()
    
    user_message = json.dumps(user_payload, ensure_ascii=False)
    
    start_time = time.time()
    
    response = client.converse(
        modelId=model_id,
        messages=[
            {
                "role": "user",
                "content": [{"text": user_message}]
            }
        ],
        system=[{"text": system_prompt}],
        toolConfig={
            "tools": tools,
            "toolChoice": {"auto": {}}
        },
        inferenceConfig={
            "temperature": 0,
            "maxTokens": 4096
        }
    )
    
    latency_ms = int((time.time() - start_time) * 1000)
    
    # Extract tool use from response
    tool_name = None
    tool_input = None
    
    if "output" in response and "message" in response["output"]:
        message = response["output"]["message"]
        if "content" in message:
            for block in message["content"]:
                if "toolUse" in block:
                    tool_name = block["toolUse"]["name"]
                    tool_input = block["toolUse"]["input"]
                    break
    
    return tool_name, tool_input, response, latency_ms
