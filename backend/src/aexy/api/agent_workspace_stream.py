"""SSE streaming endpoint for real-time agent workspace updates."""

import asyncio
import json
import logging

from fastapi import APIRouter, Depends, HTTPException, Query, Request, status
from fastapi.responses import StreamingResponse
from jose import JWTError, jwt
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.core.config import get_settings
from aexy.core.database import get_db
from aexy.models.developer import Developer
from aexy.services.api_token_service import ApiTokenService
from aexy.services.developer_service import DeveloperNotFoundError, DeveloperService
from aexy.services.workspace_pubsub import subscribe_workspace
from aexy.services.workspace_service import WorkspaceService

logger = logging.getLogger(__name__)
settings = get_settings()

router = APIRouter(
    prefix="/workspaces/{workspace_id}/agent-workspaces",
    tags=["agent-workspace-stream"],
)


async def _developer_from_query_token(
    token: str | None,
    db: AsyncSession,
) -> Developer:
    """Resolve a Developer from a JWT/API token passed via query string.

    EventSource cannot set Authorization headers, so stream endpoints accept
    the token as a query parameter.
    """
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing token"
        )

    dev_service = DeveloperService(db)

    if token.startswith("aexy_"):
        api_token = await ApiTokenService(db).validate(token)
        if api_token is None:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Invalid or expired API token",
            )
        try:
            return await dev_service.get_by_id(api_token.developer_id)
        except DeveloperNotFoundError:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND, detail="Developer not found"
            )

    try:
        payload = jwt.decode(
            token, settings.secret_key, algorithms=[settings.algorithm]
        )
        developer_id = payload.get("sub")
        if not developer_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
            )
    except JWTError:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token"
        )

    try:
        return await dev_service.get_by_id(developer_id)
    except DeveloperNotFoundError:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND, detail="Developer not found"
        )


@router.get("/{agent_workspace_id}/stream")
async def stream_workspace_events(
    workspace_id: str,
    agent_workspace_id: str,
    request: Request,
    token: str | None = Query(None),
    db: AsyncSession = Depends(get_db),
):
    """SSE endpoint for real-time block updates.

    Connect with EventSource:
        const es = new EventSource(`/api/v1/workspaces/${wid}/agent-workspaces/${awid}/stream?token=${jwt}`);
        es.addEventListener('block_updated', (e) => { ... });
    """
    developer = await _developer_from_query_token(token, db)
    member = await WorkspaceService(db).get_member(workspace_id, developer.id)
    if not member:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not a member of this workspace",
        )

    async def event_generator():
        heartbeat_interval = 15.0
        try:
            subscriber = subscribe_workspace(agent_workspace_id)
            subscriber_task: asyncio.Task | None = None

            while True:
                if await request.is_disconnected():
                    break

                if subscriber_task is None:
                    subscriber_task = asyncio.create_task(subscriber.__anext__())

                done, _ = await asyncio.wait(
                    {subscriber_task}, timeout=heartbeat_interval
                )

                if subscriber_task in done:
                    try:
                        event = subscriber_task.result()
                    except StopAsyncIteration:
                        break
                    subscriber_task = None
                    event_type = event.get("event", "message")
                    data = json.dumps(event.get("data", {}), default=str)
                    yield f"event: {event_type}\ndata: {data}\n\n"
                else:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("SSE stream error")
        finally:
            try:
                await subscriber.aclose()
            except Exception:
                logger.exception("Failed to close workspace subscriber")

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )
