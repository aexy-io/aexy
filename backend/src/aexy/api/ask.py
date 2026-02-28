"""Ask AI API endpoints — conversations with streaming agentic responses."""

import json
import logging
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.schemas.ask import (
    AskConversationCreate,
    AskConversationResponse,
    AskConversationWithMessages,
    AskMessageCreate,
    AskMessageResponse,
    AskParticipantAdd,
    AskParticipantResponse,
    AskParticipantUpdate,
    AskQueueStatus,
    AskShareLinkCreate,
    AskShareLinkJoin,
    AskShareLinkResponse,
)
from aexy.models.notification import NotificationEventType
from aexy.services.ask_collaboration_service import get_ask_collaboration_service
from aexy.services.ask_service import AskService
from aexy.services.notification_service import NotificationService
from aexy.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}/ask")

# Separate router for share link join (no workspace prefix needed)
share_router = APIRouter(prefix="/ask")


async def _check_workspace(db: AsyncSession, workspace_id: str, developer_id: str):
    ws = WorkspaceService(db)
    if not await ws.check_permission(workspace_id, developer_id, "member"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")


async def _check_owner(service: AskService, conversation_id: str, developer_id: str):
    """Ensure the developer is the owner of the conversation."""
    access = await service.check_access(conversation_id, developer_id)
    if access != "owner":
        raise HTTPException(status_code=403, detail="Only the conversation owner can perform this action")


def _message_to_response(m, sender_info: dict | None = None) -> AskMessageResponse:
    """Convert an AskMessage ORM object to response schema."""
    info = sender_info or {}
    return AskMessageResponse(
        id=str(m.id),
        conversation_id=str(m.conversation_id),
        role=m.role,
        content=m.content,
        tool_calls=m.tool_calls or [],
        token_usage=m.token_usage,
        message_index=m.message_index,
        created_at=m.created_at,
        sender_id=str(m.sender_id) if m.sender_id else None,
        sender_name=info.get("sender_name"),
        sender_avatar_url=info.get("sender_avatar_url"),
        status=m.status or "sent",
    )


# --- Conversations CRUD ---


@router.get("/conversations", response_model=list[AskConversationResponse])
async def list_conversations(
    workspace_id: str,
    search: Optional[str] = Query(None),
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List AI conversations for the current user (owned + shared)."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)
    conversations = await service.list_conversations(
        workspace_id, str(current_developer.id), search=search
    )
    return conversations


@router.post("/conversations", response_model=AskConversationResponse, status_code=201)
async def create_conversation(
    workspace_id: str,
    data: AskConversationCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Create a new AI conversation."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)
    conv = await service.create_conversation(
        workspace_id, str(current_developer.id), data.title
    )
    await db.commit()
    return AskConversationResponse(
        id=str(conv.id),
        workspace_id=str(conv.workspace_id),
        developer_id=str(conv.developer_id),
        title=conv.title,
        is_collaborative=conv.is_collaborative,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=0,
        participant_count=1,
    )


@router.get("/conversations/{conversation_id}", response_model=AskConversationWithMessages)
async def get_conversation(
    workspace_id: str,
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get a conversation with all its messages."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)
    conv = await service.get_conversation(
        conversation_id, workspace_id, str(current_developer.id)
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    # Build sender info cache for collaborative conversations
    sender_cache: dict[str, dict] = {}
    if conv.is_collaborative:
        for m in conv.messages:
            if m.sender_id and m.sender_id not in sender_cache:
                sender_cache[m.sender_id] = await service.get_sender_info(m.sender_id)

    participants = await service.list_participants(conversation_id)

    return AskConversationWithMessages(
        id=str(conv.id),
        workspace_id=str(conv.workspace_id),
        developer_id=str(conv.developer_id),
        title=conv.title,
        is_collaborative=conv.is_collaborative,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=len(conv.messages),
        participant_count=len(participants),
        participants=[AskParticipantResponse(**p) for p in participants],
        messages=[
            _message_to_response(m, sender_cache.get(m.sender_id) if m.sender_id else None)
            for m in conv.messages
        ],
    )


@router.delete("/conversations/{conversation_id}", status_code=204)
async def delete_conversation(
    workspace_id: str,
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Delete a conversation (owner only)."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)
    await _check_owner(service, conversation_id, str(current_developer.id))
    deleted = await service.delete_conversation(
        conversation_id, workspace_id, str(current_developer.id)
    )
    if not deleted:
        raise HTTPException(status_code=404, detail="Conversation not found")
    await db.commit()


@router.post("/conversations/{conversation_id}/messages")
async def send_message(
    workspace_id: str,
    conversation_id: str,
    data: AskMessageCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Send a message and stream the AI response as SSE."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)

    async def generate():
        try:
            async for chunk in service.stream_response(
                conversation_id,
                workspace_id,
                str(current_developer.id),
                data.content,
            ):
                yield chunk
            # Commit after full response
            await db.commit()
        except Exception as e:
            logger.error(f"Streaming error: {e}", exc_info=True)
            yield f"data: {json.dumps({'type': 'error', 'message': 'An internal error occurred. Please try again.'})}\n\n"
            await db.rollback()

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


# --- Participants ---


@router.get("/conversations/{conversation_id}/participants", response_model=list[AskParticipantResponse])
async def list_participants(
    workspace_id: str,
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List participants of a conversation."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)
    # Verify caller has access
    conv = await service.get_conversation(conversation_id, workspace_id, str(current_developer.id))
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")
    participants = await service.list_participants(conversation_id)
    return [AskParticipantResponse(**p) for p in participants]


@router.post("/conversations/{conversation_id}/participants", response_model=AskParticipantResponse, status_code=201)
async def add_participant(
    workspace_id: str,
    conversation_id: str,
    data: AskParticipantAdd,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Add a participant to a conversation (owner only)."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)
    await _check_owner(service, conversation_id, str(current_developer.id))

    participant = await service.add_participant(
        conversation_id,
        data.developer_id,
        data.permission,
        added_by_id=str(current_developer.id),
    )
    await db.commit()

    # Publish event
    collab = get_ask_collaboration_service()
    await collab.publish_ai_event(workspace_id, conversation_id, "ai_participant_joined", {
        "developer_id": data.developer_id,
        "permission": data.permission,
    })

    # Notify the added participant
    conv = await service.get_conversation(conversation_id, workspace_id, str(current_developer.id))
    conv_title = conv.title if conv else "Untitled"
    notification_service = NotificationService(db)
    await notification_service.create_notification(
        recipient_id=data.developer_id,
        event_type=NotificationEventType.AI_CONVERSATION_SHARED,
        title=f"{current_developer.name} shared an AI conversation with you",
        body=f'"{conv_title}"',
        context={
            "action_url": f"/chat?ai_conv={conversation_id}",
            "workspace_id": workspace_id,
            "sharer_name": current_developer.name,
            "conversation_id": conversation_id,
        },
    )

    info = await service.get_sender_info(data.developer_id)
    return AskParticipantResponse(
        id=str(participant.id),
        conversation_id=str(participant.conversation_id),
        developer_id=str(participant.developer_id),
        permission=participant.permission,
        added_by_id=str(participant.added_by_id) if participant.added_by_id else None,
        joined_at=participant.joined_at,
        developer_name=info.get("sender_name"),
        developer_avatar_url=info.get("sender_avatar_url"),
    )


@router.patch("/conversations/{conversation_id}/participants/{developer_id}")
async def update_participant(
    workspace_id: str,
    conversation_id: str,
    developer_id: str,
    data: AskParticipantUpdate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Update a participant's permission (owner only)."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)
    await _check_owner(service, conversation_id, str(current_developer.id))

    updated = await service.update_participant_permission(
        conversation_id, developer_id, data.permission
    )
    if not updated:
        raise HTTPException(status_code=404, detail="Participant not found or cannot change owner permission")
    await db.commit()
    return {"status": "updated"}


@router.delete("/conversations/{conversation_id}/participants/{developer_id}", status_code=204)
async def remove_participant(
    workspace_id: str,
    conversation_id: str,
    developer_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Remove a participant from a conversation (owner only)."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)
    await _check_owner(service, conversation_id, str(current_developer.id))

    removed = await service.remove_participant(conversation_id, developer_id)
    if not removed:
        raise HTTPException(status_code=404, detail="Participant not found or cannot remove owner")
    await db.commit()

    collab = get_ask_collaboration_service()
    await collab.publish_ai_event(workspace_id, conversation_id, "ai_participant_left", {
        "developer_id": developer_id,
    })


# --- Share Links ---


@router.post("/conversations/{conversation_id}/share-links", response_model=AskShareLinkResponse, status_code=201)
async def create_share_link(
    workspace_id: str,
    conversation_id: str,
    data: AskShareLinkCreate,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Create a share link for a conversation (owner only)."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)
    await _check_owner(service, conversation_id, str(current_developer.id))

    link = await service.create_share_link(
        conversation_id,
        str(current_developer.id),
        permission=data.permission,
        password=data.password,
        expires_at=data.expires_at,
        max_uses=data.max_uses,
    )
    await db.commit()
    return AskShareLinkResponse(
        id=str(link.id),
        conversation_id=str(link.conversation_id),
        token=link.token,
        permission=link.permission,
        has_password=link.password_hash is not None,
        expires_at=link.expires_at,
        max_uses=link.max_uses,
        use_count=link.use_count,
        is_active=link.is_active,
        created_by_id=str(link.created_by_id) if link.created_by_id else None,
        created_at=link.created_at,
    )


@router.get("/conversations/{conversation_id}/share-links", response_model=list[AskShareLinkResponse])
async def list_share_links(
    workspace_id: str,
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List share links for a conversation (owner only)."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)
    await _check_owner(service, conversation_id, str(current_developer.id))

    links = await service.list_share_links(conversation_id)
    return [
        AskShareLinkResponse(
            id=str(link.id),
            conversation_id=str(link.conversation_id),
            token=link.token,
            permission=link.permission,
            has_password=link.password_hash is not None,
            expires_at=link.expires_at,
            max_uses=link.max_uses,
            use_count=link.use_count,
            is_active=link.is_active,
            created_by_id=str(link.created_by_id) if link.created_by_id else None,
            created_at=link.created_at,
        )
        for link in links
    ]


@router.delete("/share-links/{link_id}", status_code=204)
async def revoke_share_link(
    workspace_id: str,
    link_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Revoke a share link (owner only)."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)
    # Verify the caller owns the conversation this link belongs to
    link = await service.get_share_link(link_id)
    if not link:
        raise HTTPException(status_code=404, detail="Share link not found")
    await _check_owner(service, str(link.conversation_id), str(current_developer.id))
    revoked = await service.revoke_share_link(link_id)
    if not revoked:
        raise HTTPException(status_code=404, detail="Share link not found")
    await db.commit()


# --- Share Link Join ---


@share_router.post("/share/{token}/join", response_model=AskConversationResponse)
async def join_via_share_link(
    token: str,
    data: AskShareLinkJoin,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Join a conversation via share link."""
    service = AskService(db)
    conv = await service.join_via_share_link(
        token, str(current_developer.id), data.password
    )
    if not conv:
        raise HTTPException(status_code=404, detail="Invalid or expired share link")
    await db.commit()

    # Notify the conversation owner that someone joined via share link
    if str(conv.developer_id) != str(current_developer.id):
        notification_service = NotificationService(db)
        await notification_service.create_notification(
            recipient_id=str(conv.developer_id),
            event_type=NotificationEventType.AI_CONVERSATION_SHARED,
            title=f"{current_developer.name} joined your AI conversation",
            body="via share link",
            context={
                "action_url": f"/chat?ai_conv={conv.id}",
                "workspace_id": str(conv.workspace_id),
                "joiner_name": current_developer.name,
                "conversation_id": str(conv.id),
            },
        )

    return AskConversationResponse(
        id=str(conv.id),
        workspace_id=str(conv.workspace_id),
        developer_id=str(conv.developer_id),
        title=conv.title,
        is_collaborative=conv.is_collaborative,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=len(conv.messages),
    )


# --- Queue Status ---


@router.get("/conversations/{conversation_id}/queue", response_model=AskQueueStatus)
async def get_queue_status(
    workspace_id: str,
    conversation_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """Get the message queue status for a conversation."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)
    conv = await service.get_conversation(conversation_id, workspace_id, str(current_developer.id))
    if not conv:
        raise HTTPException(status_code=404, detail="Conversation not found")

    collab = get_ask_collaboration_service()
    queue_length = await collab.get_queue_length(conversation_id)
    is_locked = await collab.is_ai_locked(conversation_id)
    return AskQueueStatus(queue_length=queue_length, is_ai_responding=is_locked)
