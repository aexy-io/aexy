"""API routes for Gitraki."""

from fastapi import APIRouter

from gitraki.api.admin import router as admin_router
from gitraki.api.analysis import router as analysis_router
from gitraki.api.auth import router as auth_router
from gitraki.api.developers import router as developers_router
from gitraki.api.health import router as health_router
from gitraki.api.teams import router as teams_router
from gitraki.api.webhooks import router as webhooks_router

api_router = APIRouter()

api_router.include_router(health_router, tags=["health"])
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(developers_router, prefix="/developers", tags=["developers"])
api_router.include_router(webhooks_router, prefix="/webhooks", tags=["webhooks"])
api_router.include_router(teams_router, prefix="/teams", tags=["teams"])
api_router.include_router(analysis_router, tags=["analysis"])
api_router.include_router(admin_router, tags=["admin"])
