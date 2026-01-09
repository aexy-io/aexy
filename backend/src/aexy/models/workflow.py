"""Workflow models for visual automation builder."""

from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from sqlalchemy import DateTime, ForeignKey, Integer, String, Text, Boolean
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from aexy.core.database import Base


class WorkflowDefinition(Base):
    """Stores React Flow workflow definitions for automations."""

    __tablename__ = "crm_workflow_definitions"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    automation_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("crm_automations.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,
        index=True,
    )

    # React Flow state
    nodes: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{id, type, position: {x, y}, data: {...}}]

    edges: Mapped[list] = mapped_column(
        JSONB,
        default=list,
        nullable=False,
    )  # [{id, source, target, sourceHandle, targetHandle, label}]

    viewport: Mapped[dict | None] = mapped_column(
        JSONB,
        nullable=True,
    )  # {x, y, zoom}

    # Version tracking
    version: Mapped[int] = mapped_column(Integer, default=1)
    is_published: Mapped[bool] = mapped_column(Boolean, default=False)
    published_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
    )

    # Relationship
    automation = relationship("CRMAutomation", back_populates="workflow_definition")


# Node type definitions for reference
NODE_TYPES = {
    "trigger": {
        "label": "Trigger",
        "description": "Entry point for the workflow",
        "color": "#10B981",  # green
        "subtypes": [
            "record_created",
            "record_updated",
            "record_deleted",
            "field_changed",
            "stage_changed",
            "scheduled",
            "webhook_received",
            "form_submitted",
            "email_received",
            "manual",
        ],
    },
    "action": {
        "label": "Action",
        "description": "Perform an action",
        "color": "#3B82F6",  # blue
        "subtypes": [
            "update_record",
            "create_record",
            "delete_record",
            "send_email",
            "send_slack",
            "send_sms",
            "create_task",
            "add_to_list",
            "remove_from_list",
            "enroll_sequence",
            "unenroll_sequence",
            "webhook_call",
            "assign_owner",
        ],
    },
    "condition": {
        "label": "Condition",
        "description": "Check a condition (if/else)",
        "color": "#F59E0B",  # amber
    },
    "wait": {
        "label": "Wait",
        "description": "Delay execution",
        "color": "#8B5CF6",  # purple
        "subtypes": [
            "duration",  # wait X hours/days
            "datetime",  # wait until specific date/time
            "event",     # wait for event (email opened, etc.)
        ],
    },
    "agent": {
        "label": "AI Agent",
        "description": "Run an AI agent",
        "color": "#EC4899",  # pink
        "subtypes": [
            "sales_outreach",
            "lead_scoring",
            "email_drafter",
            "data_enrichment",
            "custom",
        ],
    },
    "branch": {
        "label": "Branch",
        "description": "Split into multiple paths",
        "color": "#6366F1",  # indigo
    },
}

# Condition operators
CONDITION_OPERATORS = [
    {"value": "equals", "label": "equals"},
    {"value": "not_equals", "label": "does not equal"},
    {"value": "contains", "label": "contains"},
    {"value": "not_contains", "label": "does not contain"},
    {"value": "starts_with", "label": "starts with"},
    {"value": "ends_with", "label": "ends with"},
    {"value": "is_empty", "label": "is empty"},
    {"value": "is_not_empty", "label": "is not empty"},
    {"value": "gt", "label": "greater than"},
    {"value": "gte", "label": "greater than or equal"},
    {"value": "lt", "label": "less than"},
    {"value": "lte", "label": "less than or equal"},
    {"value": "in", "label": "is in list"},
    {"value": "not_in", "label": "is not in list"},
]
