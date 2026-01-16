"""Microsoft Outlook email execution helpers."""

import logging
from typing import Dict, List

from lib.contacts import resolve_contact_email
from lib.microsoft_outlook import MicrosoftGraphError, send_outlook_email

logger = logging.getLogger()
logger.setLevel(logging.INFO)


class MicrosoftEmailExecutionError(Exception):
    """Raised when Outlook email execution fails."""

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


def _resolve_to_emails(payload: dict, contacts: Dict[str, str]) -> List[str]:
    to_email = payload.get("to_email")
    to_name = payload.get("to_name")
    recipients = _normalize_recipients(to_email)
    if recipients:
        return recipients

    if isinstance(to_name, str) and to_name.strip():
        if "@" in to_name:
            return [to_name.strip()]
        resolved = resolve_contact_email(to_name, contacts)
        if resolved:
            return [resolved]
    return []


def execute_ms_email(access_token: str, node: dict, contacts: Dict[str, str]) -> tuple[dict, dict]:
    payload = node.get("ms_email") or {}
    subject = (payload.get("subject") or "").strip()
    body = (payload.get("body") or "").strip()

    if not subject:
        raise MicrosoftEmailExecutionError("Missing email subject", 400)
    if not body:
        raise MicrosoftEmailExecutionError("Missing email body", 400)

    to_emails = _resolve_to_emails(payload, contacts)
    if not to_emails:
        raise MicrosoftEmailExecutionError("Missing recipient email", 400)

    cc = _normalize_recipients(payload.get("cc"))
    bcc = _normalize_recipients(payload.get("bcc"))

    try:
        result = send_outlook_email(
            access_token=access_token,
            to_emails=to_emails,
            subject=subject,
            body=body,
            cc_emails=cc or None,
            bcc_emails=bcc or None,
        )
    except MicrosoftGraphError as exc:
        raise MicrosoftEmailExecutionError(str(exc), 502)
    except Exception:
        logger.exception("Failed to send Outlook email")
        raise MicrosoftEmailExecutionError("Failed to send Outlook email", 502)

    updated_node = dict(node)
    updated_payload = dict(payload)
    updated_payload["provider_status"] = result.get("status")
    updated_payload["to_email"] = ", ".join(to_emails)
    updated_node["ms_email"] = updated_payload

    return updated_node, result
