"""Integration execution entry point for node-based actions."""

import logging
import os
import time

from lib.calendar_execute import CalendarExecutionError, execute_calendar_event
from lib.contacts import get_contact_map
from lib.dynamo import get_item, put_item
from lib.gmail_execute import GmailExecutionError, execute_gmail_node
from lib.google_calendar import CalendarError
from lib.microsoft_oauth import MicrosoftOAuthError, refresh_access_token as refresh_ms_token
from lib.ms_calendar_execute import MicrosoftCalendarExecutionError, execute_ms_calendar_event
from lib.ms_email_execute import MicrosoftEmailExecutionError, execute_ms_email
from lib.oauth_refresh import refresh_access_token
from lib.slack_execute import SlackExecutionError, execute_slack_message
from lib.slack_targets import get_slack_targets

logger = logging.getLogger()
logger.setLevel(logging.INFO)


class IntegrationExecutionError(Exception):
    """Raised when an integration execution fails."""

    def __init__(self, message: str, status_code: int = 400):
        super().__init__(message)
        self.status_code = status_code


def _get_google_refresh_token(user_id: str) -> str:
    table_name = os.environ.get("INTEGRATIONS_TABLE_NAME")
    pk = f"user#{user_id}"
    sk = "integration#google"
    item = get_item(pk, sk, table_name=table_name)
    if not item or not item.get("refresh_token"):
        raise IntegrationExecutionError("Google integration not connected", 404)
    return item["refresh_token"]


def _get_google_access_token(user_id: str) -> str:
    client_id = os.environ.get("GOOGLE_OAUTH_CLIENT_ID")
    if not client_id:
        logger.error("GOOGLE_OAUTH_CLIENT_ID is not configured")
        raise IntegrationExecutionError("GOOGLE_OAUTH_CLIENT_ID is not configured", 500)

    refresh_token = _get_google_refresh_token(user_id)
    try:
        token_response = refresh_access_token("google", refresh_token)
    except ValueError as exc:
        message = str(exc)
        logger.warning("Google refresh token rejected: %s", message)
        if message.startswith("invalid_grant"):
            raise IntegrationExecutionError(
                "Google refresh token expired or revoked; reconnect required", 401
            )
        raise IntegrationExecutionError("Failed to refresh Google access token", 502)
    except Exception:
        logger.exception("Google access token refresh failed")
        raise IntegrationExecutionError("Failed to refresh Google access token", 502)

    access_token = token_response.get("access_token")
    if not access_token:
        raise IntegrationExecutionError("Missing access token in refresh response", 502)
    return access_token


def _get_slack_access_token(user_id: str) -> str:
    table_name = os.environ.get("INTEGRATIONS_TABLE_NAME")
    pk = f"user#{user_id}"
    sk = "integration#slack"
    item = get_item(pk, sk, table_name=table_name)
    if not item or not item.get("access_token"):
        raise IntegrationExecutionError("Slack integration not connected", 404)

    expires_at = item.get("expires_at")
    if expires_at:
        try:
            if int(expires_at) <= int(time.time()):
                raise IntegrationExecutionError(
                    "Slack access token expired; reconnect required", 401
                )
        except (TypeError, ValueError):
            pass

    return item["access_token"]


def _get_microsoft_access_token(user_id: str) -> str:
    table_name = os.environ.get("INTEGRATIONS_TABLE_NAME")
    pk = f"user#{user_id}"
    sk = "integration#microsoft"
    item = get_item(pk, sk, table_name=table_name)
    if not item or not item.get("refresh_token"):
        raise IntegrationExecutionError("Microsoft integration not connected", 404)

    refresh_token = item.get("refresh_token")
    try:
        token_response = refresh_ms_token(refresh_token)
    except MicrosoftOAuthError as exc:
        message = str(exc)
        if "invalid_grant" in message:
            raise IntegrationExecutionError(
                "Microsoft refresh token expired or revoked; reconnect required", 401
            )
        raise IntegrationExecutionError(message, 502)
    except Exception:
        raise IntegrationExecutionError("Failed to refresh Microsoft access token", 502)

    access_token = token_response.get("access_token")
    if not access_token:
        raise IntegrationExecutionError("Missing access token in Microsoft refresh response", 502)

    new_refresh = token_response.get("refresh_token")
    if new_refresh and new_refresh != refresh_token:
        item["refresh_token"] = new_refresh
    item["access_token"] = access_token
    expires_in = token_response.get("expires_in")
    if expires_in:
        try:
            item["expires_at"] = int(time.time()) + int(expires_in)
        except (TypeError, ValueError):
            pass
    put_item(item, table_name=table_name)
    return access_token


