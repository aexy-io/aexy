"""Pydantic schemas for dashboard preferences API."""

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field


# Type definitions
PresetType = Literal["developer", "manager", "product", "hr", "support", "sales", "admin", "custom"]
WidgetSize = Literal["small", "medium", "large", "full"]


class DashboardPreferencesCreate(BaseModel):
    """Schema for creating dashboard preferences."""

    preset_type: PresetType = Field(default="developer")
    visible_widgets: list[str] = Field(default_factory=list)
    widget_order: list[str] = Field(default_factory=list)
    widget_sizes: dict[str, WidgetSize] = Field(default_factory=dict)
    layout: dict = Field(default_factory=dict)
    checklist_progress: list[str] = Field(default_factory=list)
    checklist_dismissed: bool = False
    sidebar_page_visits: dict[str, int] = Field(default_factory=dict)
    sidebar_pinned_items: list[str] = Field(default_factory=list)


class DashboardPreferencesUpdate(BaseModel):
    """Schema for updating dashboard preferences - all fields optional."""

    preset_type: PresetType | None = None
    visible_widgets: list[str] | None = None
    widget_order: list[str] | None = None
    widget_sizes: dict[str, WidgetSize] | None = None
    layout: dict | None = None
    checklist_progress: list[str] | None = None
    checklist_dismissed: bool | None = None
    sidebar_page_visits: dict[str, int] | None = None
    sidebar_pinned_items: list[str] | None = None


class DashboardPreferencesResponse(BaseModel):
    """Schema for dashboard preferences response."""

    id: str
    developer_id: str
    preset_type: str
    visible_widgets: list[str]
    widget_order: list[str]
    widget_sizes: dict[str, str]
    layout: dict
    checklist_progress: list[str]
    checklist_dismissed: bool
    sidebar_page_visits: dict[str, int]
    sidebar_pinned_items: list[str]
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class DashboardPresetInfo(BaseModel):
    """Schema for dashboard preset information."""

    id: str
    name: str
    description: str
    icon: str
    color: str
    widgets: list[str]


class DashboardPresetsResponse(BaseModel):
    """Schema for listing available presets."""

    presets: list[DashboardPresetInfo]


class WidgetInfo(BaseModel):
    """Schema for widget information."""

    id: str
    name: str
    category: str
    personas: list[str]
    default_size: WidgetSize
    icon: str
    accessible: bool = True  # Whether user has permission to access this widget
    required_permissions: list[str] = Field(default_factory=list)  # Permissions needed


class WidgetCategoryInfo(BaseModel):
    """Schema for widget category information."""

    id: str
    name: str
    icon: str


class WidgetRegistryResponse(BaseModel):
    """Schema for widget registry response."""

    widgets: list[WidgetInfo]
    categories: list[WidgetCategoryInfo]
