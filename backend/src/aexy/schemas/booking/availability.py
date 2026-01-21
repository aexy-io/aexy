"""Availability schemas for booking module."""

from datetime import date, datetime, time
from pydantic import BaseModel, ConfigDict, Field


class AvailabilitySlotCreate(BaseModel):
    """Schema for creating an availability slot."""

    day_of_week: int = Field(..., ge=0, le=6)  # 0=Monday, 6=Sunday
    start_time: time
    end_time: time
    timezone: str = Field(default="UTC", max_length=100)


class AvailabilitySlotUpdate(BaseModel):
    """Schema for updating an availability slot."""

    start_time: time | None = None
    end_time: time | None = None
    timezone: str | None = Field(default=None, max_length=100)
    is_active: bool | None = None


class AvailabilitySlotResponse(BaseModel):
    """Schema for availability slot response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    workspace_id: str
    day_of_week: int
    start_time: time
    end_time: time
    timezone: str
    is_active: bool
    created_at: datetime
    updated_at: datetime


class DayAvailability(BaseModel):
    """Availability for a specific day of the week."""

    day_of_week: int  # 0=Monday, 6=Sunday
    day_name: str  # Monday, Tuesday, etc.
    is_available: bool
    slots: list[AvailabilitySlotResponse]


class AvailabilityScheduleResponse(BaseModel):
    """Full weekly availability schedule."""

    user_id: str
    workspace_id: str
    timezone: str
    schedule: list[DayAvailability]


class AvailabilityOverrideCreate(BaseModel):
    """Schema for creating an availability override."""

    date: date
    is_available: bool = False
    start_time: time | None = None  # Required if is_available=True
    end_time: time | None = None  # Required if is_available=True
    reason: str | None = Field(default=None, max_length=255)
    notes: str | None = Field(default=None, max_length=2000)


class AvailabilityOverrideResponse(BaseModel):
    """Schema for availability override response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    user_id: str
    date: date
    is_available: bool
    start_time: time | None = None
    end_time: time | None = None
    reason: str | None = None
    notes: str | None = None
    created_at: datetime
    updated_at: datetime


class TimeSlot(BaseModel):
    """Available time slot for booking."""

    start_time: datetime
    end_time: datetime
    available: bool = True


class AvailableSlotsResponse(BaseModel):
    """Available slots for a date range."""

    event_type_id: str
    date: date
    timezone: str
    slots: list[TimeSlot]


class BulkAvailabilityUpdate(BaseModel):
    """Schema for updating entire availability schedule at once."""

    timezone: str = Field(default="UTC", max_length=100)
    slots: list[AvailabilitySlotCreate]
