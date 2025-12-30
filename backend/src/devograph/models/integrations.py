"""Integration models: Slack, Jira, Linear, and other third-party service connections."""

from datetime import datetime
from uuid import uuid4

from sqlalchemy import Boolean, DateTime, ForeignKey, String, Text, func
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from devograph.core.database import Base


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


class JiraIntegration(Base):
    """Jira integration for a workspace."""

    __tablename__ = "jira_integrations"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        unique=True,  # One Jira integration per workspace
        index=True,
    )

    # Jira connection info
    site_url: Mapped[str] = mapped_column(String(500), nullable=False)  # https://company.atlassian.net
    user_email: Mapped[str] = mapped_column(String(255), nullable=False)  # For basic auth
    api_token: Mapped[str] = mapped_column(Text, nullable=False)  # Encrypted

    # Project mappings: {team_id: {project_key: str, jql_filter?: str}}
    project_mappings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Status mappings: {jira_status: workspace_status_slug}
    status_mappings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Field mappings: {jira_field_id: workspace_field_slug}
    field_mappings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Webhook configuration
    webhook_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    webhook_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Sync settings
    sync_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    sync_direction: Mapped[str] = mapped_column(
        String(50), default="import", nullable=False
    )  # "import" | "bidirectional"
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    connected_by_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )


class LinearIntegration(Base):
    """Linear integration for a workspace."""

    __tablename__ = "linear_integrations"

    id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        primary_key=True,
        default=lambda: str(uuid4()),
    )
    workspace_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("workspaces.id", ondelete="CASCADE"),
        unique=True,  # One Linear integration per workspace
        index=True,
    )

    # Linear connection info
    api_key: Mapped[str] = mapped_column(Text, nullable=False)  # Encrypted
    organization_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    organization_name: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Team mappings: {gitraki_team_id: {linear_team_id: str, labels_filter?: list}}
    team_mappings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Status mappings: {linear_state_id: workspace_status_slug}
    status_mappings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Field mappings: {linear_field: workspace_field_slug}
    field_mappings: Mapped[dict] = mapped_column(JSONB, default=dict, nullable=False)

    # Webhook configuration
    webhook_id: Mapped[str | None] = mapped_column(String(255), nullable=True)
    webhook_secret: Mapped[str | None] = mapped_column(String(255), nullable=True)

    # Sync settings
    sync_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    last_sync_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Status
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    connected_by_id: Mapped[str] = mapped_column(
        UUID(as_uuid=False),
        ForeignKey("developers.id", ondelete="SET NULL"),
        nullable=True,
    )

    # Timestamps
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        onupdate=func.now(),
        nullable=False,
    )
