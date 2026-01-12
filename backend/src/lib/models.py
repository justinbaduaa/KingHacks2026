"""Data models."""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class IntentCategory(str, Enum):
    """Possible intent categories for voice transcription classification."""
    REMINDER = "reminder"
    TASK = "task"
    EMAIL_DRAFT = "email_draft"
    CALENDAR_EVENT = "calendar_event"
    NOTE = "note"


class ExtractedEntities(BaseModel):
    """Entities extracted from transcription by Claude."""
    dates: List[str] = Field(default_factory=list, description="Dates in YYYY-MM-DD format")
    times: List[str] = Field(default_factory=list, description="Times in HH:MM format")
    people: List[str] = Field(default_factory=list, description="Names of people mentioned")
    topics: List[str] = Field(default_factory=list, description="Main topics/subjects")
    action_type: Optional[str] = Field(None, description="Specific action type (call, send, meet, etc.)")
    title: Optional[str] = Field(None, description="Concise title for the item (max 50 chars)")
    description: Optional[str] = Field(None, description="Longer description if applicable")
    email_to: Optional[str] = Field(None, description="Email recipient address")
    email_subject: Optional[str] = Field(None, description="Email subject line")
    email_body: Optional[str] = Field(None, description="Email body content")


class ClassificationResult(BaseModel):
    """Result of intent classification from Claude."""
    intent: IntentCategory
    confidence: float = Field(ge=0.0, le=1.0, description="Confidence score 0-1")
    entities: ExtractedEntities
    raw_summary: str = Field(description="Brief summary of what user wants")


class Node(BaseModel):
    """Node model."""
    id: str
    user_id: str
    content: str
    completed: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
