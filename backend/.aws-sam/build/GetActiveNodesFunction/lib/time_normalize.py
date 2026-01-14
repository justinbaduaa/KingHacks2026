"""Time normalization utilities for BrainDump."""

import re
from datetime import datetime, timezone
from dateutil import parser as dateutil_parser
from dateutil.tz import tzoffset


def parse_offset_from_user_time_iso(user_time_iso: str) -> str:
    """
    Extract timezone offset from ISO 8601 string.
    
    Returns offset like "+05:00" or "-05:00".
    Falls back to "+00:00" if parsing fails.
    """
    try:
        dt = dateutil_parser.isoparse(user_time_iso)
        if dt.tzinfo is not None:
            offset = dt.utcoffset()
            if offset is not None:
                total_seconds = int(offset.total_seconds())
                sign = "+" if total_seconds >= 0 else "-"
                total_seconds = abs(total_seconds)
                hours = total_seconds // 3600
                minutes = (total_seconds % 3600) // 60
                return f"{sign}{hours:02d}:{minutes:02d}"
    except Exception:
        pass
    return "+00:00"


def ensure_iso_datetime(value: str, default_offset: str) -> str | None:
    """
    Ensure value is a valid ISO 8601 datetime with offset.
    
    If value is missing offset, appends default_offset.
    Returns None if value is None/empty or unparseable.
    """
    if not value:
        return None
    
    try:
        # Try parsing
        dt = dateutil_parser.isoparse(value)
        
        # If no timezone, add default
        if dt.tzinfo is None:
            # Parse the offset string to create tzoffset
            offset_hours = int(default_offset[1:3])
            offset_minutes = int(default_offset[4:6])
            offset_seconds = (offset_hours * 3600 + offset_minutes * 60)
            if default_offset[0] == "-":
                offset_seconds = -offset_seconds
            dt = dt.replace(tzinfo=tzoffset(None, offset_seconds))
        
        return dt.isoformat()
    except Exception:
        return None


def ensure_iso_date(value: str) -> str | None:
    """
    Ensure value is a valid ISO date (YYYY-MM-DD).
    
    Returns None if value is None/empty or unparseable.
    """
    if not value:
        return None
    
    try:
        # Try to parse and extract date
        dt = dateutil_parser.isoparse(value)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        pass
    
    # Try direct date pattern
    if re.match(r"^\d{4}-\d{2}-\d{2}$", value):
        return value
    
    return None


def compute_local_day(user_time_iso: str) -> str:
    """
    Compute local day (YYYY-MM-DD) from user_time_iso.
    
    Respects the timezone offset in the input.
    """
    try:
        dt = dateutil_parser.isoparse(user_time_iso)
        return dt.strftime("%Y-%m-%d")
    except Exception:
        # Fallback to UTC now
        return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def utc_now_iso() -> str:
    """Get current UTC time as ISO 8601 string."""
    return datetime.now(timezone.utc).isoformat()


def date_to_datetime_iso(date_str: str, time_str: str, offset: str) -> str | None:
    """
    Combine a date and time into ISO datetime.
    
    date_str: YYYY-MM-DD
    time_str: HH:MM:SS or HH:MM
    offset: +/-HH:MM
    """
    if not date_str:
        return None
    
    time_str = time_str or "09:00:00"
    if len(time_str) == 5:
        time_str = time_str + ":00"
    
    try:
        combined = f"{date_str}T{time_str}{offset}"
        # Validate by parsing
        dateutil_parser.isoparse(combined)
        return combined
    except Exception:
        return None


def normalize_node_times(node: dict, default_offset: str) -> tuple[dict, list[str]]:
    """
    Post-process node to ensure all datetime fields have proper offsets.
    
    Returns (updated_node, warnings).
    """
    warnings = []
    node = dict(node)  # shallow copy
    
    # Handle reminder trigger_datetime_iso
    if "reminder" in node and node["reminder"]:
        reminder = dict(node["reminder"])
        if "trigger_datetime_iso" in reminder and reminder["trigger_datetime_iso"]:
            normalized = ensure_iso_datetime(reminder["trigger_datetime_iso"], default_offset)
            if normalized:
                reminder["trigger_datetime_iso"] = normalized
            else:
                warnings.append(f"Could not parse trigger_datetime_iso: {reminder['trigger_datetime_iso']}")
                reminder["trigger_datetime_iso"] = None
        
        # If no trigger time but we have a date, default to 09:00
        when = reminder.get("when", {})
        if not reminder.get("trigger_datetime_iso") and not when.get("needs_clarification"):
            resolved_start = when.get("resolved_start_iso")
            if resolved_start:
                normalized = ensure_iso_datetime(resolved_start, default_offset)
                if normalized and "T" not in resolved_start:
                    # Date only - add default time
                    date_part = ensure_iso_date(resolved_start)
                    if date_part:
                        reminder["trigger_datetime_iso"] = date_to_datetime_iso(date_part, "09:00:00", default_offset)
                        warnings.append("Defaulted reminder time to 09:00 local")
                elif normalized:
                    reminder["trigger_datetime_iso"] = normalized
        
        node["reminder"] = reminder
    
    # Handle todo due times
    if "todo" in node and node["todo"]:
        todo = dict(node["todo"])
        if "due_datetime_iso" in todo and todo["due_datetime_iso"]:
            normalized = ensure_iso_datetime(todo["due_datetime_iso"], default_offset)
            if normalized:
                todo["due_datetime_iso"] = normalized
            else:
                warnings.append(f"Could not parse due_datetime_iso: {todo['due_datetime_iso']}")
                todo["due_datetime_iso"] = None
        
        if "due_date_iso" in todo and todo["due_date_iso"]:
            normalized = ensure_iso_date(todo["due_date_iso"])
            if normalized:
                todo["due_date_iso"] = normalized
            else:
                warnings.append(f"Could not parse due_date_iso: {todo['due_date_iso']}")
                todo["due_date_iso"] = None
        
        node["todo"] = todo
    
    # Handle calendar times
    if "calendar_placeholder" in node and node["calendar_placeholder"]:
        cal = dict(node["calendar_placeholder"])
        for field in ["start_datetime_iso", "end_datetime_iso"]:
            if field in cal and cal[field]:
                normalized = ensure_iso_datetime(cal[field], default_offset)
                if normalized:
                    cal[field] = normalized
                else:
                    warnings.append(f"Could not parse {field}: {cal[field]}")
                    cal[field] = None
        node["calendar_placeholder"] = cal
    
    # Handle time_interpretation resolved times
    if "time_interpretation" in node and node["time_interpretation"]:
        ti = dict(node["time_interpretation"])
        for field in ["resolved_start_iso", "resolved_end_iso"]:
            if field in ti and ti[field]:
                normalized = ensure_iso_datetime(ti[field], default_offset)
                if normalized:
                    ti[field] = normalized
        node["time_interpretation"] = ti
    
    return node, warnings
