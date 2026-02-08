"""Slack integration API endpoints."""

import json
import logging
import secrets
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.core.config import settings
from aexy.schemas.integrations import (
    SlackCommandResponse,
    SlackIntegrationResponse,
    SlackIntegrationUpdate,
    SlackMessage,
    SlackNotificationLogResponse,
    SlackNotificationRequest,
    SlackNotificationResponse,
    SlackOAuthCallback,
    SlackSlashCommand,
    SlackUserMappingRequest,
    SlackUserMappingResponse,
)
from aexy.services.slack_integration import SlackIntegrationService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/slack", tags=["slack"])

# In-memory state store for OAuth (use Redis in production)
oauth_states: dict[str, dict] = {}


def get_slack_service() -> SlackIntegrationService:
    """Get Slack integration service instance."""
    return SlackIntegrationService()


@router.get("/install")
async def start_oauth_install(
    organization_id: str,
    installer_id: str,
    redirect_url: str | None = None,
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Start Slack OAuth installation flow."""
    # Check if Slack is configured
    if not settings.slack_client_id or not settings.slack_client_secret:
        raise HTTPException(
            status_code=500,
            detail="Slack integration is not configured. Please set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET environment variables.",
        )

    state = secrets.token_urlsafe(32)
    oauth_states[state] = {
        "organization_id": organization_id,
        "installer_id": installer_id,
        "redirect_url": redirect_url or f"{settings.frontend_url}/settings/integrations",
    }

    install_url = service.get_install_url(state)
    return RedirectResponse(url=install_url)


@router.get("/connect")
async def start_developer_oauth(
    redirect_url: str | None = None,
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Start Slack OAuth flow for onboarding (developer-level, no organization required).

    This is a simplified flow used during onboarding when the user doesn't have
    an organization/workspace yet. The Slack connection will be associated with
    the developer's default workspace once created.
    """
    # Check if Slack is configured
    if not settings.slack_client_id or not settings.slack_client_secret:
        raise HTTPException(
            status_code=503,
            detail="Slack integration is not configured. Please set SLACK_CLIENT_ID and SLACK_CLIENT_SECRET environment variables.",
        )

    state = secrets.token_urlsafe(32)
    oauth_states[state] = {
        "organization_id": None,  # Will be set later when workspace is created
        "installer_id": None,  # Will be set from callback token
        "redirect_url": redirect_url or f"{settings.frontend_url}/onboarding/connect?slack=connected",
        "is_onboarding": True,
    }

    install_url = service.get_install_url(state)
    return RedirectResponse(url=install_url)


@router.get("/callback")
async def oauth_callback(
    code: str,
    state: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Handle Slack OAuth callback."""
    state_data = oauth_states.pop(state, None)
    if not state_data:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")

    try:
        callback = SlackOAuthCallback(code=code, state=state)
        integration = await service.complete_oauth(
            callback=callback,
            installer_id=state_data["installer_id"],
            organization_id=state_data["organization_id"],
            db=db,
        )

        # Redirect back to the frontend
        redirect_url = state_data["redirect_url"]
        return RedirectResponse(url=f"{redirect_url}?slack_installed=true")
    except ValueError as e:
        logger.error(f"Slack OAuth failed: {e}")
        redirect_url = state_data["redirect_url"]
        return RedirectResponse(url=f"{redirect_url}?slack_error={str(e)}")


@router.get("/integration/{integration_id}", response_model=SlackIntegrationResponse)
async def get_integration(
    integration_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Get Slack integration details."""
    integration = await service.get_integration(integration_id, db)
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    return SlackIntegrationResponse.model_validate(integration)


@router.get("/integration/org/{organization_id}", response_model=SlackIntegrationResponse | None)
async def get_integration_by_org(
    organization_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Get Slack integration for an organization."""
    integration = await service.get_integration_by_org(organization_id, db)
    if not integration:
        return None
    return SlackIntegrationResponse.model_validate(integration)


@router.put("/integration/{integration_id}", response_model=SlackIntegrationResponse)
async def update_integration(
    integration_id: str,
    data: SlackIntegrationUpdate,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Update Slack integration settings."""
    integration = await service.update_integration(integration_id, data, db)
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")
    return integration


@router.delete("/integration/{integration_id}")
async def uninstall_integration(
    integration_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Uninstall Slack integration."""
    success = await service.uninstall(integration_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Integration not found")
    return {"success": True}


@router.post("/notify", response_model=SlackNotificationResponse)
async def send_notification(
    request: SlackNotificationRequest,
    integration_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Send a notification to a Slack channel."""
    integration = await service.get_integration(integration_id, db)
    if not integration or not integration.is_active:
        raise HTTPException(status_code=404, detail="Integration not found or inactive")

    return await service.send_message(
        integration=integration,
        channel_id=request.channel_id,
        message=request.message,
        notification_type=request.notification_type,
        db=db,
    )


@router.post("/commands", response_model=SlackCommandResponse)
async def handle_slash_command(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Handle incoming Slack slash commands."""
    # Get the raw body for verification
    body = await request.body()

    # Verify the request came from Slack
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")

    if not service.verify_request(timestamp, signature, body):
        raise HTTPException(status_code=401, detail="Invalid request signature")

    # Parse form data
    form_data = await request.form()
    command = SlackSlashCommand(
        command=form_data.get("command", ""),
        text=form_data.get("text", ""),
        user_id=form_data.get("user_id", ""),
        user_name=form_data.get("user_name", ""),
        channel_id=form_data.get("channel_id", ""),
        channel_name=form_data.get("channel_name", ""),
        team_id=form_data.get("team_id", ""),
        team_domain=form_data.get("team_domain", ""),
        response_url=form_data.get("response_url", ""),
        trigger_id=form_data.get("trigger_id", ""),
    )

    response = await service.handle_slash_command(command, db)
    return response


@router.post("/events")
async def handle_events(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Handle incoming Slack events."""
    body = await request.body()
    data = json.loads(body)

    # Handle URL verification challenge
    if data.get("type") == "url_verification":
        return {"challenge": data.get("challenge")}

    # Verify the request came from Slack
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")

    if not service.verify_request(timestamp, signature, body):
        raise HTTPException(status_code=401, detail="Invalid request signature")

    # Handle event callbacks
    if data.get("type") == "event_callback":
        event = data.get("event", {})
        event_type = event.get("type")
        team_id = data.get("team_id")

        await service.handle_event(event_type, event, team_id, db)

    return Response(status_code=200)


@router.post("/interactions")
async def handle_interactions(
    request: Request,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Handle Slack interactive components (buttons, modals, etc.)."""
    body = await request.body()

    # Verify the request came from Slack
    timestamp = request.headers.get("X-Slack-Request-Timestamp", "")
    signature = request.headers.get("X-Slack-Signature", "")

    if not service.verify_request(timestamp, signature, body):
        raise HTTPException(status_code=401, detail="Invalid request signature")

    # Parse the payload (it comes as form data with a 'payload' field)
    form_data = await request.form()
    payload = json.loads(form_data.get("payload", "{}"))

    interaction_type = payload.get("type")

    # Handle different interaction types
    if interaction_type == "block_actions":
        # Handle button clicks
        actions = payload.get("actions", [])
        for action in actions:
            action_id = action.get("action_id")
            # Route to appropriate handler based on action_id
            logger.info(f"Received block action: {action_id}")

    elif interaction_type == "view_submission":
        # Handle modal submissions
        callback_id = payload.get("view", {}).get("callback_id")
        logger.info(f"Received modal submission: {callback_id}")

    return Response(status_code=200)


@router.post("/integration/{integration_id}/user-mapping", response_model=SlackUserMappingResponse)
async def create_user_mapping(
    integration_id: str,
    mapping: SlackUserMappingRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Map a Slack user to a Aexy developer."""
    success = await service.map_user(
        integration_id=integration_id,
        slack_user_id=mapping.slack_user_id,
        developer_id=mapping.developer_id,
        db=db,
    )
    if not success:
        raise HTTPException(status_code=404, detail="Integration not found")

    return SlackUserMappingResponse(
        slack_user_id=mapping.slack_user_id,
        developer_id=mapping.developer_id,
    )


@router.delete("/integration/{integration_id}/user-mapping/{slack_user_id}")
async def delete_user_mapping(
    integration_id: str,
    slack_user_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Remove a Slack user mapping."""
    success = await service.unmap_user(integration_id, slack_user_id, db)
    if not success:
        raise HTTPException(status_code=404, detail="Integration not found")
    return {"success": True}


@router.get("/integration/{integration_id}/logs", response_model=list[SlackNotificationLogResponse])
async def get_notification_logs(
    integration_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    limit: int = 50,
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Get notification logs for an integration."""
    logs = await service.get_notification_logs(integration_id, db, limit)
    return [SlackNotificationLogResponse.model_validate(log) for log in logs]


# ==================== Slack Sync Endpoints ====================


@router.get("/integration/{integration_id}/channels")
async def get_slack_channels(
    integration_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Get list of Slack channels the bot has access to."""
    from aexy.services.slack_history_sync import SlackHistorySyncService

    integration = await service.get_integration(integration_id, db)
    if not integration or not integration.is_active:
        raise HTTPException(status_code=404, detail="Integration not found or inactive")

    sync_service = SlackHistorySyncService()
    channels = await sync_service.get_channels(integration)
    return {
        "channels": [
            {
                "id": ch["id"],
                "name": ch["name"],
                "is_private": ch.get("is_private", False),
                "num_members": ch.get("num_members", 0),
            }
            for ch in channels
        ]
    }


class ImportHistoryRequest(BaseModel):
    """Request body for history import."""
    channel_ids: list[str] | None = None
    days_back: int = 30
    team_id: str | None = None
    sprint_id: str | None = None


@router.post("/integration/{integration_id}/import-history")
async def import_slack_history(
    integration_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    request: ImportHistoryRequest | None = None,
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Import Slack message history (async task)."""
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    from aexy.temporal.activities.tracking import ImportSlackHistoryInput

    integration = await service.get_integration(integration_id, db)
    if not integration or not integration.is_active:
        raise HTTPException(status_code=404, detail="Integration not found or inactive")

    # Use defaults if no request body
    req = request or ImportHistoryRequest()

    # Dispatch to Temporal
    wf_id = await dispatch(
        "import_slack_history",
        ImportSlackHistoryInput(
            integration_id=integration_id,
            channel_ids=req.channel_ids,
            days_back=req.days_back,
            team_id=req.team_id,
            sprint_id=req.sprint_id,
        ),
        task_queue=TaskQueue.INTEGRATIONS,
    )

    return {
        "task_id": wf_id,
        "status": "queued",
        "message": f"Import started for {req.days_back} days of history",
    }


@router.post("/integration/{integration_id}/sync")
async def sync_slack_channels(
    integration_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Trigger immediate sync of all configured channels."""
    from aexy.temporal.dispatch import dispatch
    from aexy.temporal.task_queues import TaskQueue
    from aexy.temporal.activities.tracking import SyncAllSlackChannelsInput

    integration = await service.get_integration(integration_id, db)
    if not integration or not integration.is_active:
        raise HTTPException(status_code=404, detail="Integration not found or inactive")

    # Dispatch to Temporal
    wf_id = await dispatch(
        "sync_all_slack_channels",
        SyncAllSlackChannelsInput(integration_id=integration_id),
        task_queue=TaskQueue.INTEGRATIONS,
    )

    return {
        "task_id": wf_id,
        "status": "queued",
        "message": "Sync started for all configured channels",
    }


@router.post("/integration/{integration_id}/auto-map-users")
async def auto_map_slack_users(
    integration_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Auto-map Slack users to developers by email."""
    from aexy.services.slack_history_sync import SlackHistorySyncService

    integration = await service.get_integration(integration_id, db)
    if not integration or not integration.is_active:
        raise HTTPException(status_code=404, detail="Integration not found or inactive")

    sync_service = SlackHistorySyncService()
    stats = await sync_service.map_slack_users_to_developers(integration, db)
    return stats


class ChannelConfigRequest(BaseModel):
    """Request body for channel configuration."""
    channel_id: str
    channel_name: str
    slack_team_id: str  # Slack team ID (e.g., T18A883UL)
    team_id: str | None = None  # Internal team UUID (optional)
    channel_type: str = "team"
    auto_parse_standups: bool = True
    auto_parse_task_refs: bool = True
    auto_parse_blockers: bool = True


@router.post("/integration/{integration_id}/configure-channel")
async def configure_slack_channel(
    integration_id: str,
    request: ChannelConfigRequest,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Configure a Slack channel for monitoring."""
    from aexy.services.slack_history_sync import SlackHistorySyncService
    from aexy.services.uptime_service import UptimeService

    integration = await service.get_integration(integration_id, db)
    if not integration or not integration.is_active:
        raise HTTPException(status_code=404, detail="Integration not found or inactive")

    sync_service = SlackHistorySyncService()
    config = await sync_service.setup_channel_monitoring(
        integration=integration,
        channel_id=request.channel_id,
        channel_name=request.channel_name,
        slack_team_id=request.slack_team_id,
        team_id=request.team_id,
        db=db,
        channel_type=request.channel_type,
        auto_parse_standups=request.auto_parse_standups,
        auto_parse_task_refs=request.auto_parse_task_refs,
        auto_parse_blockers=request.auto_parse_blockers,
    )

    # Auto-add 'slack' to notification_channels for existing uptime monitors
    # Use workspace_id or organization_id from the integration
    workspace_id = integration.workspace_id or integration.organization_id
    monitors_updated = 0
    if workspace_id:
        try:
            uptime_service = UptimeService(db)
            monitors_updated = await uptime_service.add_slack_to_monitors(str(workspace_id))
        except Exception as e:
            # Log but don't fail the channel configuration if monitor update fails
            logger.warning(f"Failed to auto-add slack to uptime monitors: {e}")

    return {
        "id": config.id,
        "channel_id": config.channel_id,
        "channel_name": config.channel_name,
        "channel_type": config.channel_type,
        "is_active": config.is_active,
        "auto_parse_standups": config.auto_parse_standups,
        "auto_parse_task_refs": config.auto_parse_task_refs,
        "auto_parse_blockers": config.auto_parse_blockers,
        "monitors_updated": monitors_updated,
    }


@router.get("/integration/{integration_id}/configured-channels")
async def get_configured_channels(
    integration_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Get list of channels configured for monitoring."""
    from sqlalchemy import select
    from aexy.models.tracking import SlackChannelConfig

    integration = await service.get_integration(integration_id, db)
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    result = await db.execute(
        select(SlackChannelConfig).where(
            SlackChannelConfig.integration_id == integration_id
        )
    )
    configs = result.scalars().all()

    return {
        "channels": [
            {
                "id": config.id,
                "channel_id": config.channel_id,
                "channel_name": config.channel_name,
                "channel_type": config.channel_type,
                "team_id": config.team_id,
                "is_active": config.is_active,
                "auto_parse_standups": config.auto_parse_standups,
                "auto_parse_task_refs": config.auto_parse_task_refs,
                "auto_parse_blockers": config.auto_parse_blockers,
            }
            for config in configs
        ]
    }


@router.delete("/integration/{integration_id}/configured-channels/{config_id}")
async def remove_channel_config(
    integration_id: str,
    config_id: str,
    db: Annotated[AsyncSession, Depends(get_db)],
    service: Annotated[SlackIntegrationService, Depends(get_slack_service)] = None,
):
    """Remove a channel from monitoring."""
    from sqlalchemy import select, and_
    from aexy.models.tracking import SlackChannelConfig

    integration = await service.get_integration(integration_id, db)
    if not integration:
        raise HTTPException(status_code=404, detail="Integration not found")

    result = await db.execute(
        select(SlackChannelConfig).where(
            and_(
                SlackChannelConfig.id == config_id,
                SlackChannelConfig.integration_id == integration_id,
            )
        )
    )
    config = result.scalar_one_or_none()

    if not config:
        raise HTTPException(status_code=404, detail="Channel config not found")

    await db.delete(config)
    await db.commit()

    return {"success": True}
