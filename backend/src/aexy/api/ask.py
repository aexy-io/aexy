"""Ask AI API endpoints — conversations with streaming agentic responses."""

import logging

from fastapi import APIRouter, Depends, HTTPException
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
)
from aexy.services.ask_service import AskService
from aexy.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}/ask")


async def _check_workspace(db: AsyncSession, workspace_id: str, developer_id: str):
    ws = WorkspaceService(db)
    if not await ws.check_permission(workspace_id, developer_id, "member"):
        raise HTTPException(status_code=403, detail="Insufficient permissions")


@router.get("/conversations", response_model=list[AskConversationResponse])
async def list_conversations(
    workspace_id: str,
    db: AsyncSession = Depends(get_db),
    current_developer: Developer = Depends(get_current_developer),
):
    """List AI conversations for the current user."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)
    conversations = await service.list_conversations(
        workspace_id, str(current_developer.id)
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
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=0,
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

    return AskConversationWithMessages(
        id=str(conv.id),
        workspace_id=str(conv.workspace_id),
        developer_id=str(conv.developer_id),
        title=conv.title,
        created_at=conv.created_at,
        updated_at=conv.updated_at,
        message_count=len(conv.messages),
        messages=[
            AskMessageResponse(
                id=str(m.id),
                conversation_id=str(m.conversation_id),
                role=m.role,
                content=m.content,
                tool_calls=m.tool_calls or [],
                token_usage=m.token_usage,
                message_index=m.message_index,
                created_at=m.created_at,
            )
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
    """Delete a conversation."""
    await _check_workspace(db, workspace_id, str(current_developer.id))
    service = AskService(db)
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
            import json
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
