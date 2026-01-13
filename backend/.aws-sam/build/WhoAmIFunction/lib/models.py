"""Data models."""

from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class Node(BaseModel):
    """Node model."""
    id: str
    user_id: str
    content: str
    completed: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
