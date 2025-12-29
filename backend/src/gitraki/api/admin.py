"""Admin API endpoints for LLM processing management."""

import logging
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field

from gitraki.cache import get_analysis_cache
from gitraki.core.config import get_settings
from gitraki.llm.gateway import get_llm_gateway

logger = logging.getLogger(__name__)

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

    return ProcessingStatus(
        mode=settings.llm.processing_mode.value,
        llm_provider=llm_status,
        cache=cache_status,
        queue_length=0,  # TODO: Get from Celery
        workers_active=0,  # TODO: Get from Celery
    )


@router.post("/processing/batch/trigger", response_model=BatchTriggerResponse)
async def trigger_batch_processing() -> BatchTriggerResponse:
    """Manually trigger batch processing.

    This will queue analysis jobs for all developers
    who haven't been analyzed recently.
    """
    # TODO: Implement Celery task triggering
    return BatchTriggerResponse(
        status="queued",
        message="Batch processing has been queued",
        job_id=None,
    )


@router.get("/llm/usage", response_model=LLMUsageStats)
async def get_llm_usage_stats() -> LLMUsageStats:
    """Get LLM API usage statistics.

    Returns usage data including:
    - Total requests and tokens
    - Today's usage
    - Cache hit rate
    - Cost estimate
    """
    # TODO: Implement actual usage tracking
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
