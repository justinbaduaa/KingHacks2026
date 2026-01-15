#!/usr/bin/env python3
"""
Seed user contacts into the integrations table.

Usage:
  python seed_contacts.py --user-id <USER_ID> --contacts '{"Evan":"evan@example.com"}'
  python seed_contacts.py --user-id <USER_ID> --contacts-file contacts.json

Contacts JSON must be an object mapping name -> email.
"""

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from lib.contacts import upsert_contact_map  # noqa: E402


def load_contacts(args: argparse.Namespace) -> dict:
    if args.contacts and args.contacts_file:
        raise ValueError("Provide either --contacts or --contacts-file, not both.")
    if args.contacts:
        return json.loads(args.contacts)
    if args.contacts_file:
        with open(args.contacts_file, "r", encoding="utf-8") as handle:
            return json.load(handle)
    raise ValueError("Missing contacts input. Use --contacts or --contacts-file.")


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed user contact map in DynamoDB")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--contacts")
    parser.add_argument("--contacts-file")
    parser.add_argument("--table-name", default=os.environ.get("INTEGRATIONS_TABLE_NAME"))
    args = parser.parse_args()

    contacts = load_contacts(args)
    if not isinstance(contacts, dict):
        raise ValueError("Contacts input must be a JSON object mapping name -> email.")

    upsert_contact_map(args.user_id, contacts, table_name=args.table_name)
    print(f"Stored {len(contacts)} contacts for user {args.user_id}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
