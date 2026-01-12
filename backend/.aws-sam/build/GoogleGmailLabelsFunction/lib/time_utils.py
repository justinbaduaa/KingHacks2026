"""Time utilities."""

from datetime import datetime, timezone
from dateutil import parser


def utc_now() -> datetime:
    """Get current UTC datetime."""
    return datetime.now(timezone.utc)


def to_iso(dt: datetime) -> str:
    """Convert datetime to ISO format string."""
    return dt.isoformat()


def from_iso(s: str) -> datetime:
    """Parse ISO format string to datetime."""
    return parser.isoparse(s)


def today_date_str() -> str:
    """Get today's date as YYYY-MM-DD string."""
    return utc_now().strftime("%Y-%m-%d")
