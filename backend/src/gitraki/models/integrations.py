"""Integration models: Slack, and other third-party service connections."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column

from gitraki.core.database import Base


class SlackIntegration(Base):
    """Slack workspace integration for an organization."""

    __tablename__ = "slack_integrations"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    organization_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        index=True,
    )

    # Slack workspace info
    team_id: Mapped[str] = mapped_column(String(50), unique=True)  # Slack team ID
    team_name: Mapped[str] = mapped_column(String(255))

    # OAuth tokens (encrypted at rest)
    bot_token: Mapped[str] = mapped_column(Text)  # xoxb-...
    bot_user_id: Mapped[str | None] = mapped_column(String(50), nullable=True)

    # App installation info
    app_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    scope: Mapped[str | None] = mapped_column(Text, nullable=True)  # Comma-separated scopes

    # Channel mappings
    default_channel_id: Mapped[str | None] = mapped_column(String(50), nullable=True)
    notification_settings: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {alerts: channel_id, reports: channel_id, insights: channel_id}

    # User mapping (Slack user ID -> Developer ID)
    user_mappings: Mapped[dict] = mapped_column(
        JSONB,
        default=dict,
    )  # {slack_user_id: developer_id}

    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    installed_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    installed_by: Mapped[str] = mapped_column(UUID(as_uuid=False))  # Developer ID

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
    )


class SlackNotificationLog(Base):
    """Log of Slack notifications sent."""

    __tablename__ = "slack_notification_logs"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    integration_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        index=True,
    )

    channel_id: Mapped[str] = mapped_column(String(50))
    message_ts: Mapped[str | None] = mapped_column(String(50), nullable=True)  # Slack message timestamp

    notification_type: Mapped[str] = mapped_column(String(50))  # "report", "alert", "insight", "command_response"
    content_summary: Mapped[str | None] = mapped_column(Text, nullable=True)

    status: Mapped[str] = mapped_column(String(20))  # "sent", "failed", "pending"
    error_message: Mapped[str | None] = mapped_column(Text, nullable=True)

    sent_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
    )
