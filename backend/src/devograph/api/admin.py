"""Admin API endpoints for LLM processing management."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.cache import get_analysis_cache
from devograph.core.config import get_settings
from devograph.core.database import get_db
from devograph.llm.gateway import get_llm_gateway

logger = logging.getLogger(__name__)


# =============================================================================
# CELERY MONITORING HELPERS
# =============================================================================


async def get_celery_stats() -> dict[str, Any]:
    """Get Celery queue and worker statistics.

    Returns:
        Dict with queue_length, workers_active, and worker_details.
    """
    try:
        from devograph.processing.celery_app import celery_app
        import redis.asyncio as aioredis

        settings = get_settings()
        stats = {
            "queue_length": 0,
            "workers_active": 0,
            "worker_details": [],
            "queues": {},
        }

        # Get queue lengths from Redis
        try:
            redis_client = aioredis.from_url(settings.redis_url)

            # Check multiple queues
            queues = ["celery", "sync", "analysis", "batch", "tracking"]
            total_length = 0

            for queue in queues:
                length = await redis_client.llen(queue)
                stats["queues"][queue] = length
                total_length += length

            stats["queue_length"] = total_length
            await redis_client.close()
        except Exception as e:
            logger.warning(f"Failed to get queue lengths from Redis: {e}")

        # Get active workers using Celery inspect
        try:
            # Celery inspect is sync, run in executor
            import asyncio

            def get_workers():
                inspect = celery_app.control.inspect()
                active = inspect.active()
                stats_info = inspect.stats()

                workers = []
                worker_count = 0

                if active:
                    for worker_name, tasks in active.items():
                        worker_count += 1
                        worker_info = {
                            "name": worker_name,
                            "active_tasks": len(tasks),
                            "tasks": [
                                {
                                    "id": t.get("id"),
                                    "name": t.get("name"),
                                    "args": str(t.get("args", []))[:100],
                                }
                                for t in tasks[:5]  # Limit to 5 tasks
                            ],
                        }

                        if stats_info and worker_name in stats_info:
                            worker_stats = stats_info[worker_name]
                            worker_info["pool"] = worker_stats.get("pool", {})
                            worker_info["processed"] = worker_stats.get("total", {})

                        workers.append(worker_info)

                return worker_count, workers

            loop = asyncio.get_event_loop()
            worker_count, workers = await loop.run_in_executor(None, get_workers)

            stats["workers_active"] = worker_count
            stats["worker_details"] = workers

        except Exception as e:
            logger.warning(f"Failed to get worker info from Celery: {e}")

        return stats

    except Exception as e:
        logger.error(f"Failed to get Celery stats: {e}")
        return {
            "queue_length": 0,
            "workers_active": 0,
            "worker_details": [],
            "queues": {},
            "error": str(e),
        }

router = APIRouter(prefix="/admin", tags=["admin"])


# Response models
class LLMProviderStatus(BaseModel):
    """Status of an LLM provider."""

    name: str
    model: str
    healthy: bool
    error: str | None = None


class CacheStatus(BaseModel):
    """Status of the analysis cache."""

    enabled: bool
    healthy: bool
    total_keys: int = 0
    hits: int = 0
    misses: int = 0
    memory_used: str = "unknown"


class ProcessingStatus(BaseModel):
    """Status of the processing system."""

    mode: str
    llm_provider: LLMProviderStatus
    cache: CacheStatus
    queue_length: int = 0
    workers_active: int = 0


class LLMUsageStats(BaseModel):
    """LLM API usage statistics."""

    total_requests: int = 0
    total_tokens: int = 0
    requests_today: int = 0
    tokens_today: int = 0
    cache_hit_rate: float = 0.0
    average_latency_ms: float = 0.0
    cost_estimate_usd: float = 0.0


class BatchTriggerResponse(BaseModel):
    """Response for batch processing trigger."""

    status: str
    message: str
    job_id: str | None = None


class WorkerInfo(BaseModel):
    """Information about a Celery worker."""

    name: str
    active_tasks: int = 0
    tasks: list[dict] = []
    pool: dict = {}
    processed: dict = {}


class QueueStats(BaseModel):
    """Detailed queue statistics."""

    total_queue_length: int = 0
    workers_active: int = 0
    queues: dict[str, int] = {}
    workers: list[WorkerInfo] = []
    error: str | None = None


# Endpoints
@router.get("/processing/status", response_model=ProcessingStatus)
async def get_processing_status() -> ProcessingStatus:
    """Get current processing system status.

    Returns information about:
    - LLM provider health
    - Cache status
    - Processing queue length
    - Active workers
    """
    settings = get_settings()
    gateway = get_llm_gateway()
    cache = get_analysis_cache()

    # Check LLM provider
    llm_status = LLMProviderStatus(
        name="not_configured",
        model="none",
        healthy=False,
    )

    if gateway:
        try:
            health = await gateway.health_check()
            llm_status = LLMProviderStatus(
                name=health["provider"]["name"],
                model=health["provider"]["model"],
                healthy=health["provider"]["healthy"],
            )
        except Exception as e:
            llm_status.error = str(e)

    # Check cache
    cache_status = CacheStatus(enabled=cache is not None, healthy=False)

    if cache:
        try:
            cache_status.healthy = await cache.health_check()
            stats = await cache.get_stats()
            cache_status.total_keys = stats.get("total_keys", 0)
            cache_status.hits = stats.get("hits", 0)
            cache_status.misses = stats.get("misses", 0)
            cache_status.memory_used = stats.get("memory_used_human", "unknown")
        except Exception as e:
            logger.warning(f"Failed to get cache status: {e}")

    # Get Celery stats
    celery_stats = await get_celery_stats()

    return ProcessingStatus(
        mode=settings.llm.processing_mode.value,
        llm_provider=llm_status,
        cache=cache_status,
        queue_length=celery_stats.get("queue_length", 0),
        workers_active=celery_stats.get("workers_active", 0),
    )


@router.post("/processing/batch/trigger", response_model=BatchTriggerResponse)
async def trigger_batch_processing() -> BatchTriggerResponse:
    """Manually trigger batch processing.

    This will queue analysis jobs for all developers
    who haven't been analyzed recently.
    """
    try:
        from devograph.processing.tasks import batch_profile_sync_task

        # Trigger the batch sync task
        result = batch_profile_sync_task.delay()

        return BatchTriggerResponse(
            status="queued",
            message="Batch processing has been queued successfully",
            job_id=result.id,
        )
    except Exception as e:
        logger.error(f"Failed to trigger batch processing: {e}")
        return BatchTriggerResponse(
            status="error",
            message=f"Failed to trigger batch processing: {str(e)}",
            job_id=None,
        )


@router.get("/processing/queues", response_model=QueueStats)
async def get_queue_stats() -> QueueStats:
    """Get detailed queue and worker statistics.

    Returns:
    - Queue lengths for each queue
    - Active worker count and details
    - Current running tasks on each worker
    """
    stats = await get_celery_stats()

    workers = [
        WorkerInfo(**w) for w in stats.get("worker_details", [])
    ]

    return QueueStats(
        total_queue_length=stats.get("queue_length", 0),
        workers_active=stats.get("workers_active", 0),
        queues=stats.get("queues", {}),
        workers=workers,
        error=stats.get("error"),
    )


@router.get("/llm/usage", response_model=LLMUsageStats)
async def get_llm_usage_stats(
    db: AsyncSession = Depends(get_db),
) -> LLMUsageStats:
    """Get LLM API usage statistics.

    Returns usage data including:
    - Total requests and tokens
    - Today's usage
    - Cache hit rate
    - Cost estimate
    """
    from datetime import datetime, timezone
    from sqlalchemy import func
    from devograph.models.billing import UsageRecord

    try:
        # Get today's start timestamp
        now = datetime.now(timezone.utc)
        today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

        # Total usage stats
        total_stmt = select(
            func.count(UsageRecord.id).label("total_requests"),
            func.sum(UsageRecord.total_tokens).label("total_tokens"),
            func.sum(UsageRecord.total_cost_cents).label("total_cost"),
        )
        total_result = await db.execute(total_stmt)
        total_row = total_result.one()

        # Today's usage
        today_stmt = select(
            func.count(UsageRecord.id).label("requests_today"),
            func.sum(UsageRecord.total_tokens).label("tokens_today"),
        ).where(UsageRecord.created_at >= today_start)
        today_result = await db.execute(today_stmt)
        today_row = today_result.one()

        # Get cache stats if available
        cache = get_analysis_cache()
        cache_hit_rate = 0.0
        if cache:
            try:
                stats = await cache.get_stats()
                hits = stats.get("hits", 0)
                misses = stats.get("misses", 0)
                total_cache_requests = hits + misses
                if total_cache_requests > 0:
                    cache_hit_rate = hits / total_cache_requests
            except Exception:
                pass

        return LLMUsageStats(
            total_requests=total_row.total_requests or 0,
            total_tokens=total_row.total_tokens or 0,
            requests_today=today_row.requests_today or 0,
            tokens_today=today_row.tokens_today or 0,
            cache_hit_rate=cache_hit_rate,
            average_latency_ms=0.0,  # TODO: Track latency in UsageRecord
            cost_estimate_usd=(total_row.total_cost or 0) / 100.0,  # Convert cents to USD
        )
    except Exception as e:
        logger.error(f"Failed to get LLM usage stats: {e}")
        return LLMUsageStats(
            total_requests=0,
            total_tokens=0,
            requests_today=0,
            tokens_today=0,
            cache_hit_rate=0.0,
            average_latency_ms=0.0,
            cost_estimate_usd=0.0,
        )


@router.post("/cache/clear")
async def clear_cache(
    prefix: str | None = None,
) -> dict[str, Any]:
    """Clear the analysis cache.

    Optionally specify a prefix to clear only matching entries.
    """
    cache = get_analysis_cache()

    if not cache:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Cache not available",
        )

    try:
        deleted = await cache.clear_prefix(prefix or "")
        return {
            "status": "success",
            "deleted_keys": deleted,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to clear cache: {str(e)}",
        )


@router.get("/config")
async def get_llm_config() -> dict[str, Any]:
    """Get current LLM configuration (sanitized).

    Returns configuration without sensitive data like API keys.
    """
    settings = get_settings()

    return {
        "provider": settings.llm.llm_provider,
        "model": settings.llm.llm_model,
        "processing_mode": settings.llm.processing_mode.value,
        "max_tokens_per_request": settings.llm.max_tokens_per_request,
        "max_requests_per_hour": settings.llm.max_requests_per_hour,
        "caching_enabled": settings.llm.enable_caching,
        "cache_ttl_hours": settings.llm.cache_ttl_hours,
        "features": {
            "code_analysis": settings.llm.enable_code_analysis,
            "soft_skills": settings.llm.enable_soft_skills,
            "task_matching": settings.llm.enable_task_matching,
        },
        "ollama_base_url": settings.llm.ollama_base_url if settings.llm.llm_provider == "ollama" else None,
    }


@router.get("/health")
async def health_check() -> dict[str, Any]:
    """Comprehensive health check for LLM subsystem.

    Checks:
    - LLM provider connectivity
    - Cache connectivity
    - Queue connectivity (if enabled)
    """
    gateway = get_llm_gateway()
    cache = get_analysis_cache()

    checks = {
        "llm_provider": {"status": "unknown", "message": ""},
        "cache": {"status": "unknown", "message": ""},
        "queue": {"status": "not_implemented", "message": "Celery queue not yet implemented"},
    }

    # Check LLM provider
    if gateway:
        try:
            health = await gateway.health_check()
            if health["healthy"]:
                checks["llm_provider"]["status"] = "healthy"
                checks["llm_provider"]["message"] = f"Provider: {health['provider']['name']}"
            else:
                checks["llm_provider"]["status"] = "unhealthy"
                checks["llm_provider"]["message"] = "Provider health check failed"
        except Exception as e:
            checks["llm_provider"]["status"] = "error"
            checks["llm_provider"]["message"] = str(e)
    else:
        checks["llm_provider"]["status"] = "not_configured"
        checks["llm_provider"]["message"] = "LLM provider not configured"

    # Check cache
    if cache:
        try:
            if await cache.health_check():
                checks["cache"]["status"] = "healthy"
                checks["cache"]["message"] = "Cache is operational"
            else:
                checks["cache"]["status"] = "unhealthy"
                checks["cache"]["message"] = "Cache health check failed"
        except Exception as e:
            checks["cache"]["status"] = "error"
            checks["cache"]["message"] = str(e)
    else:
        checks["cache"]["status"] = "not_available"
        checks["cache"]["message"] = "Cache not available"

    # Overall health
    overall_healthy = all(
        c["status"] in ("healthy", "not_implemented", "not_configured", "not_available")
        for c in checks.values()
    )

    return {
        "healthy": overall_healthy,
        "checks": checks,
    }
