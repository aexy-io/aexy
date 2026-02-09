"""Temporal client singleton for FastAPI and worker processes."""

import logging

from temporalio.client import Client

from aexy.core.config import get_settings

logger = logging.getLogger(__name__)

_client: Client | None = None


async def get_temporal_client() -> Client:
    """Get or create the Temporal client singleton.

    Returns:
        Connected Temporal client.
    """
    global _client
    if _client is None:
        settings = get_settings()
        _client = await Client.connect(
            settings.temporal_address,
            namespace=settings.temporal_namespace,
        )
        logger.info(f"Connected to Temporal at {settings.temporal_address}")
    return _client
