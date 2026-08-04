"""Cross-process invalidation for the workspace access caches.

The access guard reads ``workspace.settings["app_settings"]`` and each member's
resolved access on nearly every request, and caches both in-process (see
``app_access_service``). Those caches are per-process, so when an admin toggles a
module — or edits a department's access profile, which changes what many members
resolve to at once — the writing worker clears its own copy but other
workers/containers keep serving the stale value until the TTL lapses.

This module closes that gap with a tiny Redis pub/sub channel: writers publish
the changed workspace id, and every worker runs a background subscriber that
drops the matching local cache entry. Everything here is best-effort — if Redis
is unavailable the app still runs and simply falls back to TTL-bounded
staleness.
"""

import asyncio
import logging

import redis.asyncio as redis

from aexy.core.config import get_settings

logger = logging.getLogger(__name__)

APP_SETTINGS_INVALIDATION_CHANNEL = "app_settings:invalidate"

_publish_client: redis.Redis | None = None


async def _get_publish_client() -> redis.Redis:
    global _publish_client
    if _publish_client is None:
        _publish_client = redis.from_url(
            get_settings().redis_url, decode_responses=True
        )
    return _publish_client


async def publish_app_settings_invalidation(workspace_id: str) -> None:
    """Tell other workers to drop their cached app_settings for this workspace.

    Best-effort: a Redis failure is logged, not raised — the local cache has
    already been cleared by the caller and the TTL still bounds staleness.
    """
    try:
        client = await _get_publish_client()
        await client.publish(APP_SETTINGS_INVALIDATION_CHANNEL, str(workspace_id))
    except Exception:
        logger.warning(
            "Failed to publish app_settings invalidation for workspace %s; "
            "other workers will refresh on TTL expiry",
            workspace_id,
            exc_info=True,
        )


async def run_app_settings_invalidation_subscriber() -> None:
    """Long-lived task: clear the local app_settings cache on each published id.

    Reconnects with backoff on Redis errors and exits quietly on cancellation
    (shutdown). Imported lazily to avoid a circular import with the service that
    owns the cache.
    """
    from aexy.services.app_access_service import clear_workspace_access_caches

    backoff = 1.0
    while True:
        try:
            client = redis.from_url(get_settings().redis_url, decode_responses=True)
            pubsub = client.pubsub()
            await pubsub.subscribe(APP_SETTINGS_INVALIDATION_CHANNEL)
            logger.info("app_settings invalidation subscriber connected")
            backoff = 1.0
            try:
                async for message in pubsub.listen():
                    if message.get("type") != "message":
                        continue
                    workspace_id = message.get("data")
                    if workspace_id:
                        clear_workspace_access_caches(str(workspace_id))
            finally:
                await pubsub.unsubscribe(APP_SETTINGS_INVALIDATION_CHANNEL)
                await pubsub.aclose()
                await client.aclose()
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.warning(
                "app_settings invalidation subscriber lost Redis; retrying in %.0fs "
                "(cross-worker toggles fall back to TTL until then)",
                backoff,
                exc_info=True,
            )
            await asyncio.sleep(backoff)
            backoff = min(backoff * 2, 30.0)
