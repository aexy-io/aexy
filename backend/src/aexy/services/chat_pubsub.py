"""Redis pub/sub for real-time chat event broadcasting across workers."""

import json
import logging
from typing import Any, AsyncGenerator

import redis.asyncio as redis

from aexy.core.config import get_settings

logger = logging.getLogger(__name__)

settings = get_settings()

# Channel name patterns for Redis pub/sub
WORKSPACE_CHANNEL = "chat:ws:{workspace_id}"


class ChatPubSub:
    """Redis pub/sub wrapper for chat event broadcasting.

    Publishes events to a per-workspace Redis channel so all backend workers
    can relay them to connected WebSocket clients.
    """

    def __init__(self, redis_url: str | None = None):
        self.redis_url = redis_url or settings.redis_url
        self._redis: redis.Redis | None = None

    async def _get_redis(self) -> redis.Redis:
        if self._redis is None:
            self._redis = redis.from_url(
                self.redis_url,
                decode_responses=True,
            )
        return self._redis

    async def publish(self, workspace_id: str, event_type: str, data: dict[str, Any]) -> None:
        """Publish a chat event to the workspace's Redis channel."""
        r = await self._get_redis()
        channel = WORKSPACE_CHANNEL.format(workspace_id=workspace_id)
        payload = json.dumps({"type": event_type, "data": data}, default=str)
        try:
            await r.publish(channel, payload)
        except Exception:
            logger.exception("Failed to publish chat event %s", event_type)

    async def subscribe(self, workspace_id: str) -> AsyncGenerator[dict, None]:
        """Subscribe to a workspace's chat events. Yields parsed event dicts."""
        r = await self._get_redis()
        channel = WORKSPACE_CHANNEL.format(workspace_id=workspace_id)
        pubsub = r.pubsub()
        await pubsub.subscribe(channel)
        try:
            async for raw_message in pubsub.listen():
                if raw_message["type"] != "message":
                    continue
                try:
                    yield json.loads(raw_message["data"])
                except (json.JSONDecodeError, KeyError):
                    continue
        finally:
            await pubsub.unsubscribe(channel)
            await pubsub.close()

    async def close(self) -> None:
        if self._redis:
            await self._redis.close()
            self._redis = None


# Module-level singleton
_pubsub: ChatPubSub | None = None


def get_chat_pubsub() -> ChatPubSub:
    global _pubsub
    if _pubsub is None:
        _pubsub = ChatPubSub()
    return _pubsub
