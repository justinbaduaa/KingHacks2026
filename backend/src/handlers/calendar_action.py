"""Handler for Google Calendar actions."""

import os
from datetime import datetime

from dateutil.parser import isoparse

from lib.auth import get_user_id
from lib.dynamo import get_item
from lib.oauth_refresh import refresh_access_token
from lib.google_calendar import create_calendar_event, CalendarError
from lib.json_utils import parse_body
from lib.response import api_response, error_response


def handler(event, context):
    """Create a Google Calendar event.

    POST /integrations/google/calendar/action

    Request body:
        title: Event title/summary (required)
        start_time: ISO format datetime string (required)
        end_time: ISO format datetime string (optional, defaults to +1 hour)
        description: Event description (optional)
        attendees: List of email addresses (optional)
        timezone: Timezone string (optional, default: UTC)
        calendar_id: Calendar ID (optional, default: primary)

    Returns:
        200: {success: true, event_id: "...", html_link: "..."}
        400: Missing required fields or invalid datetime format
        401: Unauthorized or token expired
        404: Google integration not connected
        502: Calendar API or token refresh error
    """
    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized")

    body = parse_body(event)
    title = body.get("title")
    start_time = body.get("start_time")
    end_time = body.get("end_time")
    description = body.get("description")
    attendees = body.get("attendees", [])
    timezone = body.get("timezone", "UTC")
    calendar_id = body.get("calendar_id", "primary")

    if not title or not start_time:
        return error_response(400, "Missing required fields: title, start_time")

    # Parse datetime strings
    try:
        start_datetime = isoparse(start_time)
        end_datetime = isoparse(end_time) if end_time else None
    except (ValueError, TypeError):
        return error_response(400, "Invalid datetime format. Use ISO 8601 format.")

    # Get refresh token from IntegrationsTable
    table_name = os.environ.get("INTEGRATIONS_TABLE_NAME")
    pk = f"user#{user_id}"
    sk = "integration#google"
    item = get_item(pk, sk, table_name=table_name)

    if not item or not item.get("refresh_token"):
        return error_response(404, "Google integration not connected")

    # Refresh access token
    try:
        token_response = refresh_access_token("google", item["refresh_token"])
    except ValueError as exc:
        message = str(exc)
        if message.startswith("invalid_grant"):
            return error_response(401, "Google token expired or revoked; reconnect required")
        return error_response(502, "Failed to refresh Google access token")
    except Exception:
        return error_response(502, "Failed to refresh Google access token")

    access_token = token_response.get("access_token")
    if not access_token:
        return error_response(502, "Missing access token in refresh response")

    # Create event
    try:
        result = create_calendar_event(
            access_token=access_token,
            title=title,
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            description=description,
            attendees=attendees,
            timezone=timezone,
            calendar_id=calendar_id,
        )
        return api_response(200, {
            "success": True,
            "event_id": result.get("id"),
            "html_link": result.get("htmlLink"),
            "status": result.get("status"),
        })
    except CalendarError as e:
        return error_response(502, str(e))