def execute_node_integration(
    user_id: str,
    node: dict,
    require_supported: bool = True,
) -> tuple[dict, dict | None]:
    """Execute a node integration by type and return updated node + provider response."""
    node_type = node.get("node_type")
    node_id = node.get("node_id")

    logger.info("execute_node_integration start node_type=%s node_id=%s", node_type, node_id)

    if node_type not in ("calendar_placeholder", "email", "slack_message", "ms_email", "ms_calendar"):
        if require_supported:
            raise IntegrationExecutionError(
                "Only calendar_placeholder, email, slack_message, ms_email, or ms_calendar nodes can be executed",
                400,
            )
        return node, None

    if node_type == "calendar_placeholder":
        access_token = _get_google_access_token(user_id)
        try:
            updated_node, event_response = execute_calendar_event(access_token, node)
            event_id = (event_response or {}).get("id")
            logger.info(
                "execute_node_integration complete node_id=%s event_id=%s",
                node_id,
                event_id,
            )
            return updated_node, event_response
        except CalendarExecutionError as exc:
            raise IntegrationExecutionError(str(exc), exc.status_code)
        except CalendarError as exc:
            raise IntegrationExecutionError(str(exc), 502)
        except Exception:
            raise IntegrationExecutionError("Failed to create calendar event", 502)

    if node_type == "email":
        access_token = _get_google_access_token(user_id)
        contacts = get_contact_map(user_id)
        try:
            updated_node, email_response = execute_gmail_node(access_token, node, contacts)
            message_id = (email_response or {}).get("message_id")
            logger.info(
                "execute_node_integration complete node_id=%s message_id=%s",
                node_id,
                message_id,
            )
            return updated_node, email_response
        except GmailExecutionError as exc:
            raise IntegrationExecutionError(str(exc), exc.status_code)

    if node_type == "ms_email":
        ms_token = _get_microsoft_access_token(user_id)
        contacts = get_contact_map(user_id)
        try:
            updated_node, ms_response = execute_ms_email(ms_token, node, contacts)
            logger.info(
                "execute_node_integration complete node_id=%s ms_email_status=%s",
                node_id,
                (ms_response or {}).get("status"),
            )
            return updated_node, ms_response
        except MicrosoftEmailExecutionError as exc:
            raise IntegrationExecutionError(str(exc), exc.status_code)

    if node_type == "ms_calendar":
        ms_token = _get_microsoft_access_token(user_id)
        try:
            updated_node, ms_response = execute_ms_calendar_event(ms_token, node)
            logger.info(
                "execute_node_integration complete node_id=%s ms_event_id=%s",
                node_id,
                (ms_response or {}).get("id"),
            )
            return updated_node, ms_response
        except MicrosoftCalendarExecutionError as exc:
            raise IntegrationExecutionError(str(exc), exc.status_code)

    if node_type == "slack_message":
        slack_token = _get_slack_access_token(user_id)
        slack_targets = get_slack_targets(user_id)
        try:
            updated_node, slack_response = execute_slack_message(
                slack_token, node, slack_targets
            )
            message_ts = (slack_response or {}).get("message_ts")
            logger.info(
                "execute_node_integration complete node_id=%s slack_ts=%s",
                node_id,
                message_ts,
            )
            return updated_node, slack_response
        except SlackExecutionError as exc:
            raise IntegrationExecutionError(str(exc), exc.status_code)

    return node, None
