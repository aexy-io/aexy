"""WebSocket endpoint for real-time document collaboration."""

import asyncio
import logging
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.database import get_db
from aexy.models.documentation import CollaborationSession, Document
from aexy.services.document_service import DocumentService

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/collaboration", tags=["Collaboration"])


class ConnectionManager:
    """Manages WebSocket connections for document collaboration."""

    def __init__(self):
        # document_id -> list of (websocket, user_info)
        self.active_connections: dict[str, list[tuple[WebSocket, dict]]] = {}
        # websocket -> document_id
        self.connection_documents: dict[WebSocket, str] = {}
        # document_id -> awareness state (user cursors, selections)
        self.awareness_states: dict[str, dict[str, dict]] = {}

    async def connect(
        self, websocket: WebSocket, document_id: str, user_info: dict
    ) -> None:
        """Accept a new WebSocket connection for a document."""
        await websocket.accept()

        if document_id not in self.active_connections:
            self.active_connections[document_id] = []
            self.awareness_states[document_id] = {}

        self.active_connections[document_id].append((websocket, user_info))
        self.connection_documents[websocket] = document_id

        # Add user to awareness
        user_id = user_info.get("id", str(uuid4()))
        self.awareness_states[document_id][user_id] = {
            "user": user_info,
            "cursor": None,
            "selection": None,
            "lastActive": datetime.now(timezone.utc).isoformat(),
        }

        # Broadcast new user joined
        await self.broadcast_awareness(document_id)

        logger.info(
            f"User {user_info.get('name', 'Unknown')} connected to document {document_id}"
        )

    def disconnect(self, websocket: WebSocket) -> str | None:
        """Remove a WebSocket connection."""
        document_id = self.connection_documents.pop(websocket, None)

        if document_id and document_id in self.active_connections:
            # Find and remove this connection
            self.active_connections[document_id] = [
                (ws, info)
                for ws, info in self.active_connections[document_id]
                if ws != websocket
            ]

            # Find user_id for this connection and remove from awareness
            for user_id, state in list(self.awareness_states.get(document_id, {}).items()):
                # This is a simplification - in production you'd track user_id per connection
                pass

            # Clean up empty document rooms
            if not self.active_connections[document_id]:
                del self.active_connections[document_id]
                if document_id in self.awareness_states:
                    del self.awareness_states[document_id]

            logger.info(f"User disconnected from document {document_id}")

        return document_id

    async def broadcast(
        self,
        document_id: str,
        message: dict,
        exclude: WebSocket | None = None,
    ) -> None:
        """Broadcast a message to all connections for a document."""
        if document_id not in self.active_connections:
            return

        disconnected = []
        for websocket, _ in self.active_connections[document_id]:
            if websocket == exclude:
                continue
            try:
                await websocket.send_json(message)
            except Exception as e:
                logger.warning(f"Failed to send message: {e}")
                disconnected.append(websocket)

        # Clean up disconnected websockets
        for ws in disconnected:
            self.disconnect(ws)

    async def broadcast_awareness(self, document_id: str) -> None:
        """Broadcast awareness state to all connections."""
        if document_id not in self.awareness_states:
            return

        message = {
            "type": "awareness",
            "users": list(self.awareness_states[document_id].values()),
        }
        await self.broadcast(document_id, message)

    def update_awareness(
        self,
        document_id: str,
        user_id: str,
        cursor: dict | None = None,
        selection: dict | None = None,
    ) -> None:
        """Update awareness state for a user."""
        if document_id not in self.awareness_states:
            return

        if user_id not in self.awareness_states[document_id]:
            return

        state = self.awareness_states[document_id][user_id]
        if cursor is not None:
            state["cursor"] = cursor
        if selection is not None:
            state["selection"] = selection
        state["lastActive"] = datetime.now(timezone.utc).isoformat()

    def get_active_users(self, document_id: str) -> list[dict]:
        """Get list of active users for a document."""
        if document_id not in self.awareness_states:
            return []
        return [
            state["user"]
            for state in self.awareness_states[document_id].values()
        ]

    def get_connection_count(self, document_id: str) -> int:
        """Get number of active connections for a document."""
        return len(self.active_connections.get(document_id, []))


# Global connection manager
manager = ConnectionManager()


