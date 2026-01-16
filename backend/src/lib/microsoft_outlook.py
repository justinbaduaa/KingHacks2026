"""Microsoft Outlook mail helpers via Microsoft Graph."""

import requests


GRAPH_BASE = "https://graph.microsoft.com/v1.0"


class MicrosoftGraphError(Exception):
    """Raised when Microsoft Graph calls fail."""


def _format_recipients(emails: list[str]) -> list[dict]:
    return [{"emailAddress": {"address": email}} for email in emails]


def send_outlook_email(
    access_token: str,
    to_emails: list[str],
    subject: str,
    body: str,
    cc_emails: list[str] | None = None,
    bcc_emails: list[str] | None = None,
) -> dict:
    url = f"{GRAPH_BASE}/me/sendMail"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json",
    }

    message = {
        "subject": subject,
        "body": {"contentType": "Text", "content": body},
        "toRecipients": _format_recipients(to_emails),
    }
    if cc_emails:
        message["ccRecipients"] = _format_recipients(cc_emails)
    if bcc_emails:
        message["bccRecipients"] = _format_recipients(bcc_emails)

    payload = {"message": message}

    response = requests.post(url, headers=headers, json=payload, timeout=20)
    if response.status_code not in (200, 201, 202):
        try:
            error = response.json().get("error", {}).get("message")
        except Exception:
            error = response.text
        raise MicrosoftGraphError(f"Failed to send Outlook email: {error}")

    return {"status": "sent"}
