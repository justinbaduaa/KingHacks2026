"""Contacts utilities for user-defined integrations data."""

import os
from datetime import datetime, timezone
from typing import Dict

from lib.dynamo import get_item, put_item

CONTACTS_SK = "settings#contacts"


def _normalize_contact_name(name: str) -> str:
    return " ".join(name.strip().lower().split())


def get_contact_map(user_id: str, table_name: str | None = None) -> Dict[str, str]:
    """Return the contacts map for the user (name -> email)."""
    if not user_id:
        return {}
    resolved_table = table_name or os.environ.get("INTEGRATIONS_TABLE_NAME")
    if not resolved_table:
        return {}

    pk = f"user#{user_id}"
    item = get_item(pk, CONTACTS_SK, table_name=resolved_table)
    contacts = (item or {}).get("contacts") or {}
    if not isinstance(contacts, dict):
        return {}
    return {str(name): str(email) for name, email in contacts.items() if name and email}


def format_contacts_for_payload(contacts: Dict[str, str]) -> list[dict]:
    """Format contacts map into a list of {name, email} for LLM context."""
    formatted = []
    for name, email in contacts.items():
        if not name or not email:
            continue
        formatted.append({"name": name, "email": email})
    return formatted


def resolve_contact_email(name: str, contacts: Dict[str, str]) -> str:
    """Resolve a contact name to an email using case-insensitive matching."""
    if not name or not contacts:
        return ""
    normalized = _normalize_contact_name(name)
    for key, email in contacts.items():
        if _normalize_contact_name(key) == normalized:
            return email
    return ""


def upsert_contact_map(user_id: str, contacts: Dict[str, str], table_name: str | None = None) -> None:
    """Create or replace the contacts map for a user."""
    if not user_id:
        raise ValueError("user_id is required")
    resolved_table = table_name or os.environ.get("INTEGRATIONS_TABLE_NAME")
    if not resolved_table:
        raise ValueError("INTEGRATIONS_TABLE_NAME is not configured")

    now = datetime.now(timezone.utc).isoformat()
    pk = f"user#{user_id}"
    existing = get_item(pk, CONTACTS_SK, table_name=resolved_table)
    created_at = (existing or {}).get("created_at") or now

    item = {
        "pk": pk,
        "sk": CONTACTS_SK,
        "type": "contacts",
        "contacts": contacts,
        "created_at": created_at,
        "updated_at": now,
    }
    put_item(item, table_name=resolved_table)
