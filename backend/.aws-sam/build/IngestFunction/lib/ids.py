"""ID generation utilities for BrainDump."""

import uuid
import time


def generate_node_id() -> str:
    """
    Generate a unique node ID.
    
    Format: node_{timestamp_hex}_{random_suffix}
    This ensures rough time-ordering while remaining unique.
    """
    timestamp_hex = hex(int(time.time() * 1000))[2:]  # milliseconds as hex
    random_suffix = uuid.uuid4().hex[:8]
    return f"node_{timestamp_hex}_{random_suffix}"


def generate_ulid_like() -> str:
    """
    Generate a ULID-like ID (time-sortable).
    
    Simpler than full ULID - uses timestamp + random.
    """
    timestamp = int(time.time() * 1000)
    random_part = uuid.uuid4().hex[:16]
    return f"{timestamp:013x}{random_part}"
