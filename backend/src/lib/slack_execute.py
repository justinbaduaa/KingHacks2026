"""Slack execution helpers."""

import logging
import requests

from lib.slack_targets import resolve_channel_id, resolve_user_id

logger = logging.getLogger()
logger.setLevel(logging.INFO)

SLACK_API_BASE = "https://slack.com/api"


class SlackExecutionError(Exception):
    """Raised when Slack execution fails."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _post_slack(access_token: str, path: str, payload: dict) -> dict:
    url = f"{SLACK_API_BASE}/{path}"
    headers = {
        "Authorization": f"Bearer {access_token}",
        "Content-Type": "application/json; charset=utf-8",
    }

    response = requests.post(url, headers=headers, json=payload, timeout=15)
    if response.status_code != 200:
        raise SlackExecutionError(f"Slack API error: HTTP {response.status_code}", 502)

    data = response.json()
    if not data.get("ok"):
        error = data.get("error") or "unknown_error"
        raise SlackExecutionError(f"Slack API error: {error}", 502)
    return data


def execute_slack_message(access_token: str, node: dict, targets: dict) -> tuple[dict, dict]:
    payload = node.get("slack_message") or {}
    message = (payload.get("message") or payload.get("text") or "").strip()
    if not message:
        raise SlackExecutionError("Missing Slack message text", 400)

    channel_id = resolve_channel_id(payload.get("channel_id"), payload.get("channel_name"), targets)
    recipient_id = resolve_user_id(payload.get("recipient_id"), payload.get("recipient_name"), targets)

    if not channel_id and recipient_id:
        dm_response = _post_slack(access_token, "conversations.open", {"users": recipient_id})
        channel_id = (dm_response.get("channel") or {}).get("id")

    if not channel_id:
        raise SlackExecutionError("Missing Slack channel or recipient", 400)

    post_payload = {"channel": channel_id, "text": message}
    post_response = _post_slack(access_token, "chat.postMessage", post_payload)

    updated_node = dict(node)
    slack_payload = dict(payload)
    slack_payload["provider_message_ts"] = post_response.get("ts")
    slack_payload["provider_channel_id"] = post_response.get("channel")
    slack_payload["provider_status"] = "sent"
    updated_node["slack_message"] = slack_payload

    provider_response = {
        "message_ts": post_response.get("ts"),
        "channel_id": post_response.get("channel"),
        "status": "sent",
    }

    return updated_node, provider_response
