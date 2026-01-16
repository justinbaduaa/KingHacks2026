"""Microsoft Calendar helpers via Microsoft Graph."""

import requests


GRAPH_BASE = "https://graph.microsoft.com/v1.0"


class MicrosoftGraphError(Exception):
    """Raised when Microsoft Graph calls fail."""


def _format_attendees(emails: list[str]) -> list[dict]:
    return [
        {"emailAddress": {"address": email}, "type": "required"}
        for email in emails
    ]


def create_calendar_event(
    access_token: str,
    title: str,
    start_datetime: str,
    end_datetime: str | None,
    description: str | None = None,
    location: str | None = None,
    attendees: list[str] | None = None,
) -> dict:
    url = f"{GRAPH_BASE}/me/events"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    event = {
        "subject": title,
        "start": {"dateTime": start_datetime},
    }
    if end_datetime:
        event["end"] = {"dateTime": end_datetime}
    if description:
        event["body"] = {"contentType": "Text", "content": description}
    if location:
        event["location"] = {"displayName": location}
    if attendees:
        event["attendees"] = _format_attendees(attendees)

    response = requests.post(url, headers=headers, json=event, timeout=20)
    if response.status_code not in (200, 201):
        try:
            error = response.json().get("error", {}).get("message")
        except Exception:
            error = response.text
        raise MicrosoftGraphError(f"Failed to create Microsoft calendar event: {error}")

    return response.json()
