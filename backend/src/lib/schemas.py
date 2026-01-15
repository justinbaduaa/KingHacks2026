"""JSON Schemas for BrainDump nodes (draft 2020-12 style)."""

SCHEMA_VERSION = "braindump.node.v1"

# Shared definitions
DEFS = {
    "evidence_item": {
        "type": "object",
        "properties": {
            "quote": {
                "type": "string",
                "maxLength": 500,
                "description": "Exact quote from transcript supporting this interpretation"
            },
            "word_time_range": {
                "type": "object",
                "properties": {
                    "start_ms": {"type": "integer"},
                    "end_ms": {"type": "integer"}
                },
                "additionalProperties": False
            }
        },
        "required": ["quote"],
        "additionalProperties": False
    },
    "time_interpretation": {
        "type": "object",
        "properties": {
            "original_text": {
                "type": "string",
                "maxLength": 200,
                "description": "The exact text from transcript describing time"
            },
            "kind": {
                "type": "string",
                "enum": ["datetime", "date", "time_window", "relative", "unspecified"],
                "description": "Type of time specification"
            },
            "resolved_start_iso": {
                "type": ["string", "null"],
                "description": "ISO 8601 datetime for start (with offset)"
            },
            "resolved_end_iso": {
                "type": ["string", "null"],
                "description": "ISO 8601 datetime for end (with offset), for time windows"
            },
            "needs_clarification": {
                "type": "boolean",
                "description": "True if time is ambiguous and requires user clarification"
            },
            "clarification_question": {
                "type": ["string", "null"],
                "maxLength": 200,
                "description": "Question to ask user if needs_clarification is true"
            },
            "resolution_notes": {
                "type": ["string", "null"],
                "maxLength": 300,
                "description": "How the time was interpreted/resolved"
            }
        },
        "required": ["original_text", "kind", "needs_clarification"],
        "additionalProperties": False
    },
    "location_context": {
        "type": "object",
        "properties": {
            "location_used": {
                "type": "boolean",
                "description": "Whether user_location influenced interpretation"
            },
            "location_relevance": {
                "type": ["string", "null"],
                "maxLength": 200,
                "description": "Why location was or wasn't used"
            }
        },
        "required": ["location_used"],
        "additionalProperties": False
    },
    "recurrence": {
        "type": "object",
        "properties": {
            "pattern": {
                "type": "string",
                "enum": ["none", "daily", "weekly", "monthly"]
            },
            "interval": {
                "type": "integer",
                "minimum": 1,
                "maximum": 365
            },
            "byweekday": {
                "type": "array",
                "items": {
                    "type": "string",
                    "enum": ["MO", "TU", "WE", "TH", "FR", "SA", "SU"]
                },
                "maxItems": 7
            }
        },
        "required": ["pattern"],
        "additionalProperties": False
    },
    "priority": {
        "type": "string",
        "enum": ["low", "normal", "high"]
    },
    "status": {
        "type": "string",
        "enum": ["active", "completed"]
    },
    "category_hint": {
        "type": "string",
        "enum": ["personal", "school", "work", "health", "finance", "idea", "other"]
    },
    "email_send_mode": {
        "type": "string",
        "enum": ["send", "draft"]
    }
}

# Reminder payload schema
REMINDER_PAYLOAD_SCHEMA = {
    "type": "object",
    "properties": {
        "reminder_text": {
            "type": "string",
            "maxLength": 1000,
            "description": "What to remind the user about"
        },
        "when": {"$ref": "#/$defs/time_interpretation"},
        "trigger_datetime_iso": {
            "type": ["string", "null"],
            "description": "ISO 8601 datetime when reminder should trigger (with offset)"
        },
        "recurrence": {"$ref": "#/$defs/recurrence"},
        "priority": {"$ref": "#/$defs/priority"},
        "snooze_minutes_default": {
            "type": "integer",
            "minimum": 1,
            "maximum": 1440,
            "default": 10
        }
    },
    "required": ["reminder_text", "when", "priority"],
    "additionalProperties": False
}

# Todo payload schema
TODO_PAYLOAD_SCHEMA = {
    "type": "object",
    "properties": {
        "task": {
            "type": "string",
            "maxLength": 1000,
            "description": "The task to complete"
        },
        "due": {"$ref": "#/$defs/time_interpretation"},
        "due_date_iso": {
            "type": ["string", "null"],
            "description": "ISO date YYYY-MM-DD if only date specified"
        },
        "due_datetime_iso": {
            "type": ["string", "null"],
            "description": "ISO 8601 datetime if specific time specified"
        },
        "priority": {"$ref": "#/$defs/priority"},
        "status_detail": {
            "type": "string",
            "enum": ["open", "done"]
        },
        "estimated_minutes": {
            "type": ["integer", "null"],
            "minimum": 1,
            "maximum": 10080
        },
        "project": {
            "type": ["string", "null"],
            "maxLength": 100
        },
        "checklist": {
            "type": "array",
            "items": {"type": "string", "maxLength": 200},
            "maxItems": 20
        }
    },
    "required": ["task", "priority", "status_detail"],
    "additionalProperties": False
}

# Note payload schema
NOTE_PAYLOAD_SCHEMA = {
    "type": "object",
    "properties": {
        "content": {
            "type": "string",
            "maxLength": 4000,
            "description": "Main note content"
        },
        "category_hint": {"$ref": "#/$defs/category_hint"},
        "pin": {
            "type": "boolean",
            "default": False
        },
        "related_entities": {
            "type": "array",
            "items": {"type": "string", "maxLength": 100},
            "maxItems": 12,
            "description": "People, places, or things mentioned"
        }
    },
    "required": ["content", "category_hint", "pin"],
    "additionalProperties": False
}

