"""Redis-backed collaboration primitives for AI conversations."""

import json
import logging
from typing import Any

import redis.asyncio as redis

from aexy.core.config import get_settings
from aexy.services.chat_pubsub import get_chat_pubsub

logger = logging.getLogger(__name__)

AI_LOCK_KEY = "ai:lock:{conversation_id}"
AI_QUEUE_KEY = "ai:queue:{conversation_id}"
AI_LOCK_TTL = 300  # 5 minutes


class AskCollaborationService:
    """Redis-backed collaboration primitives for AI conversations."""

    def __init__(self):
        settings = get_settings()
        self.redis_url = settings.redis_url
        self._redis: redis.Redis | None = None

    async def _get_redis(self) -> redis.Redis:
        if self._redis is None:
            self._redis = redis.from_url(self.redis_url, decode_responses=True)
        return self._redis

    async def acquire_ai_lock(self, conversation_id: str) -> bool:
        """Acquire an exclusive lock for AI response generation.

        Returns True if the lock was acquired, False if already held.
        """
        r = await self._get_redis()
        key = AI_LOCK_KEY.format(conversation_id=conversation_id)
        result = await r.set(key, "1", nx=True, ex=AI_LOCK_TTL)
        return result is not None

    async def release_ai_lock(self, conversation_id: str) -> None:
        """Release the AI response lock."""
        r = await self._get_redis()
        key = AI_LOCK_KEY.format(conversation_id=conversation_id)
        await r.delete(key)

    async def is_ai_locked(self, conversation_id: str) -> bool:
        """Check if the AI is currently responding."""
        r = await self._get_redis()
        key = AI_LOCK_KEY.format(conversation_id=conversation_id)
        return await r.exists(key) > 0

    async def enqueue_message(self, conversation_id: str, message_id: str) -> int:
        """Add a message to the queue. Returns the queue position (1-based)."""
        r = await self._get_redis()
        key = AI_QUEUE_KEY.format(conversation_id=conversation_id)
        await r.rpush(key, message_id)
        length = await r.llen(key)
        return length

    async def dequeue_message(self, conversation_id: str) -> str | None:
        """Pop the next message from the queue."""
        r = await self._get_redis()
        key = AI_QUEUE_KEY.format(conversation_id=conversation_id)
        return await r.lpop(key)

    async def get_queue_length(self, conversation_id: str) -> int:
        """Get the number of queued messages."""
        r = await self._get_redis()
        key = AI_QUEUE_KEY.format(conversation_id=conversation_id)
        return await r.llen(key)

    async def publish_ai_event(
        self, workspace_id: str, conversation_id: str, event_type: str, data: dict[str, Any]
    ) -> None:
        """Publish an AI conversation event via the existing chat pub/sub system."""
        pubsub = get_chat_pubsub()
        event_data = {"conversation_id": conversation_id, **data}
        await pubsub.publish(workspace_id, event_type, event_data)

    async def close(self) -> None:
        if self._redis:
            await self._redis.close()
            self._redis = None


# Module-level singleton
_collab_service: AskCollaborationService | None = None


def get_ask_collaboration_service() -> AskCollaborationService:
    global _collab_service
    if _collab_service is None:
        _collab_service = AskCollaborationService()
    return _collab_service
