#!/usr/bin/env python3
"""
Seed Slack target mappings into the integrations table.

Usage:
  python seed_slack_targets.py --user-id <USER_ID> \
    --channels '{"general":"C123"}' --users '{"Evan":"U123"}'
"""

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parent.parent / "src"))

from lib.slack_targets import upsert_slack_targets  # noqa: E402


def parse_json(value: str) -> dict:
    if not value:
        return {}
    return json.loads(value)


def main() -> int:
    parser = argparse.ArgumentParser(description="Seed Slack targets in DynamoDB")
    parser.add_argument("--user-id", required=True)
    parser.add_argument("--channels", default="{}")
    parser.add_argument("--users", default="{}")
    parser.add_argument("--table-name", default=os.environ.get("INTEGRATIONS_TABLE_NAME"))
    args = parser.parse_args()

    channels = parse_json(args.channels)
    users = parse_json(args.users)
    if not isinstance(channels, dict) or not isinstance(users, dict):
        raise ValueError("channels and users must be JSON objects")

    upsert_slack_targets(
        args.user_id,
        channels=channels,
        users=users,
        table_name=args.table_name,
    )
    print(f"Stored {len(channels)} channels and {len(users)} users for {args.user_id}.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
