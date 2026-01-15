"""Gmail API integration utilities."""

import base64
import requests
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from typing import Optional


GMAIL_API_BASE = "https://gmail.googleapis.com/gmail/v1"


class GmailError(Exception):
    """Raised when Gmail API operations fail."""
    pass


def _format_address_list(value) -> str:
    if not value:
        return ""
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        return ", ".join([entry for entry in value if entry])
    return str(value)


def create_message(
    to: str | list,
    subject: str,
    body: str,
    sender: Optional[str] = None,
    cc: Optional[list[str] | str] = None,
    bcc: Optional[list[str] | str] = None,
    html: bool = False,
) -> str:
    """
    Create a base64url encoded email message (RFC 2822 format).

    Args:
        to: Recipient email address
        subject: Email subject line
        body: Email body text
        sender: Optional sender email (defaults to authenticated user)
        cc: Optional cc list or comma-separated string
        bcc: Optional bcc list or comma-separated string
        html: If True, treat body as HTML content

    Returns:
        str: Base64url encoded message ready for Gmail API

    Example:
        >>> raw = create_message("john@example.com", "Hello", "Hi John!")
        >>> # raw is now a base64url encoded string
    """
    content_type = "html" if html else "plain"
    message = MIMEText(body, content_type)
    message["to"] = _format_address_list(to)
    message["subject"] = subject
    if cc:
        message["cc"] = _format_address_list(cc)
    if bcc:
        message["bcc"] = _format_address_list(bcc)

    if sender:
        message["from"] = sender

    # Encode as base64url (Gmail API requirement)
    raw = base64.urlsafe_b64encode(message.as_bytes()).decode("utf-8")
    return raw


def create_draft(
    access_token: str,
    to: str | list,
    subject: str,
    body: str,
    cc: Optional[list[str] | str] = None,
    bcc: Optional[list[str] | str] = None,
    html: bool = False,
) -> dict:
    """
    Create a Gmail draft.

    Args:
        access_token: OAuth access token for Gmail API
        to: Recipient email address
        subject: Email subject line
        body: Email body text
        cc: Optional cc list or comma-separated string
        bcc: Optional bcc list or comma-separated string
        html: If True, treat body as HTML content

    Returns:
        dict: Created draft data from Gmail API containing:
            - id: Draft ID
            - message: Message object with id and threadId

    Raises:
        GmailError: If draft creation fails

    Example:
        >>> result = create_draft(
        ...     access_token="ya29.xxx",
        ...     to="john@example.com",
        ...     subject="Project Update",
        ...     body="Hi John,\\n\\nHere's the update..."
        ... )
        >>> print(result["id"])
        r1234567890
    """
    raw_message = create_message(to, subject, body, cc=cc, bcc=bcc, html=html)

    draft_body = {
        "message": {
            "raw": raw_message,
        }
    }

    url = f"{GMAIL_API_BASE}/users/me/drafts"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, headers=headers, json=draft_body, timeout=30)

        if response.status_code == 401:
            raise GmailError("Invalid or expired access token")

        if response.status_code == 403:
            raise GmailError("Insufficient permissions to create draft")

        if response.status_code not in (200, 201):
            error_msg = response.json().get("error", {}).get("message", response.text)
            raise GmailError(f"Failed to create draft: {error_msg}")

        return response.json()

    except requests.exceptions.Timeout:
        raise GmailError("Request to Gmail API timed out")
    except requests.exceptions.RequestException as e:
        raise GmailError(f"Network error: {str(e)}")


def send_email(
    access_token: str,
    to: str | list,
    subject: str,
    body: str,
    cc: Optional[list[str] | str] = None,
    bcc: Optional[list[str] | str] = None,
    html: bool = False,
) -> dict:
    """
    Send an email directly (not as draft).

    Args:
        access_token: OAuth access token for Gmail API
        to: Recipient email address
        subject: Email subject line
        body: Email body text
        cc: Optional cc list or comma-separated string
        bcc: Optional bcc list or comma-separated string
        html: If True, treat body as HTML content

    Returns:
        dict: Sent message data from Gmail API containing:
            - id: Message ID
            - threadId: Thread ID
            - labelIds: Applied labels

    Raises:
        GmailError: If sending fails

    Example:
        >>> result = send_email(
        ...     access_token="ya29.xxx",
        ...     to="john@example.com",
        ...     subject="Quick Question",
        ...     body="Hey, do you have a minute?"
        ... )
        >>> print(result["id"])
    """
    raw_message = create_message(to, subject, body, cc=cc, bcc=bcc, html=html)

    send_body = {
        "raw": raw_message,
    }

    url = f"{GMAIL_API_BASE}/users/me/messages/send"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    try:
        response = requests.post(url, headers=headers, json=send_body, timeout=30)

        if response.status_code == 401:
            raise GmailError("Invalid or expired access token")

        if response.status_code == 403:
            raise GmailError("Insufficient permissions to send email")

        if response.status_code not in (200, 201):
            error_msg = response.json().get("error", {}).get("message", response.text)
            raise GmailError(f"Failed to send email: {error_msg}")

        return response.json()

    except requests.exceptions.Timeout:
        raise GmailError("Request to Gmail API timed out")
    except requests.exceptions.RequestException as e:
        raise GmailError(f"Network error: {str(e)}")


def get_draft(
    access_token: str,
    draft_id: str,
) -> dict:
    """
    Get a draft by ID.

    Args:
        access_token: OAuth access token
        draft_id: The draft ID to retrieve

    Returns:
        dict: Draft data

    Raises:
        GmailError: If retrieval fails
    """
    url = f"{GMAIL_API_BASE}/users/me/drafts/{draft_id}"
    headers = {
        "Authorization": f"Bearer {access_token}",
    }

    try:
        response = requests.get(url, headers=headers, timeout=30)

        if response.status_code == 404:
            raise GmailError(f"Draft not found: {draft_id}")

        if response.status_code != 200:
            raise GmailError(f"Failed to get draft: {response.text}")

        return response.json()

    except requests.exceptions.RequestException as e:
        raise GmailError(f"Network error: {str(e)}")


def delete_draft(
    access_token: str,
    draft_id: str,
) -> bool:
    """
    Delete a draft.

    Args:
        access_token: OAuth access token
        draft_id: The draft ID to delete

    Returns:
        bool: True if deletion was successful

    Raises:
        GmailError: If deletion fails
    """
    url = f"{GMAIL_API_BASE}/users/me/drafts/{draft_id}"
    headers = {
        "Authorization": f"Bearer {access_token}",
    }

    try:
        response = requests.delete(url, headers=headers, timeout=30)

        if response.status_code == 404:
            raise GmailError(f"Draft not found: {draft_id}")

        if response.status_code not in (200, 204):
            raise GmailError(f"Failed to delete draft: {response.text}")

        return True

    except requests.exceptions.RequestException as e:
        raise GmailError(f"Network error: {str(e)}")
