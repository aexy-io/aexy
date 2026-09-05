"""FastAPI application entry point."""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from aexy.api import api_router
from aexy.api.mcp_oauth import router as mcp_oauth_router
from aexy.core.config import get_settings
from aexy.core.database import engine, Base
from aexy.middleware import CommunityIsolationMiddleware, UsageTrackingMiddleware
from aexy.llm.gateway import AIFeatureDormant
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
    #
    # Collaborative documents live as CRDTs in this process's memory between
    # debounced flushes. Without this, a deploy loses whatever was typed since
    # the last flush in every document currently open.
    from aexy.services.document_collaboration import flush_all as flush_collab_rooms

    try:
        await flush_collab_rooms()
    except Exception:
        logging.getLogger(__name__).exception(
            "shutdown: could not flush open collaboration rooms"
        )

    app_settings_subscriber.cancel()
    try:
        await app_settings_subscriber
    except asyncio.CancelledError:
        pass
    await engine.dispose()


def _package_version() -> str:
    """The installed version of this package, or a marker that says so.

    Falls back rather than raising: running from a source tree with no
    installed distribution is a normal thing to do, and an unbuildable app is a
    worse outcome than an imprecise version in the docs.
    """
    from importlib.metadata import PackageNotFoundError, version

    try:
        return version("aexy")
    except PackageNotFoundError:
        return "0.0.0+unknown"


def create_app() -> FastAPI:
    """Create and configure the FastAPI application."""
    app = FastAPI(
        title=settings.app_name,
        description="The open-source operating system for engineering organizations",
        # Read from the installed package rather than typed here. It said
        # "0.1.0" while the project was on 0.22.1 — a third place to keep a
        # version number is a third place to forget, and the one that ends up
        # wrong is the one nobody looks at, which is the OpenAPI document every
        # client generates from.
        version=_package_version(),
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

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*"],
    )

    # Usage tracking middleware for API call metering
    app.add_middleware(
        UsageTrackingMiddleware,
        redis_url=settings.redis_url,
        secret_key=settings.secret_key,
        algorithm=settings.algorithm,
    )

    # Wall off community-only accounts from every internal endpoint. Added last
    # so it runs before UsageTracking (Starlette runs middleware LIFO) — a
    # blocked community request is rejected without being metered.
    app.add_middleware(
        CommunityIsolationMiddleware,
        secret_key=settings.secret_key,
        algorithm=settings.algorithm,
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

    # A feature switched off by configuration is unavailable, not broken. 503
    # with the reason and the switch, rather than the 500 an unhandled
    # RuntimeError would give — the whole point of the flag is that an operator
    # can see why nothing happened.
    @app.exception_handler(AIFeatureDormant)
    async def _dormant_feature_handler(request: Request, exc: AIFeatureDormant):
        return JSONResponse(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            content={
                "detail": str(exc),
                "feature": exc.feature,
                "reason": exc.reason,
                "enable_with": f"AI_ENABLE_DORMANT_FEATURES={exc.feature}",
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
