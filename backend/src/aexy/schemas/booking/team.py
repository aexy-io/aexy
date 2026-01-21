"""Team event member schemas for booking module."""

from datetime import datetime
from pydantic import BaseModel, ConfigDict, Field

from aexy.models.booking import AssignmentType


class TeamEventMemberCreate(BaseModel):
    """Schema for adding a team member to an event."""

    user_id: str
    assignment_type: AssignmentType = AssignmentType.ROUND_ROBIN
    priority: int = Field(default=0, ge=0, le=100)


class TeamEventMemberUpdate(BaseModel):
    """Schema for updating a team member assignment."""

    assignment_type: AssignmentType | None = None
    priority: int | None = Field(default=None, ge=0, le=100)
    is_active: bool | None = None


class MemberBrief(BaseModel):
    """Brief member info for team event response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    name: str | None = None
    email: str | None = None
    avatar_url: str | None = None


class TeamEventMemberResponse(BaseModel):
    """Schema for team event member response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    event_type_id: str
    user_id: str
    user: MemberBrief | None = None
    assignment_type: str
    priority: int
    is_active: bool
    last_assigned_at: datetime | None = None
    assignment_count: int
    created_at: datetime
    updated_at: datetime


class TeamEventMembersUpdate(BaseModel):
    """Schema for bulk updating team members."""

    members: list[TeamEventMemberCreate]


class TeamEventMembersResponse(BaseModel):
    """Wrapper for team members list response."""

    event_type_id: str
    members: list[TeamEventMemberResponse]
    total: int
