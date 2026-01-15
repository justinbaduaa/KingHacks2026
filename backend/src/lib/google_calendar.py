"""Google Calendar API integration utilities."""

import re
from datetime import datetime, timedelta
from typing import Optional, List, Union

import requests
from dateutil import parser as dateutil_parser


CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3"


class CalendarError(Exception):
    """Raised when Calendar API operations fail."""
    pass


def create_calendar_event(
    access_token: str,
    title: str,
    start_datetime: Union[datetime, str],
    end_datetime: Optional[Union[datetime, str]] = None,
    description: Optional[str] = None,
    attendees: Optional[List[str]] = None,
    location: Optional[str] = None,
    timezone: Optional[str] = None,
    calendar_id: str = "primary",
) -> dict:
    """
    Create a Google Calendar event.

    Args:
        access_token: OAuth access token for Google Calendar API
        title: Event title/summary
        start_datetime: Event start time (datetime or ISO string)
        end_datetime: Event end time (defaults to 1 hour after start)
        description: Optional event description
        attendees: Optional list of attendee email addresses
        location: Optional event location
        timezone: Optional timezone ID (if omitted, use offset in dateTime)
        calendar_id: Calendar ID to create event in (default: primary)

    Returns:
        dict: Created event data from Google API containing:
            - id: Event ID
            - htmlLink: URL to view event in Google Calendar
            - status: Event status (e.g., "confirmed")

    Raises:
        CalendarError: If event creation fails

    Example:
        >>> result = create_calendar_event(
        ...     access_token="ya29.xxx",
        ...     title="Team Meeting",
        ...     start_datetime=datetime(2026, 1, 12, 15, 0),
        ...     description="Weekly sync",
        ...     attendees=["sarah@example.com", "john@example.com"]
        ... )
        >>> print(result["htmlLink"])
        https://www.google.com/calendar/event?eid=...
    """
    def _is_date_only(value: object) -> bool:
        return isinstance(value, str) and re.match(r"^\d{4}-\d{2}-\d{2}$", value) is not None

    def _coerce_datetime(value: Union[datetime, str]) -> datetime:
        if isinstance(value, datetime):
            return value
        return dateutil_parser.isoparse(value)

    # Default end time to 1 hour after start if not provided
    if end_datetime is None:
        if _is_date_only(start_datetime):
            start_dt = _coerce_datetime(start_datetime)
            end_datetime = (start_dt + timedelta(days=1)).date().isoformat()
        else:
            start_dt = _coerce_datetime(start_datetime)
            end_datetime = start_dt + timedelta(hours=1)

    # Build event body
    if _is_date_only(start_datetime):
        start_payload = {"date": start_datetime}
    else:
        start_dt = _coerce_datetime(start_datetime)
        start_payload = {"dateTime": start_dt.isoformat()}
        if timezone:
            start_payload["timeZone"] = timezone

    if _is_date_only(end_datetime):
        end_payload = {"date": end_datetime}
    else:
        end_dt = _coerce_datetime(end_datetime)
        end_payload = {"dateTime": end_dt.isoformat()}
        if timezone:
            end_payload["timeZone"] = timezone

    event_body = {
        "summary": title,
        "start": start_payload,
        "end": end_payload,
    }

    # Add optional fields
    if description:
        event_body["description"] = description

    if location:
        event_body["location"] = location

    if attendees:
        event_body["attendees"] = [{"email": email} for email in attendees]

    # Make API request
    url = f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, headers=headers, json=event_body, timeout=30)

        if response.status_code == 401:
            raise CalendarError("Invalid or expired access token")

        if response.status_code == 403:
            raise CalendarError("Insufficient permissions to create calendar event")

        if response.status_code not in (200, 201):
            error_msg = response.json().get("error", {}).get("message", response.text)
            raise CalendarError(f"Failed to create event: {error_msg}")

        return response.json()

    except requests.exceptions.Timeout:
        raise CalendarError("Request to Google Calendar API timed out")
    except requests.exceptions.RequestException as e:
        raise CalendarError(f"Network error: {str(e)}")


def get_event(
    access_token: str,
    event_id: str,
    calendar_id: str = "primary",
) -> dict:
    """
    Get a calendar event by ID.

    Args:
        access_token: OAuth access token
        event_id: The event ID to retrieve
        calendar_id: Calendar ID (default: primary)

    Returns:
        dict: Event data

    Raises:
        CalendarError: If retrieval fails
    """
    url = f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events/{event_id}"
    headers = {
        "Authorization": f"Bearer {access_token}",
    }

    try:
        response = requests.get(url, headers=headers, timeout=30)

        if response.status_code == 404:
            raise CalendarError(f"Event not found: {event_id}")

        if response.status_code != 200:
            raise CalendarError(f"Failed to get event: {response.text}")

        return response.json()

    except requests.exceptions.RequestException as e:
        raise CalendarError(f"Network error: {str(e)}")


def delete_event(
    access_token: str,
    event_id: str,
    calendar_id: str = "primary",
) -> bool:
    """
    Delete a calendar event.

    Args:
        access_token: OAuth access token
        event_id: The event ID to delete
        calendar_id: Calendar ID (default: primary)

    Returns:
        bool: True if deletion was successful

    Raises:
        CalendarError: If deletion fails
    """
    url = f"{CALENDAR_API_BASE}/calendars/{calendar_id}/events/{event_id}"
    headers = {
        "Authorization": f"Bearer {access_token}",
    }

    try:
        response = requests.delete(url, headers=headers, timeout=30)

        if response.status_code == 404:
            raise CalendarError(f"Event not found: {event_id}")

        if response.status_code not in (200, 204):
            raise CalendarError(f"Failed to delete event: {response.text}")

        return True

    except requests.exceptions.RequestException as e:
        raise CalendarError(f"Network error: {str(e)}")