@router.websocket("/ws/{document_id}")
async def document_websocket(
    websocket: WebSocket,
    document_id: str,
    token: str = Query(...),
):
    """WebSocket endpoint for document collaboration.

    Protocol:
    - Client connects with document_id and auth token
    - Server sends current document state and awareness
    - Client sends updates (Yjs sync messages, awareness updates)
    - Server broadcasts updates to other clients
    """
    # Validate token and get user info
    user_info = await validate_token_and_get_user(token)
    if not user_info:
        await websocket.close(code=4001, reason="Invalid token")
        return

    # Check document access
    # Note: In production, verify user has access to document
    db = None  # We'd need to get db session here

    try:
        await manager.connect(websocket, document_id, user_info)

        # Send initial state
        await websocket.send_json({
            "type": "connected",
            "documentId": document_id,
            "userId": user_info.get("id"),
            "users": manager.get_active_users(document_id),
        })

        # Message handling loop
        while True:
            try:
                data = await websocket.receive_json()
                await handle_message(websocket, document_id, user_info, data)
            except WebSocketDisconnect:
                break
            except Exception as e:
                logger.error(f"Error handling message: {e}")
                await websocket.send_json({
                    "type": "error",
                    "message": str(e),
                })

    except WebSocketDisconnect:
        pass
    except Exception as e:
        logger.error(f"WebSocket error: {e}")
    finally:
        disconnected_doc = manager.disconnect(websocket)
        if disconnected_doc:
            await manager.broadcast_awareness(disconnected_doc)


async def validate_token_and_get_user(token: str) -> dict | None:
    """Validate auth token and return user info.

    In production, this would validate a JWT or session token.
    """
    # For now, parse token as "user_id:name:email"
    # In production, use proper JWT validation
    try:
        parts = token.split(":")
        if len(parts) >= 2:
            return {
                "id": parts[0],
                "name": parts[1] if len(parts) > 1 else "Unknown",
                "email": parts[2] if len(parts) > 2 else None,
                "color": generate_user_color(parts[0]),
            }
    except Exception:
        pass

    return None


def generate_user_color(user_id: str) -> str:
    """Generate a consistent color for a user based on their ID."""
    colors = [
        "#f87171",  # red
        "#fb923c",  # orange
        "#fbbf24",  # amber
        "#a3e635",  # lime
        "#34d399",  # emerald
        "#22d3ee",  # cyan
        "#60a5fa",  # blue
        "#a78bfa",  # violet
        "#f472b6",  # pink
    ]
    # Use hash of user_id to pick consistent color
    hash_val = sum(ord(c) for c in user_id)
    return colors[hash_val % len(colors)]


async def handle_message(
    websocket: WebSocket,
    document_id: str,
    user_info: dict,
    data: dict,
) -> None:
    """Handle incoming WebSocket message."""
    msg_type = data.get("type")
    user_id = user_info.get("id")

    if msg_type == "sync":
        # Yjs sync message - broadcast to other clients
        await manager.broadcast(
            document_id,
            {
                "type": "sync",
                "data": data.get("data"),
                "from": user_id,
            },
            exclude=websocket,
        )

    elif msg_type == "awareness":
        # Update user's awareness state
        manager.update_awareness(
            document_id,
            user_id,
            cursor=data.get("cursor"),
            selection=data.get("selection"),
        )
        # Broadcast updated awareness
        await manager.broadcast_awareness(document_id)

    elif msg_type == "update":
        # Document content update - broadcast and optionally persist
        await manager.broadcast(
            document_id,
            {
                "type": "update",
                "data": data.get("data"),
                "from": user_id,
            },
            exclude=websocket,
        )

    elif msg_type == "ping":
        # Keep-alive ping
        await websocket.send_json({"type": "pong"})

    else:
        logger.warning(f"Unknown message type: {msg_type}")


# REST endpoints for collaboration info

@router.get("/{document_id}/users")
async def get_active_users(document_id: str) -> dict:
    """Get active users for a document."""
    return {
        "documentId": document_id,
        "users": manager.get_active_users(document_id),
        "count": manager.get_connection_count(document_id),
    }


@router.get("/{document_id}/status")
async def get_collaboration_status(document_id: str) -> dict:
    """Get collaboration status for a document."""
    return {
        "documentId": document_id,
        "isActive": manager.get_connection_count(document_id) > 0,
        "userCount": manager.get_connection_count(document_id),
        "users": manager.get_active_users(document_id),
    }
