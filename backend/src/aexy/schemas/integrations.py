"""Integration-related Pydantic schemas (Slack, Jira, Linear, etc.)."""

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field


class SlackNotificationType(str, Enum):
    """Types of Slack notifications."""

    REPORT = "report"
    ALERT = "alert"
    INSIGHT = "insight"
    COMMAND_RESPONSE = "command_response"
    DIGEST = "digest"


class SlackCommandType(str, Enum):
    """Supported Slack slash commands."""

    # Existing commands
    PROFILE = "profile"
    MATCH = "match"
    TEAM = "team"
    INSIGHTS = "insights"
    REPORT = "report"
    HELP = "help"

    # Tracking commands
    STANDUP = "standup"
    UPDATE = "update"
    BLOCKER = "blocker"
    TIMELOG = "timelog"
    LOG = "log"
    STATUS = "status"
    MYTASKS = "mytasks"


# Slack Integration schemas
class SlackIntegrationBase(BaseModel):
    """Base Slack integration schema."""

    organization_id: str
    default_channel_id: str | None = None
    notification_settings: dict = {}


class SlackOAuthCallback(BaseModel):
    """Slack OAuth callback data."""

    code: str
    state: str


class SlackIntegrationResponse(BaseModel):
    """Slack integration response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    organization_id: str
    team_id: str
    team_name: str
    default_channel_id: str | None = None
    notification_settings: dict
    is_active: bool
    installed_at: datetime
    installed_by: str


class SlackIntegrationUpdate(BaseModel):
    """Update Slack integration settings."""

    default_channel_id: str | None = None
    notification_settings: dict | None = None
    is_active: bool | None = None


# Slack message schemas
class SlackBlock(BaseModel):
    """Slack Block Kit block."""

    type: str
    text: dict | None = None
    elements: list[dict] | None = None
    accessory: dict | None = None


class SlackMessage(BaseModel):
    """Slack message content."""

    text: str  # Fallback text
    blocks: list[SlackBlock] | None = None
    attachments: list[dict] | None = None
    thread_ts: str | None = None


class SlackNotificationRequest(BaseModel):
    """Request to send a Slack notification."""

    channel_id: str
    message: SlackMessage
    notification_type: SlackNotificationType


class SlackNotificationResponse(BaseModel):
    """Slack notification response."""

    success: bool
    message_ts: str | None = None
    channel_id: str
    error: str | None = None


# Slack command schemas
class SlackSlashCommand(BaseModel):
    """Incoming Slack slash command."""

    command: str
    text: str
    user_id: str
    user_name: str
    channel_id: str
    channel_name: str
    team_id: str
    team_domain: str
    response_url: str
    trigger_id: str


class SlackCommandResponse(BaseModel):
    """Response to a Slack slash command."""

    response_type: str = "ephemeral"  # "ephemeral" or "in_channel"
    text: str
    blocks: list[SlackBlock] | None = None
    attachments: list[dict] | None = None


# Slack interaction schemas
class SlackInteraction(BaseModel):
    """Incoming Slack interaction (button click, modal submit, etc.)."""

    type: str
    user: dict
    channel: dict | None = None
    team: dict
    trigger_id: str
    actions: list[dict] | None = None
    view: dict | None = None
    response_url: str | None = None


class SlackModalSubmission(BaseModel):
    """Slack modal submission data."""

    view_id: str
    callback_id: str
    values: dict


# Slack event schemas
class SlackEvent(BaseModel):
    """Incoming Slack event."""

    type: str
    event: dict
    team_id: str
    event_id: str
    event_time: int


class SlackEventChallenge(BaseModel):
    """Slack URL verification challenge."""

    type: str = "url_verification"
    challenge: str
    token: str


# User mapping schemas
class SlackUserMapping(BaseModel):
    """Mapping between Slack user and Aexy developer."""

    slack_user_id: str
    developer_id: str


class SlackUserMappingRequest(BaseModel):
    """Request to create/update user mapping."""

    slack_user_id: str
    developer_id: str


class SlackUserMappingResponse(BaseModel):
    """User mapping response."""

    slack_user_id: str
    developer_id: str
    developer_name: str | None = None
    slack_user_name: str | None = None


# Notification log schemas
class SlackNotificationLogResponse(BaseModel):
    """Slack notification log entry."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    integration_id: str
    channel_id: str
    message_ts: str | None = None
    notification_type: str
    content_summary: str | None = None
    status: str
    error_message: str | None = None
    sent_at: datetime


