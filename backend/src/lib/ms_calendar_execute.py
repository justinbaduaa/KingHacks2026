"""Microsoft Calendar execution helpers."""

import logging

from lib.calendar_execute import resolve_calendar_times, build_calendar_event_details
from lib.microsoft_calendar import MicrosoftGraphError, create_calendar_event

logger = logging.getLogger()
logger.setLevel(logging.INFO)


class MicrosoftCalendarExecutionError(Exception):
    """Raised when Microsoft calendar execution fails."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def apply_ms_calendar_metadata(node: dict, event_response: dict) -> dict:
    updated = dict(node)
    calendar = dict(updated.get("ms_calendar") or {})
    event_id = event_response.get("id")
    event_link = event_response.get("webLink")
    if event_id:
        calendar["provider_event_id"] = event_id
    if event_link:
        calendar["provider_event_link"] = event_link
    updated["ms_calendar"] = calendar
    return updated


def execute_ms_calendar_event(access_token: str, node: dict) -> tuple[dict, dict]:
    start_iso, end_iso = resolve_calendar_times({"calendar_placeholder": node.get("ms_calendar"), **node})
    if not end_iso:
        raise MicrosoftCalendarExecutionError("Missing end time for Microsoft calendar event", 400)
    details = build_calendar_event_details({"calendar_placeholder": node.get("ms_calendar"), **node}, start_iso, end_iso)

    try:
        event_response = create_calendar_event(
            access_token=access_token,
            title=details["title"],
            start_datetime=details["start_datetime"],
            end_datetime=details["end_datetime"],
            description=details["description"],
            location=details["location"],
            attendees=details["attendees"],
        )
    except MicrosoftGraphError as exc:
        raise MicrosoftCalendarExecutionError(str(exc), 502)
    except Exception:
        logger.exception("Failed to create Microsoft calendar event")
        raise MicrosoftCalendarExecutionError("Failed to create Microsoft calendar event", 502)

    updated_node = apply_ms_calendar_metadata(node, event_response)
    return updated_node, event_response
