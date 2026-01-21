"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from aexy.api import api_router
from aexy.core.config import get_settings
from aexy.core.database import engine, Base
from aexy.middleware import UsageTrackingMiddleware

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - create tables on startup."""
    # Import models to register them with Base
    from aexy import models  # noqa: F401

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    yield

    # Cleanup on shutdown
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

    # Include API routes
    app.include_router(api_router, prefix=settings.api_v1_prefix)

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    uvicorn.run("aexy.main:app", host="0.0.0.0", port=8000, reload=True)
