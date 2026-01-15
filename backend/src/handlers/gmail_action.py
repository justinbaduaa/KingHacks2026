"""Handler for Gmail actions (send email / create draft)."""

import os

from lib.auth import get_user_id
from lib.dynamo import get_item
from lib.oauth_refresh import refresh_access_token
from lib.gmail import send_email, create_draft, GmailError
from lib.json_utils import parse_body
from lib.response import api_response, error_response


def handler(event, context):
    """Execute Gmail action: send or create draft.

    POST /integrations/google/gmail/action

    Request body:
        action_type: "send" or "draft"
        to: Recipient email address
        subject: Email subject
        body: Email body text
        html: (optional) If true, body is HTML

    Returns:
        200: {success: true, message_id/draft_id: "..."}
        400: Missing required fields or invalid action_type
        401: Unauthorized or token expired
        404: Google integration not connected
        502: Gmail API or token refresh error
    """
    user_id = get_user_id(event)
    if not user_id:
        return error_response(401, "Unauthorized")

    body = parse_body(event)
    action_type = body.get("action_type")
    to = body.get("to")
    subject = body.get("subject")
    email_body = body.get("body")
    html = body.get("html", False)

    if not all([action_type, to, subject, email_body]):
        return error_response(400, "Missing required fields: action_type, to, subject, body")

    if action_type not in ("send", "draft"):
        return error_response(400, "action_type must be 'send' or 'draft'")

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

    # Execute action
    try:
        if action_type == "send":
            result = send_email(access_token, to, subject, email_body, html=html)
            return api_response(200, {
                "success": True,
                "message_id": result.get("id"),
                "thread_id": result.get("threadId"),
            })
        else:  # draft
            result = create_draft(access_token, to, subject, email_body, html=html)
            return api_response(200, {
                "success": True,
                "draft_id": result.get("id"),
                "message": result.get("message", {}),
            })
    except GmailError as e:
        return error_response(502, str(e))
