"""Integration-related Pydantic schemas (Slack, etc.)."""

from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict


class SlackNotificationType(str, Enum):
    """Types of Slack notifications."""

    REPORT = "report"
    ALERT = "alert"
    INSIGHT = "insight"
    COMMAND_RESPONSE = "command_response"
    DIGEST = "digest"


class SlackCommandType(str, Enum):
    """Supported Slack slash commands."""

    PROFILE = "profile"
    MATCH = "match"
    TEAM = "team"
    INSIGHTS = "insights"
    REPORT = "report"
    HELP = "help"


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
    """Mapping between Slack user and Gitraki developer."""

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
