"""Unified action executor for approved cards."""

import os
from datetime import datetime

from dateutil.parser import isoparse

from lib.auth import get_user_id
from lib.dynamo import get_item, put_item
from lib.oauth_refresh import refresh_access_token
from lib.gmail import send_email, create_draft, GmailError
from lib.google_calendar import create_calendar_event, CalendarError
from lib.json_utils import parse_body
from lib.response import api_response, error_response


def handler(event, context):
    """Route action to appropriate handler based on type.

    POST /actions/execute

    Request body:
        type: Action type (email, reminder, calendar, meeting, todo, task, note)
        execution_mode: "execute" or "draft" (for email types)
        ... plus type-specific fields:

        For email/reminder:
            to: Recipient email
            subject: Email subject
            body: Email body
            html: (optional) If true, body is HTML

        For calendar/meeting/event:
            title: Event title
            start_time: ISO datetime
            end_time: (optional) ISO datetime
            description: (optional)
            attendees: (optional) list of emails
            timezone: (optional, default: UTC)

        For todo/task/note:
            content: Task content
            (These are stored locally, not sent to Google)

    Returns:
        200: {success: true, ...type-specific response}
        400: Invalid action type or missing fields
        401: Unauthorized
        404: Google integration not connected (for Google actions)
        502: API error
    """
    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized")

    body = parse_body(event)
    action_type = (body.get("type") or "").lower()
    execution_mode = body.get("execution_mode", "execute")

    # Email/Reminder actions -> Gmail
    if action_type in ("email", "reminder", "gmail"):
        return handle_gmail_action(user_id, body, execution_mode)

    # Calendar/Meeting/Event actions -> Google Calendar
    elif action_type in ("calendar", "meeting", "event"):
        return handle_calendar_action(user_id, body)

    # Local-only actions (todo, task, note)
    elif action_type in ("todo", "task", "note"):
        return handle_local_action(user_id, body, action_type)

    else:
        return error_response(400, f"Unknown action type: {action_type}")


def get_google_access_token(user_id):
    """Retrieve and refresh Google access token for user.

    Returns:
        tuple: (access_token, error_response)
        If successful, error_response is None.
        If failed, access_token is None and error_response contains the API response.
    """
    table_name = os.environ.get("INTEGRATIONS_TABLE_NAME")
    pk = f"user#{user_id}"
    sk = "integration#google"
    item = get_item(pk, sk, table_name=table_name)

    if not item or not item.get("refresh_token"):
        return None, error_response(404, "Google integration not connected")

    try:
        token_response = refresh_access_token("google", item["refresh_token"])
    except ValueError as exc:
        message = str(exc)
        if message.startswith("invalid_grant"):
            return None, error_response(401, "Google token expired or revoked; reconnect required")
        return None, error_response(502, "Failed to refresh Google access token")
    except Exception:
        return None, error_response(502, "Failed to refresh Google access token")

    access_token = token_response.get("access_token")
    if not access_token:
        return None, error_response(502, "Missing access token in refresh response")

    return access_token, None


def handle_gmail_action(user_id, body, execution_mode):
    """Handle Gmail send/draft actions."""
    to = body.get("to")
    subject = body.get("subject")
    email_body = body.get("body")
    html = body.get("html", False)

    if not all([to, subject, email_body]):
        return error_response(400, "Missing required fields for email: to, subject, body")

    access_token, err = get_google_access_token(user_id)
    if err:
        return err

    try:
        if execution_mode == "execute":
            result = send_email(access_token, to, subject, email_body, html=html)
            return api_response(200, {
                "success": True,
                "action": "email_sent",
                "message_id": result.get("id"),
                "thread_id": result.get("threadId"),
            })
        else:  # draft
            result = create_draft(access_token, to, subject, email_body, html=html)
            return api_response(200, {
                "success": True,
                "action": "draft_created",
                "draft_id": result.get("id"),
            })
    except GmailError as e:
        return error_response(502, str(e))


def handle_calendar_action(user_id, body):
    """Handle Google Calendar event creation."""
    title = body.get("title")
    start_time = body.get("start_time")
    end_time = body.get("end_time")
    description = body.get("description")
    attendees = body.get("attendees", [])
    timezone = body.get("timezone", "UTC")

    if not title or not start_time:
        return error_response(400, "Missing required fields for calendar: title, start_time")

    try:
        start_datetime = isoparse(start_time)
        end_datetime = isoparse(end_time) if end_time else None
    except (ValueError, TypeError):
        return error_response(400, "Invalid datetime format. Use ISO 8601 format.")

    access_token, err = get_google_access_token(user_id)
    if err:
        return err

    try:
        result = create_calendar_event(
            access_token=access_token,
            title=title,
            start_datetime=start_datetime,
            end_datetime=end_datetime,
            description=description,
            attendees=attendees,
            timezone=timezone,
        )
        return api_response(200, {
            "success": True,
            "action": "event_created",
            "event_id": result.get("id"),
            "html_link": result.get("htmlLink"),
        })
    except CalendarError as e:
        return error_response(502, str(e))


def handle_local_action(user_id, body, action_type):
    """Handle local-only actions (todo, task, note).

    These are stored in DynamoDB but don't trigger external APIs.
    """
    content = body.get("content") or body.get("text") or body.get("body")

    if not content:
        return error_response(400, f"Missing content for {action_type}")

    # Generate a simple ID for the item
    import uuid
    item_id = str(uuid.uuid4())
    now = datetime.utcnow().isoformat() + "Z"

    table_name = os.environ.get("TABLE_NAME")
    pk = f"user#{user_id}"
    sk = f"{action_type}#{item_id}"

    item = {
        "pk": pk,
        "sk": sk,
        "id": item_id,
        "type": action_type,
        "content": content,
        "completed": False,
        "created_at": now,
        "updated_at": now,
    }

    put_item(item, table_name=table_name)

    return api_response(200, {
        "success": True,
        "action": f"{action_type}_stored",
        "id": item_id,
    })
