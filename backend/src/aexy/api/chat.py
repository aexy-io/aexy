"""Team Chat REST API + WebSocket handler."""

import asyncio
import json
import logging
from typing import Any

from fastapi import APIRouter, Depends, File, HTTPException, Query, UploadFile, WebSocket, WebSocketDisconnect, status
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.api.developers import get_current_developer, get_current_developer_id
from aexy.core.config import get_settings
from aexy.core.database import async_session_maker, get_db
from aexy.models.developer import Developer
from aexy.schemas.chat import (
    ChannelCreate,
    ChannelListResponse,
    ChannelMemberResponse,
    ChannelResponse,
    ChannelUpdate,
    InboxResponse,
    MarkReadRequest,
    MeetLinkResponse,
    MessageCreate,
    MessageListResponse,
    MessageResponse,
    MessageUpdate,
    PresenceListResponse,
    TopicCreate,
    TopicListResponse,
    TopicResponse,
)
from aexy.services.chat_pubsub import get_chat_pubsub
from aexy.services.chat_service import ChatService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/workspaces/{workspace_id}/chat", tags=["chat"])


# ── Helpers ───────────────────────────────────────────────────────────

async def _verify_ws_token(token: str) -> dict | None:
    if not token:
        return None
    try:
        settings = get_settings()
        payload = jwt.decode(token, settings.secret_key, algorithms=[settings.algorithm])
        developer_id = payload.get("sub")
        if not developer_id:
            return None
        return payload
    except JWTError:
        return None


async def _resolve_developer(developer_id: str) -> Developer | None:
    async with async_session_maker() as db:
        from sqlalchemy import select
        result = await db.execute(
            select(Developer).where(Developer.id == developer_id)
        )
        return result.scalar_one_or_none()


# ── Setup / onboarding ───────────────────────────────────────────────

