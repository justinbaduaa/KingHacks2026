"""Gmail execution helpers for email nodes."""

import logging
from typing import Dict, List

from lib.contacts import resolve_contact_email
from lib.gmail import GmailError, create_draft, send_email

logger = logging.getLogger()
logger.setLevel(logging.INFO)


class GmailExecutionError(Exception):
    """Raised when Gmail execution fails."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _normalize_recipients(value) -> List[str]:
    if not value:
        return []
    if isinstance(value, str):
        parts = [entry.strip() for entry in value.split(",")]
        return [entry for entry in parts if entry]
    if isinstance(value, list):
        return [str(entry).strip() for entry in value if str(entry).strip()]
    return []


def _resolve_to_email(email_payload: dict, contacts: Dict[str, str]) -> str:
    to_email = email_payload.get("to_email")
    to_name = email_payload.get("to_name")

    if isinstance(to_email, str) and to_email.strip():
        return to_email.strip()
    if isinstance(to_email, list):
        joined = ", ".join([str(entry).strip() for entry in to_email if str(entry).strip()])
        if joined:
            return joined

    if isinstance(to_name, str) and to_name.strip():
        if "@" in to_name:
            return to_name.strip()
        resolved = resolve_contact_email(to_name, contacts)
        if resolved:
            return resolved

    return ""


def execute_gmail_node(
    access_token: str,
    node: dict,
    contacts: Dict[str, str],
) -> tuple[dict, dict]:
    """Execute Gmail action for an email node."""
    email_payload = node.get("email") or {}
    subject = (email_payload.get("subject") or "").strip()
    body = (email_payload.get("body") or "").strip()
    send_mode = (email_payload.get("send_mode") or "send").strip().lower()

    if not subject:
        raise GmailExecutionError("Missing email subject", 400)
    if not body:
        raise GmailExecutionError("Missing email body", 400)

    to_email = _resolve_to_email(email_payload, contacts)
    if not to_email:
        raise GmailExecutionError("Missing recipient email", 400)

    cc = _normalize_recipients(email_payload.get("cc"))
    bcc = _normalize_recipients(email_payload.get("bcc"))

    if send_mode not in ("send", "draft"):
        send_mode = "send"

    try:
        if send_mode == "draft":
            result = create_draft(
                access_token=access_token,
                to=to_email,
                subject=subject,
                body=body,
                cc=cc,
                bcc=bcc,
            )
            provider_response = {
                "draft_id": result.get("id"),
                "message_id": (result.get("message") or {}).get("id"),
                "thread_id": (result.get("message") or {}).get("threadId"),
                "status": "drafted",
            }
        else:
            result = send_email(
                access_token=access_token,
                to=to_email,
                subject=subject,
                body=body,
                cc=cc,
                bcc=bcc,
            )
            provider_response = {
                "message_id": result.get("id"),
                "thread_id": result.get("threadId"),
                "status": "sent",
            }
    except GmailError as exc:
        raise GmailExecutionError(str(exc), 502)
    except Exception:
        logger.exception("Failed to execute Gmail action")
        raise GmailExecutionError("Failed to execute Gmail action", 502)

    updated_node = dict(node)
    email_payload_updated = dict(email_payload)
    email_payload_updated["to_email"] = to_email
    email_payload_updated["provider_message_id"] = provider_response.get("message_id")
    email_payload_updated["provider_thread_id"] = provider_response.get("thread_id")
    email_payload_updated["provider_draft_id"] = provider_response.get("draft_id")
    email_payload_updated["provider_status"] = provider_response.get("status")
    updated_node["email"] = email_payload_updated

    return updated_node, provider_response