# ==================== Jira & Linear Common Schemas ====================

class StatusMapping(BaseModel):
    """Schema for status mapping between external system and workspace."""

    remote_status: str = Field(..., description="Status name from external system")
    workspace_status_slug: str = Field(..., description="Slug of workspace status")


class FieldMapping(BaseModel):
    """Schema for field mapping between external system and workspace."""

    remote_field: str = Field(..., description="Field ID/name from external system")
    workspace_field_slug: str = Field(..., description="Slug of workspace custom field")


class RemoteProject(BaseModel):
    """Schema for remote project info."""

    key: str
    name: str


class RemoteTeam(BaseModel):
    """Schema for remote team info."""

    id: str
    name: str


class RemoteStatus(BaseModel):
    """Schema for remote status info."""

    id: str
    name: str
    category: str | None = None


class RemoteField(BaseModel):
    """Schema for remote custom field info."""

    id: str
    name: str
    field_type: str


class ConnectionTestResponse(BaseModel):
    """Schema for connection test response."""

    success: bool
    message: str
    available_projects: list[RemoteProject] | None = None
    available_teams: list[RemoteTeam] | None = None
    available_statuses: list[RemoteStatus] | None = None
    available_fields: list[RemoteField] | None = None


class SyncResult(BaseModel):
    """Schema for sync operation result."""

    success: bool
    message: str
    synced_count: int = 0
    created_count: int = 0
    updated_count: int = 0
    error_count: int = 0
    errors: list[str] = Field(default_factory=list)


# ==================== Jira Integration Schemas ====================

class ProjectMapping(BaseModel):
    """Schema for Jira project mapping."""

    project_key: str = Field(..., description="Jira project key")
    jql_filter: str | None = Field(default=None, description="Optional JQL filter")


class JiraIntegrationCreate(BaseModel):
    """Schema for creating a Jira integration."""

    site_url: str = Field(..., description="Jira site URL (e.g., https://company.atlassian.net)")
    user_email: str = Field(..., description="Email for authentication")
    api_token: str = Field(..., description="Jira API token")


class JiraIntegrationUpdate(BaseModel):
    """Schema for updating a Jira integration."""

    project_mappings: dict[str, ProjectMapping] | None = Field(
        default=None,
        description="Mapping of aexy team_id to Jira project"
    )
    status_mappings: list[StatusMapping] | None = Field(
        default=None,
        description="Status mappings"
    )
    field_mappings: list[FieldMapping] | None = Field(
        default=None,
        description="Custom field mappings"
    )
    sync_enabled: bool | None = None
    sync_direction: Literal["import", "bidirectional"] | None = None


class JiraIntegrationResponse(BaseModel):
    """Schema for Jira integration response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    site_url: str
    user_email: str
    project_mappings: dict
    status_mappings: dict
    field_mappings: dict
    sync_enabled: bool
    sync_direction: str
    last_sync_at: datetime | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime


# ==================== Linear Integration Schemas ====================

class LinearTeamMapping(BaseModel):
    """Schema for Linear team mapping."""

    linear_team_id: str = Field(..., description="Linear team ID")
    labels_filter: list[str] | None = Field(default=None, description="Labels to filter by")


class LinearIntegrationCreate(BaseModel):
    """Schema for creating a Linear integration."""

    api_key: str = Field(..., description="Linear API key")


class LinearIntegrationUpdate(BaseModel):
    """Schema for updating a Linear integration."""

    team_mappings: dict[str, LinearTeamMapping] | None = Field(
        default=None,
        description="Mapping of aexy team_id to Linear team"
    )
    status_mappings: list[StatusMapping] | None = Field(
        default=None,
        description="Status mappings"
    )
    field_mappings: list[FieldMapping] | None = Field(
        default=None,
        description="Custom field mappings"
    )
    sync_enabled: bool | None = None


class LinearIntegrationResponse(BaseModel):
    """Schema for Linear integration response."""

    model_config = ConfigDict(from_attributes=True)

    id: str
    workspace_id: str
    organization_id: str | None = None
    organization_name: str | None = None
    team_mappings: dict
    status_mappings: dict
    field_mappings: dict
    sync_enabled: bool
    last_sync_at: datetime | None = None
    is_active: bool
    created_at: datetime
    updated_at: datetime
