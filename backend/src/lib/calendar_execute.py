"""Calendar execution helpers for node-based scheduling."""

from datetime import timedelta
from typing import Optional, Tuple

from dateutil import parser as dateutil_parser

from lib.google_calendar import CalendarError, create_calendar_event


class CalendarExecutionError(Exception):
    """Raised when a calendar node cannot be executed."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _parse_datetime(value: str):
    try:
        return dateutil_parser.isoparse(value)
    except Exception:
        return None


def resolve_calendar_times(node: dict) -> Tuple[str, Optional[str]]:
    """Resolve start/end ISO strings for a calendar node."""
    calendar = node.get("calendar_placeholder") or {}
    start_info = calendar.get("start") or {}

    if start_info.get("needs_clarification"):
        raise CalendarExecutionError("Calendar time needs clarification", 400)

    start_iso = (
        calendar.get("start_datetime_iso")
        or start_info.get("resolved_start_iso")
        or (node.get("time_interpretation") or {}).get("resolved_start_iso")
    )

    if not start_iso:
        raise CalendarExecutionError("Missing start time for calendar event", 400)

    end_iso = (
        calendar.get("end_datetime_iso")
        or start_info.get("resolved_end_iso")
        or (node.get("time_interpretation") or {}).get("resolved_end_iso")
    )

    if not end_iso:
        duration_minutes = calendar.get("duration_minutes")
        if duration_minutes:
            start_dt = _parse_datetime(start_iso)
            if start_dt:
                end_iso = (start_dt + timedelta(minutes=duration_minutes)).isoformat()

    return start_iso, end_iso


def build_calendar_event_details(node: dict, start_iso: str, end_iso: Optional[str]) -> dict:
    """Build the Google Calendar event details from a calendar node."""
    calendar = node.get("calendar_placeholder") or {}

    title = calendar.get("event_title") or node.get("title") or calendar.get("intent") or "Untitled Event"
    description = calendar.get("intent") or node.get("body")
    location = calendar.get("location_text")

    attendees_text = calendar.get("attendees_text") or []
    attendees = []
    for entry in attendees_text:
        if not isinstance(entry, str):
            continue
        email = entry.strip()
        if "@" in email:
            attendees.append(email)

    return {
        "title": title,
        "start_datetime": start_iso,
        "end_datetime": end_iso,
        "description": description,
        "location": location,
        "attendees": attendees or None,
    }


def apply_calendar_execution_metadata(node: dict, event_response: dict) -> dict:
    """Attach provider metadata to the calendar payload."""
    updated = dict(node)
    calendar = dict(updated.get("calendar_placeholder") or {})

    event_id = event_response.get("id")
    event_link = event_response.get("htmlLink")
    if event_id:
        calendar["provider_event_id"] = event_id
    if event_link:
        calendar["provider_event_link"] = event_link

    updated["calendar_placeholder"] = calendar
    return updated


def execute_calendar_event(access_token: str, node: dict, calendar_id: str = "primary") -> tuple[dict, dict]:
    """Execute a calendar node by creating an event in Google Calendar."""
    start_iso, end_iso = resolve_calendar_times(node)
    details = build_calendar_event_details(node, start_iso, end_iso)

    event_response = create_calendar_event(
        access_token=access_token,
        title=details["title"],
        start_datetime=details["start_datetime"],
        end_datetime=details["end_datetime"],
        description=details["description"],
        location=details["location"],
        attendees=details["attendees"],
        timezone=None,
        calendar_id=calendar_id,
    )

    updated_node = apply_calendar_execution_metadata(node, event_response)
    return updated_node, event_response
