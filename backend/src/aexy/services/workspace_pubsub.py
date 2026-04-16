"""Redis pub/sub for agent workspace real-time events."""

import json
import logging
from typing import Any, AsyncGenerator

import redis.asyncio as redis

from aexy.core.config import get_settings

logger = logging.getLogger(__name__)

_redis_client: redis.Redis | None = None


def _get_channel(agent_workspace_id: str) -> str:
    return f"agent_workspace:{agent_workspace_id}"


def _get_redis() -> redis.Redis:
    """Return a process-wide Redis client.

    `redis.asyncio.from_url` returns a client backed by a connection pool, so
    reusing a single instance avoids a new TCP/auth round-trip per publish.
    """
    global _redis_client
    if _redis_client is None:
        settings = get_settings()
        _redis_client = redis.from_url(settings.redis_url)
    return _redis_client


async def publish_workspace_event(
    agent_workspace_id: str,
    event_type: str,
    data: dict[str, Any],
) -> None:
    """Publish an event to the workspace channel."""
    try:
        r = _get_redis()
        channel = _get_channel(agent_workspace_id)
        payload = json.dumps({"event": event_type, "data": data}, default=str)
        await r.publish(channel, payload)
    except Exception:
        logger.exception("Failed to publish workspace event")


async def subscribe_workspace(
    agent_workspace_id: str,
) -> AsyncGenerator[dict[str, Any], None]:
    """Subscribe to workspace events via Redis pub/sub.

    Yields:
        Dict with 'event' and 'data' keys.
    """
    r = _get_redis()
    channel = _get_channel(agent_workspace_id)
    pubsub = r.pubsub()
    await pubsub.subscribe(channel)

    try:
        async for message in pubsub.listen():
            if message["type"] == "message":
                try:
                    payload = json.loads(message["data"])
                    yield payload
                except json.JSONDecodeError:
                    continue
    finally:
        try:
            await pubsub.unsubscribe(channel)
        finally:
            await pubsub.aclose()