# Calendar placeholder payload schema
CALENDAR_PLACEHOLDER_PAYLOAD_SCHEMA = {
    "type": "object",
    "properties": {
        "intent": {
            "type": "string",
            "maxLength": 500,
            "description": "Description of the calendar event intent"
        },
        "event_title": {
            "type": "string",
            "maxLength": 200,
            "description": "Title for the calendar event"
        },
        "start": {"$ref": "#/$defs/time_interpretation"},
        "start_datetime_iso": {
            "type": ["string", "null"],
            "description": "ISO 8601 start datetime"
        },
        "end_datetime_iso": {
            "type": ["string", "null"],
            "description": "ISO 8601 end datetime"
        },
        "duration_minutes": {
            "type": ["integer", "null"],
            "minimum": 1,
            "maximum": 10080
        },
        "location_text": {
            "type": ["string", "null"],
            "maxLength": 200
        },
        "attendees_text": {
            "type": "array",
            "items": {"type": "string", "maxLength": 100},
            "maxItems": 20
        },
        "provider_event_id": {
            "type": ["string", "null"],
            "maxLength": 200,
            "description": "Provider event ID after execution"
        },
        "provider_event_link": {
            "type": ["string", "null"],
            "maxLength": 500,
            "description": "Provider event link after execution"
        }
    },
    "required": ["intent", "event_title", "start"],
    "additionalProperties": False
}

# Email payload schema
EMAIL_PAYLOAD_SCHEMA = {
    "type": "object",
    "properties": {
        "to_name": {
            "type": ["string", "null"],
            "maxLength": 120,
            "description": "Recipient name to resolve via contacts"
        },
        "to_email": {
            "type": ["string", "null"],
            "maxLength": 320,
            "description": "Recipient email if explicitly stated"
        },
        "subject": {
            "type": "string",
            "maxLength": 200
        },
        "body": {
            "type": "string",
            "maxLength": 8000
        },
        "cc": {
            "type": "array",
            "items": {"type": "string", "maxLength": 320},
            "maxItems": 25
        },
        "bcc": {
            "type": "array",
            "items": {"type": "string", "maxLength": 320},
            "maxItems": 25
        },
        "send_mode": {"$ref": "#/$defs/email_send_mode"},
        "provider_message_id": {
            "type": ["string", "null"],
            "maxLength": 200
        },
        "provider_thread_id": {
            "type": ["string", "null"],
            "maxLength": 200
        },
        "provider_draft_id": {
            "type": ["string", "null"],
            "maxLength": 200
        },
        "provider_status": {
            "type": ["string", "null"],
            "maxLength": 50
        }
    },
    "required": ["subject", "body"],
    "additionalProperties": False
}

# Main BrainDump Node Envelope schema
BRAINDUMP_NODE_SCHEMA = {
    "$schema": "https://json-schema.org/draft/2020-12/schema",
    "$id": "braindump.node.v1",
    "title": "BrainDump Node",
    "description": "A structured node from voice transcript",
    "type": "object",
    "$defs": DEFS,
    "properties": {
        "schema_version": {
            "type": "string",
            "const": "braindump.node.v1"
        },
        "node_type": {
            "type": "string",
            "enum": ["reminder", "todo", "note", "calendar_placeholder", "email"]
        },
        "title": {
            "type": "string",
            "maxLength": 120,
            "description": "Short summary for UI display"
        },
        "body": {
            "type": "string",
            "maxLength": 4000,
            "description": "Main text, cleaned version of transcript intent"
        },
        "tags": {
            "type": "array",
            "items": {"type": "string", "maxLength": 40},
            "maxItems": 12
        },
        "created_at_iso": {
            "type": "string",
            "description": "ISO 8601 UTC when node was created (server time)"
        },
        "captured_at_iso": {
            "type": "string",
            "description": "ISO 8601 when audio was captured (user time)"
        },
        "timezone": {
            "type": "string",
            "maxLength": 10,
            "description": "Timezone offset like -05:00"
        },
        "status": {"$ref": "#/$defs/status"},
        "confidence": {
            "type": "number",
            "minimum": 0,
            "maximum": 1,
            "description": "Model confidence in interpretation (0-1)"
        },
        "evidence": {
            "type": "array",
            "items": {"$ref": "#/$defs/evidence_item"},
            "minItems": 1,
            "maxItems": 5,
            "description": "Quotes from transcript supporting this node"
        },
        "time_interpretation": {"$ref": "#/$defs/time_interpretation"},
        "location_context": {"$ref": "#/$defs/location_context"},
        "reminder": REMINDER_PAYLOAD_SCHEMA,
        "todo": TODO_PAYLOAD_SCHEMA,
        "note": NOTE_PAYLOAD_SCHEMA,
        "calendar_placeholder": CALENDAR_PLACEHOLDER_PAYLOAD_SCHEMA,
        "email": EMAIL_PAYLOAD_SCHEMA,
        "global_warnings": {
            "type": "array",
            "items": {"type": "string", "maxLength": 300},
            "maxItems": 10
        },
        "parse_debug": {
            "type": "object",
            "properties": {
                "model_id": {"type": "string"},
                "latency_ms": {"type": "integer"},
                "tool_name_used": {"type": "string"},
                "fallback_used": {"type": "boolean"}
            },
            "additionalProperties": False
        }
    },
    "required": [
        "schema_version",
        "node_type",
        "title",
        "body",
        "tags",
        "status",
        "confidence",
        "evidence",
        "location_context"
    ],
    "additionalProperties": False
}


def get_node_schema():
    """Return the full BrainDump node schema."""
    return BRAINDUMP_NODE_SCHEMA


def get_schema_version():
    """Return the current schema version string."""
    return SCHEMA_VERSION
