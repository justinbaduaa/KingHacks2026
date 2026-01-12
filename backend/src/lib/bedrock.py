"""AWS Bedrock utilities for Claude AI integration."""

import json
import boto3
from typing import Optional

from lib.models import ClassificationResult, ExtractedEntities, IntentCategory


SYSTEM_PROMPT = """You are an AI assistant that classifies user voice transcriptions and extracts relevant entities.

Given a transcription, you must:

1. Classify the intent into exactly ONE of these categories:
   - reminder: User wants to be reminded about something at a specific time
   - task: User wants to create a to-do item or task
   - email_draft: User wants to compose or send an email
   - calendar_event: User wants to schedule a meeting or event
   - note: User wants to capture a general note or thought

2. Extract relevant entities:
   - dates: Any dates mentioned (convert to ISO 8601 format: YYYY-MM-DD)
   - times: Any times mentioned (convert to 24-hour format: HH:MM)
   - people: Names of people mentioned
   - topics: Main subjects or topics
   - action_type: The specific action (e.g., "call", "send", "meet", "buy", "review")
   - title: A concise title for the item (max 50 characters)
   - description: A longer description if applicable
   - email_to: Email recipient (for email_draft intent only)
   - email_subject: Email subject line (for email_draft intent only)
   - email_body: Email body content (for email_draft intent only)

IMPORTANT RULES:
- Always respond with valid JSON only, no additional text
- Use the exact JSON format specified below
- For relative dates like "tomorrow" or "next Monday", calculate the actual date using the provided current date
- If no time is specified for calendar events, default to 09:00
- For email_draft, try to infer recipient from context (e.g., "email Sarah" -> email_to could be "Sarah")
- Confidence should reflect how certain you are about the classification (0.0 to 1.0)

OUTPUT FORMAT (JSON only, no markdown):
{
    "intent": "reminder|task|email_draft|calendar_event|note",
    "confidence": 0.95,
    "entities": {
        "dates": ["YYYY-MM-DD"],
        "times": ["HH:MM"],
        "people": ["name1", "name2"],
        "topics": ["topic1", "topic2"],
        "action_type": "action",
        "title": "concise title here",
        "description": "longer description if needed",
        "email_to": "recipient@email.com or name",
        "email_subject": "subject line",
        "email_body": "email body text"
    },
    "raw_summary": "Brief one-sentence summary of what user wants"
}

Omit any entity fields that are not applicable (don't include null values, just omit the field)."""


class BedrockError(Exception):
    """Raised when Bedrock API calls fail."""
    pass


def get_bedrock_client():
    """Get Bedrock runtime client."""
    return boto3.client("bedrock-runtime")


def invoke_claude(
    prompt: str,
    current_date: str,
    model_id: str = "anthropic.claude-3-sonnet-20240229-v1:0",
    max_tokens: int = 1024,
) -> dict:
    """
    Invoke Claude model via Bedrock for intent classification.

    Args:
        prompt: The voice transcription to classify
        current_date: Current date in YYYY-MM-DD format for resolving relative dates
        model_id: Bedrock model ID (default: Claude 3 Sonnet)
        max_tokens: Maximum response tokens

    Returns:
        Parsed JSON response from Claude

    Raises:
        BedrockError: If the API call fails or response parsing fails
    """
    client = get_bedrock_client()

    user_message = f"""Current date: {current_date}

Transcription to classify:
"{prompt}"

Respond with JSON only."""

    request_body = {
        "anthropic_version": "bedrock-2023-05-31",
        "max_tokens": max_tokens,
        "system": SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": user_message
            }
        ],
    }

    try:
        response = client.invoke_model(
            modelId=model_id,
            contentType="application/json",
            accept="application/json",
            body=json.dumps(request_body),
        )

        response_body = json.loads(response["body"].read())
        content = response_body["content"][0]["text"]

        # Parse the JSON response - handle potential markdown wrapping
        content = content.strip()
        if content.startswith("```json"):
            content = content[7:]
        if content.startswith("```"):
            content = content[3:]
        if content.endswith("```"):
            content = content[:-3]
        content = content.strip()

        return json.loads(content)

    except client.exceptions.ClientError as e:
        raise BedrockError(f"Bedrock API error: {str(e)}")
    except json.JSONDecodeError as e:
        raise BedrockError(f"Failed to parse Claude response as JSON: {str(e)}")
    except KeyError as e:
        raise BedrockError(f"Unexpected response structure: {str(e)}")


def classify_transcription(transcription: str, current_date: str) -> ClassificationResult:
    """
    Classify a voice transcription and extract entities.

    Args:
        transcription: The voice transcription text
        current_date: Current date in YYYY-MM-DD format for resolving relative dates

    Returns:
        ClassificationResult with intent and extracted entities

    Raises:
        BedrockError: If classification fails
    """
    raw_result = invoke_claude(transcription, current_date)

    # Parse entities with defaults for missing fields
    entities_data = raw_result.get("entities", {})
    entities = ExtractedEntities(
        dates=entities_data.get("dates", []),
        times=entities_data.get("times", []),
        people=entities_data.get("people", []),
        topics=entities_data.get("topics", []),
        action_type=entities_data.get("action_type"),
        title=entities_data.get("title"),
        description=entities_data.get("description"),
        email_to=entities_data.get("email_to"),
        email_subject=entities_data.get("email_subject"),
        email_body=entities_data.get("email_body"),
    )

    # Parse intent
    intent_str = raw_result.get("intent", "note")
    try:
        intent = IntentCategory(intent_str)
    except ValueError:
        intent = IntentCategory.NOTE

    return ClassificationResult(
        intent=intent,
        confidence=raw_result.get("confidence", 0.5),
        entities=entities,
        raw_summary=raw_result.get("raw_summary", transcription),
    )
