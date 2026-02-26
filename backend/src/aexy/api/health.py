"""Health check endpoints."""

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from sqlalchemy import text

from aexy.core.database import get_async_session

router = APIRouter()


@router.get("/health")
async def health_check():
    """Liveness check — confirms the process is running."""
    return {"status": "healthy"}


@router.get("/ready")
async def readiness_check():
    """Readiness check — confirms the app can serve traffic (DB reachable)."""
    try:
        async with get_async_session() as session:
            await session.execute(text("SELECT 1"))
    except Exception as exc:
        return JSONResponse(
            status_code=503,
            content={"status": "not_ready", "detail": f"database unavailable: {exc}"},
        )
    return {"status": "ready"}
