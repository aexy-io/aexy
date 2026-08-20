"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from aexy.api import api_router
from aexy.api.mcp_oauth import router as mcp_oauth_router
from aexy.core.config import get_settings
from aexy.core.database import engine, Base
from aexy.middleware import (
    CommunityIsolationMiddleware,
    ErrorResponseMiddleware,
    UsageTrackingMiddleware,
)
from aexy.services.data_table_service import DuplicateValueError

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - create tables on startup."""
    # Import models to register them with Base
    from aexy import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    # Ensure storage bucket exists
    try:
        from aexy.services.storage_service import get_storage_service
        storage = get_storage_service()
        if storage.is_configured():
            await storage.ensure_bucket_exists()
    except Exception as e:
        import logging
        logging.getLogger(__name__).warning(f"Storage bucket bootstrap failed: {e}")

    # Seed platform org (CRM objects, email templates, onboarding flow)
    if settings.platform_org_id:
        try:
            import logging
            from aexy.core.database import async_session_maker
            from aexy.services.platform_service import PlatformService
            async with async_session_maker() as db:
                await PlatformService(db).ensure_platform_setup()
                await db.commit()
        except Exception as e:
            logging.getLogger(__name__).warning(f"Platform org setup failed: {e}")

    # Keep each worker's app_settings cache fresh across processes: clear the
    # local entry whenever any worker toggles a workspace module. Best-effort —
    # runs only if Redis is reachable, otherwise toggles fall back to TTL.
    import asyncio

    from aexy.services.app_settings_pubsub import (
        run_app_settings_invalidation_subscriber,
    )

    app_settings_subscriber = asyncio.create_task(
        run_app_settings_invalidation_subscriber()
    )

    yield

    # Cleanup on shutdown
    app_settings_subscriber.cancel()
    try:
        await app_settings_subscriber
    except asyncio.CancelledError:
        pass
    await engine.dispose()


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title=settings.app_name,
        description="The open-source operating system for engineering organizations",
        version="0.1.0",
        docs_url="/docs",
        redoc_url="/redoc",
        lifespan=lifespan,
    )

    # CORS middleware - allow frontend URL from settings
    allowed_origins = [
        settings.frontend_url,
        "http://localhost:3000",  # Local development
        "http://localhost:3003",  # Dev compose (alternate port)
    ]
    # Remove duplicates and empty strings
    allowed_origins = list(set(origin for origin in allowed_origins if origin))

    # Order matters, and `add_middleware` reads bottom-up: the last one added is
    # the outermost, so these are written innermost-first. The resulting chain is
    #
    #     ServerError -> CORS -> ErrorResponse -> CommunityIsolation -> Usage
    #
    # Two things depend on that arrangement, and each is stated where it
    # applies — bottom-up ordering is easy to read backwards, and one of these
    # has already been got wrong once.

    # Usage tracking middleware for API call metering.
    app.add_middleware(
        UsageTrackingMiddleware,
        redis_url=settings.redis_url,
        secret_key=settings.secret_key,
        algorithm=settings.algorithm,
    )

    # Wall off community-only accounts from every internal endpoint. Outside
    # UsageTracking so a blocked community request is rejected without being
    # metered.
    app.add_middleware(
        CommunityIsolationMiddleware,
        secret_key=settings.secret_key,
        algorithm=settings.algorithm,
    )

    # Unhandled exceptions become a 500 here rather than escaping to Starlette's
    # own ServerErrorMiddleware, which sits outside everything below and answers
    # without the headers CORS adds. A browser reads that headerless 500 as a
    # CORS refusal and says so, which points whoever is debugging at the one
    # part of the stack that was working.
    app.add_middleware(ErrorResponseMiddleware)

    # CORS is outermost, so every response that leaves — including the 500 above
    # — carries its headers.
    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # A unique-attribute violation is a conflict, not a bad request.
    @app.exception_handler(DuplicateValueError)
    async def _duplicate_value_handler(request: Request, exc: DuplicateValueError):
        return JSONResponse(
            status_code=status.HTTP_409_CONFLICT,
            content={
                "detail": str(exc),
                "field": exc.field,
                "existing_record_id": exc.existing_record_id,
            },
        )

    # Include API routes
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    # OAuth for remote MCP clients, mounted at the ORIGIN rather than under
    # /api/v1. RFC 8414 and RFC 9728 define /.well-known/* as origin-level URIs;
    # a client that cannot find them there concludes the server does not do
    # OAuth and stops. ChatGPT does precisely that, so the prefix would be a
    # silent "not supported". The authorize/token/register endpoints join them
    # so that everything the metadata advertises lives on one origin.
    app.include_router(mcp_oauth_router)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("aexy.main:app", host="0.0.0.0", port=8000, reload=True)