@router.post("/setup", status_code=201)
async def setup_chat(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create the default General channel + topic. Idempotent."""
    service = ChatService(db)
    channel, topic, message = await service.setup_default_channel(
        workspace_id=workspace_id,
        developer_id=str(current_user.id),
    )
    return {
        "channel": {
            "id": channel.id, "name": channel.name, "slug": channel.slug,
        },
        "topic": {
            "id": topic.id, "name": topic.name,
        },
    }


# ── Channel endpoints ─────────────────────────────────────────────────

@router.get("/channels", response_model=ChannelListResponse)
async def list_channels(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    channels = await service.list_channels(workspace_id, str(current_user.id))
    return ChannelListResponse(channels=channels)


@router.post("/channels", response_model=ChannelResponse, status_code=201)
async def create_channel(
    workspace_id: str,
    data: ChannelCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    channel = await service.create_channel(
        workspace_id=workspace_id,
        developer_id=str(current_user.id),
        name=data.name,
        description=data.description,
        visibility=data.visibility.value,
    )
    pubsub = get_chat_pubsub()
    await pubsub.publish(workspace_id, "channel_created", {
        "id": channel.id, "name": channel.name, "slug": channel.slug,
    })
    return ChannelResponse(
        id=channel.id, workspace_id=channel.workspace_id, name=channel.name,
        slug=channel.slug, description=channel.description,
        visibility=channel.visibility, created_by_id=channel.created_by_id,
        is_archived=channel.is_archived, created_at=channel.created_at,
        updated_at=channel.updated_at, member_count=1, is_member=True,
    )


@router.get("/channels/{channel_id}", response_model=ChannelResponse)
async def get_channel(
    workspace_id: str,
    channel_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    channel = await service.get_channel(channel_id)
    if not channel or channel.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    is_member = await service.is_channel_member(channel_id, str(current_user.id))
    return ChannelResponse(
        id=channel.id, workspace_id=channel.workspace_id, name=channel.name,
        slug=channel.slug, description=channel.description,
        visibility=channel.visibility, created_by_id=channel.created_by_id,
        is_archived=channel.is_archived, created_at=channel.created_at,
        updated_at=channel.updated_at, is_member=is_member,
    )


@router.patch("/channels/{channel_id}", response_model=ChannelResponse)
async def update_channel(
    workspace_id: str,
    channel_id: str,
    data: ChannelUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    channel = await service.get_channel(channel_id)
    if not channel or channel.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Channel not found")

    # Authorization: only channel creator or owner can update
    if channel.created_by_id != str(current_user.id):
        is_owner = await service.is_channel_owner(channel_id, str(current_user.id))
        if not is_owner:
            raise HTTPException(status_code=403, detail="Only channel owner can update settings")

    updates = data.model_dump(exclude_unset=True)
    channel = await service.update_channel(channel_id, **updates)
    if not channel:
        raise HTTPException(status_code=404, detail="Channel not found")

    pubsub = get_chat_pubsub()
    await pubsub.publish(workspace_id, "channel_updated", {
        "id": channel.id, "name": channel.name, "slug": channel.slug,
    })
    return ChannelResponse(
        id=channel.id, workspace_id=channel.workspace_id, name=channel.name,
        slug=channel.slug, description=channel.description,
        visibility=channel.visibility, created_by_id=channel.created_by_id,
        is_archived=channel.is_archived, created_at=channel.created_at,
        updated_at=channel.updated_at,
    )


@router.post("/channels/{channel_id}/join", status_code=200)
async def join_channel(
    workspace_id: str,
    channel_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    channel = await service.get_channel(channel_id)
    if not channel or channel.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Channel not found")
    if channel.visibility == "private":
        raise HTTPException(status_code=403, detail="Cannot join a private channel without invite")
    await service.join_channel(channel_id, str(current_user.id))
    return {"ok": True}


@router.post("/channels/{channel_id}/leave", status_code=200)
async def leave_channel(
    workspace_id: str,
    channel_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    await service.leave_channel(channel_id, str(current_user.id))
    return {"ok": True}


@router.get("/channels/{channel_id}/members")
async def list_channel_members(
    workspace_id: str,
    channel_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    members = await service.list_members(channel_id)
    return {"members": members}


# ── Topic endpoints ───────────────────────────────────────────────────

@router.get("/channels/{channel_id}/topics", response_model=TopicListResponse)
async def list_topics(
    workspace_id: str,
    channel_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    topics = await service.list_topics(channel_id, str(current_user.id))
    return TopicListResponse(topics=topics)


@router.post("/channels/{channel_id}/topics", response_model=TopicResponse, status_code=201)
async def create_topic(
    workspace_id: str,
    channel_id: str,
    data: TopicCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    channel = await service.get_channel(channel_id)
    if not channel or channel.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Channel not found")

    topic, message = await service.create_topic_with_message(
        channel_id=channel_id,
        developer_id=str(current_user.id),
        name=data.name,
        first_message=data.first_message,
    )
    pubsub = get_chat_pubsub()
    await pubsub.publish(workspace_id, "new_topic", {
        "id": topic.id, "channel_id": topic.channel_id, "name": topic.name,
        "created_by_id": topic.created_by_id,
        "message_count": topic.message_count,
        "last_message_at": str(topic.last_message_at),
    })
    await pubsub.publish(workspace_id, "new_message", {
        "id": message.id, "topic_id": message.topic_id,
        "channel_id": message.channel_id, "sender_id": message.sender_id,
        "content": message.content, "created_at": str(message.created_at),
        "sender": {"id": str(current_user.id), "name": current_user.name},
    })
    return TopicResponse(
        id=topic.id, channel_id=topic.channel_id, name=topic.name,
        message_count=topic.message_count, last_message_at=topic.last_message_at,
        created_by_id=topic.created_by_id, is_resolved=topic.is_resolved,
        created_at=topic.created_at, updated_at=topic.updated_at,
        creator_name=current_user.name,
    )


# ── Message endpoints ─────────────────────────────────────────────────

@router.get("/topics/{topic_id}/messages", response_model=MessageListResponse)
async def list_messages(
    workspace_id: str,
    topic_id: str,
    before: str | None = Query(None),
    limit: int = Query(50, ge=1, le=100),
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    messages, has_more = await service.list_messages(topic_id, before=before, limit=limit)
    return MessageListResponse(messages=messages, has_more=has_more)


@router.post("/topics/{topic_id}/messages", response_model=MessageResponse, status_code=201)
async def send_message(
    workspace_id: str,
    topic_id: str,
    data: MessageCreate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    topic = await service.get_topic(topic_id)
    if not topic:
        raise HTTPException(status_code=404, detail="Topic not found")

    # Verify channel belongs to workspace
    channel = await service.get_channel(topic.channel_id)
    if not channel or channel.workspace_id != workspace_id:
        raise HTTPException(status_code=404, detail="Topic not found")

    # Auto-join public channel
    if channel.visibility == "public":
        await service.join_channel(channel.id, str(current_user.id))

    msg = await service.create_message(
        topic_id=topic_id,
        channel_id=topic.channel_id,
        sender_id=str(current_user.id),
        content=data.content,
        reply_to_id=data.reply_to_id,
    )

    pubsub = get_chat_pubsub()
    await pubsub.publish(workspace_id, "new_message", msg)

    return MessageResponse(**msg)


@router.patch("/messages/{message_id}", response_model=MessageResponse)
async def edit_message(
    workspace_id: str,
    message_id: str,
    data: MessageUpdate,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    msg = await service.update_message(message_id, str(current_user.id), data.content)
    if not msg:
        raise HTTPException(status_code=404, detail="Message not found or not owned by you")

    pubsub = get_chat_pubsub()
    await pubsub.publish(workspace_id, "message_updated", msg)
    return MessageResponse(**msg)


@router.delete("/messages/{message_id}", status_code=200)
async def delete_message(
    workspace_id: str,
    message_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    ok = await service.delete_message(message_id, str(current_user.id))
    if not ok:
        raise HTTPException(status_code=404, detail="Message not found or not owned by you")

    pubsub = get_chat_pubsub()
    await pubsub.publish(workspace_id, "message_deleted", {"id": message_id})
    return {"ok": True}


# ── Inbox endpoint ────────────────────────────────────────────────────

@router.get("/inbox", response_model=InboxResponse)
async def get_inbox(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    topics = await service.get_inbox(workspace_id, str(current_user.id))
    return InboxResponse(topics=topics)


# ── Read state endpoint ──────────────────────────────────────────────

@router.post("/topics/{topic_id}/read", status_code=200)
async def mark_topic_read(
    workspace_id: str,
    topic_id: str,
    data: MarkReadRequest,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    await service.mark_topic_read(topic_id, str(current_user.id), data.message_id)
    return {"ok": True}


# ── Presence endpoint ─────────────────────────────────────────────────

@router.get("/presence", response_model=PresenceListResponse)
async def get_presence(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    service = ChatService(db)
    users = await service.get_online_users(workspace_id)
    return PresenceListResponse(users=users)


# ── File upload endpoint ─────────────────────────────────────────────

ALLOWED_CHAT_TYPES = {
    "image/png", "image/jpeg", "image/gif", "image/webp", "image/svg+xml",
    "application/pdf",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    "text/plain", "text/csv",
    "application/zip", "application/gzip",
}
MAX_CHAT_FILE_SIZE = 20 * 1024 * 1024  # 20MB


@router.post("/upload")
async def upload_chat_file(
    workspace_id: str,
    file: UploadFile = File(...),
    current_user: Developer = Depends(get_current_developer),
):
    """Upload a file for use in chat messages. Returns a URL."""
    if not file.content_type or file.content_type not in ALLOWED_CHAT_TYPES:
        raise HTTPException(status_code=400, detail=f"File type {file.content_type or 'unknown'} not allowed")

    # Read in chunks to fail early on oversized files
    chunks: list[bytes] = []
    total_size = 0
    while True:
        chunk = await file.read(8192)
        if not chunk:
            break
        total_size += len(chunk)
        if total_size > MAX_CHAT_FILE_SIZE:
            raise HTTPException(status_code=400, detail="File too large (max 20MB)")
        chunks.append(chunk)
    data = b"".join(chunks)

    from uuid import uuid4
    from aexy.services.storage_service import StorageService

    ext = (file.filename or "file").rsplit(".", 1)[-1] if "." in (file.filename or "") else "bin"
    key = f"chat-files/{workspace_id}/{uuid4()}.{ext}"

    storage = StorageService()
    if not storage.is_configured():
        raise HTTPException(status_code=503, detail="File storage not configured")

    ok = storage.put_object(key, data, file.content_type or "application/octet-stream")
    if not ok:
        raise HTTPException(status_code=500, detail="Failed to upload file")

    # Generate a download URL
    download_url = storage.generate_presigned_get_url(key, expires_in=86400 * 7)  # 7 days

    return {
        "url": download_url or f"/api/v1/workspaces/{workspace_id}/chat/files/{key}",
        "key": key,
        "filename": file.filename,
        "content_type": file.content_type,
        "size": len(data),
    }


# ── Google Meet link endpoint ────────────────────────────────────────

@router.post("/meet-link", response_model=MeetLinkResponse)
async def create_meet_link(
    workspace_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create an instant Google Meet link using the user's connected Google Calendar."""
    import uuid
    from datetime import datetime, timedelta
    from zoneinfo import ZoneInfo

    import httpx
    from sqlalchemy import select

    from aexy.models.booking.calendar_connection import CalendarConnection, CalendarProvider

    # Find user's Google calendar connection
    result = await db.execute(
        select(CalendarConnection).where(
            CalendarConnection.user_id == current_user.id,
            CalendarConnection.workspace_id == workspace_id,
            CalendarConnection.provider == CalendarProvider.GOOGLE.value,
        ).limit(1)
    )
    connection = result.scalar_one_or_none()

    if not connection:
        raise HTTPException(
            status_code=400,
            detail="No Google Calendar connected. Connect your Google Calendar in Settings > Integrations.",
        )

    # Refresh token if needed
    if connection.token_expires_at:
        now = datetime.now(ZoneInfo("UTC"))
        if connection.token_expires_at <= now + timedelta(minutes=5):
            if not connection.refresh_token:
                raise HTTPException(status_code=400, detail="Calendar token expired. Please reconnect.")
            settings = get_settings()
            async with httpx.AsyncClient() as client:
                resp = await client.post(
                    "https://oauth2.googleapis.com/token",
                    data={
                        "client_id": settings.google_client_id,
                        "client_secret": settings.google_client_secret,
                        "refresh_token": connection.refresh_token,
                        "grant_type": "refresh_token",
                    },
                    timeout=30.0,
                )
                if resp.status_code != 200:
                    raise HTTPException(status_code=400, detail="Failed to refresh calendar token. Please reconnect.")
                token_data = resp.json()
            connection.access_token = token_data["access_token"]
            connection.token_expires_at = now + timedelta(seconds=token_data.get("expires_in", 3600))
            if "refresh_token" in token_data:
                connection.refresh_token = token_data["refresh_token"]
            await db.flush()

    # Create a calendar event with Meet conference
    now = datetime.now(ZoneInfo("UTC"))
    event_body = {
        "summary": "Aexy Meeting",
        "start": {"dateTime": now.isoformat(), "timeZone": "UTC"},
        "end": {"dateTime": (now + timedelta(hours=1)).isoformat(), "timeZone": "UTC"},
        "conferenceData": {
            "createRequest": {
                "requestId": str(uuid.uuid4()),
                "conferenceSolutionKey": {"type": "hangoutsMeet"},
            }
        },
    }

    async with httpx.AsyncClient() as client:
        url = f"https://www.googleapis.com/calendar/v3/calendars/{connection.calendar_id}/events?conferenceDataVersion=1"
        resp = await client.post(
            url,
            headers={
                "Authorization": f"Bearer {connection.access_token}",
                "Content-Type": "application/json",
            },
            json=event_body,
            timeout=30.0,
        )

        if resp.status_code not in (200, 201):
            logger.error(f"Google Calendar event creation failed: {resp.text}")
            raise HTTPException(status_code=500, detail="Failed to create Google Meet link")

        event = resp.json()

    # Extract Meet link
    meet_link = None
    for entry in event.get("conferenceData", {}).get("entryPoints", []):
        if entry.get("entryPointType") == "video":
            meet_link = entry.get("uri")
            break

    if not meet_link:
        raise HTTPException(status_code=500, detail="Meet link not found in calendar response")

    return MeetLinkResponse(meet_link=meet_link)


# ═══════════════════════════════════════════════════════════════════════
# WebSocket handler
# ═══════════════════════════════════════════════════════════════════════

class _ConnectionEntry:
    """A single WebSocket connection's state."""

    __slots__ = ("ws", "user_info", "subscribed_channels", "subscribed_ai_conversations")

    def __init__(self, ws: WebSocket, user_info: dict):
        self.ws = ws
        self.user_info = user_info
        self.subscribed_channels: set[str] = set()
        self.subscribed_ai_conversations: set[str] = set()


class ChatConnectionManager:
    """Manages WebSocket connections for chat, one connection per user per workspace."""

    def __init__(self):
        self.connections: dict[str, list[_ConnectionEntry]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, ws: WebSocket, workspace_id: str, user_info: dict) -> _ConnectionEntry:
        await ws.accept()
        entry = _ConnectionEntry(ws, user_info)
        async with self._lock:
            if workspace_id not in self.connections:
                self.connections[workspace_id] = []
            self.connections[workspace_id].append(entry)
        return entry

    async def disconnect(self, ws: WebSocket, workspace_id: str) -> dict | None:
        async with self._lock:
            conns = self.connections.get(workspace_id, [])
            for i, entry in enumerate(conns):
                if entry.ws is ws:
                    conns.pop(i)
                    if not conns:
                        self.connections.pop(workspace_id, None)
                    return entry.user_info
        return None

    async def subscribe_channels(self, ws: WebSocket, workspace_id: str, channel_ids: list[str]) -> None:
        async with self._lock:
            for entry in self.connections.get(workspace_id, []):
                if entry.ws is ws:
                    entry.subscribed_channels.update(channel_ids)
                    break

    async def subscribe_ai_conversations(self, ws: WebSocket, workspace_id: str, conv_ids: list[str]) -> None:
        """Subscribe a connection to AI conversation events."""
        async with self._lock:
            for entry in self.connections.get(workspace_id, []):
                if entry.ws is ws:
                    entry.subscribed_ai_conversations.update(conv_ids)
                    break

    async def broadcast_to_workspace(self, workspace_id: str, event: dict) -> None:
        """Send event to all connections in a workspace."""
        for entry in self.connections.get(workspace_id, []):
            try:
                await entry.ws.send_json(event)
            except Exception:
                pass

    async def broadcast_to_channel(self, workspace_id: str, channel_id: str, event: dict) -> None:
        """Send event only to users subscribed to a specific channel."""
        for entry in self.connections.get(workspace_id, []):
            if channel_id in entry.subscribed_channels:
                try:
                    await entry.ws.send_json(event)
                except Exception:
                    pass

    async def send_to_user(self, workspace_id: str, developer_id: str, event: dict) -> None:
        """Send event to a specific user."""
        for entry in self.connections.get(workspace_id, []):
            if entry.user_info.get("id") == developer_id:
                try:
                    await entry.ws.send_json(event)
                except Exception:
                    pass


chat_manager = ChatConnectionManager()


@router.websocket("/ws")
async def chat_websocket(
    websocket: WebSocket,
    workspace_id: str,
    token: str = Query(...),
):
    # Verify JWT
    payload = await _verify_ws_token(token)
    if not payload:
        await websocket.close(code=4001, reason="Invalid token")
        return

    developer_id = payload.get("sub")
    developer = await _resolve_developer(developer_id)
    if not developer:
        await websocket.close(code=4001, reason="Developer not found")
        return

    user_info = {
        "id": str(developer.id),
        "name": developer.name,
        "avatar_url": getattr(developer, "avatar_url", None),
    }

    conn_entry = await chat_manager.connect(websocket, workspace_id, user_info)

    # Auto-subscribe to user's channels
    async with async_session_maker() as db:
        service = ChatService(db)
        channel_ids = await service.get_member_channel_ids(developer_id)
        await chat_manager.subscribe_channels(websocket, workspace_id, channel_ids)

        # Set presence to online
        await service.update_presence(workspace_id, developer_id, "online")

    pubsub = get_chat_pubsub()
    await pubsub.publish(workspace_id, "presence_update", {
        "developer_id": developer_id, "status": "online", "name": developer.name,
    })

    # Start Redis subscriber task to relay events to this connection
    redis_task = asyncio.create_task(
        _relay_redis_events(websocket, workspace_id, user_info, conn_entry)
    )

    try:
        while True:
            raw = await websocket.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue

            msg_type = msg.get("type", "")

            if msg_type == "ping":
                await websocket.send_json({"type": "pong"})

            elif msg_type == "subscribe_channels":
                ch_ids = msg.get("channel_ids", [])
                await chat_manager.subscribe_channels(websocket, workspace_id, ch_ids)

            elif msg_type == "subscribe_ai_conversations":
                conv_ids = msg.get("conversation_ids", [])
                await chat_manager.subscribe_ai_conversations(websocket, workspace_id, conv_ids)

            elif msg_type == "typing":
                await pubsub.publish(workspace_id, "typing", {
                    "developer_id": developer_id,
                    "developer_name": developer.name,
                    "topic_id": msg.get("topic_id"),
                    "channel_id": msg.get("channel_id"),
                })

            elif msg_type == "stop_typing":
                await pubsub.publish(workspace_id, "stop_typing", {
                    "developer_id": developer_id,
                    "topic_id": msg.get("topic_id"),
                    "channel_id": msg.get("channel_id"),
                })

            elif msg_type == "ai_typing":
                conv_id = msg.get("conversation_id")
                if conv_id:
                    await pubsub.publish(workspace_id, "ai_typing", {
                        "developer_id": developer_id,
                        "developer_name": developer.name,
                        "conversation_id": conv_id,
                    })

            elif msg_type == "ai_stop_typing":
                conv_id = msg.get("conversation_id")
                if conv_id:
                    await pubsub.publish(workspace_id, "ai_stop_typing", {
                        "developer_id": developer_id,
                        "conversation_id": conv_id,
                    })

            elif msg_type == "mark_read":
                topic_id = msg.get("topic_id")
                message_id = msg.get("message_id")
                if topic_id and message_id:
                    async with async_session_maker() as db:
                        svc = ChatService(db)
                        await svc.mark_topic_read(topic_id, developer_id, message_id)

            elif msg_type == "presence":
                new_status = msg.get("status", "online")
                async with async_session_maker() as db:
                    svc = ChatService(db)
                    await svc.update_presence(workspace_id, developer_id, new_status)
                await pubsub.publish(workspace_id, "presence_update", {
                    "developer_id": developer_id, "status": new_status, "name": developer.name,
                })

    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Chat WS error for %s", developer_id)
    finally:
        redis_task.cancel()
        await chat_manager.disconnect(websocket, workspace_id)
        # Set presence to offline
        async with async_session_maker() as db:
            svc = ChatService(db)
            await svc.update_presence(workspace_id, developer_id, "offline")
        await pubsub.publish(workspace_id, "presence_update", {
            "developer_id": developer_id, "status": "offline", "name": developer.name,
        })


async def _relay_redis_events(
    ws: WebSocket, workspace_id: str, user_info: dict, conn_entry: _ConnectionEntry,
) -> None:
    """Background task: subscribe to Redis pub/sub and forward events to the WS client."""
    # Channel-scoped event types that should only be sent to subscribed users
    CHANNEL_SCOPED_EVENTS = {
        "new_message", "new_topic", "topic_updated",
        "message_updated", "message_deleted",
    }
    # AI conversation-scoped events
    AI_SCOPED_EVENTS = {
        "ai_new_message", "ai_typing", "ai_stop_typing",
        "ai_streaming_delta", "ai_streaming_done",
        "ai_queue_update", "ai_participant_joined", "ai_participant_left",
    }
    pubsub = get_chat_pubsub()
    try:
        async for event in pubsub.subscribe(workspace_id):
            event_data = event.get("data", {})
            event_type = event.get("type")

            # Don't echo typing events back to the sender
            if event_type in ("typing", "stop_typing", "ai_typing", "ai_stop_typing"):
                if event_data.get("developer_id") == user_info.get("id"):
                    continue

            # Filter channel-scoped events to subscribed channels only
            channel_id = event_data.get("channel_id")
            if channel_id and event_type in CHANNEL_SCOPED_EVENTS:
                if channel_id not in conn_entry.subscribed_channels:
                    continue

            # Filter AI-scoped events to subscribed AI conversations only
            conv_id = event_data.get("conversation_id")
            if conv_id and event_type in AI_SCOPED_EVENTS:
                if conv_id not in conn_entry.subscribed_ai_conversations:
                    continue

            try:
                await ws.send_json(event)
            except Exception:
                break
    except asyncio.CancelledError:
        pass
