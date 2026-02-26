"""GTM (Go-To-Market) API package.

Combines all GTM sub-module routers into a single router.
"""

from fastapi import APIRouter

from .providers import router as providers_router
from .dashboard import router as dashboard_router
from .icp import router as icp_router
from .visitors import router as visitors_router
from .compliance import router as compliance_router
from .scoring import router as scoring_router
from .dedup import router as dedup_router
from .sequences import router as sequences_router
from .analytics import router as analytics_router
from .alerts import router as alerts_router
from .routing import router as routing_router
from .health import router as health_router
from .expansion import router as expansion_router
from .handoffs import router as handoffs_router
from .intent import router as intent_router
from .competitors import router as competitors_router
from .seo import router as seo_router
from .abm import router as abm_router

router = APIRouter(
    prefix="/workspaces/{workspace_id}/gtm",
    tags=["GTM"],
)

router.include_router(providers_router)
router.include_router(dashboard_router)
router.include_router(icp_router)
router.include_router(visitors_router)
router.include_router(compliance_router)
router.include_router(scoring_router)
router.include_router(dedup_router)
router.include_router(sequences_router)
router.include_router(analytics_router)
router.include_router(alerts_router)
router.include_router(routing_router)
router.include_router(health_router)
router.include_router(expansion_router)
router.include_router(handoffs_router)
router.include_router(intent_router)
router.include_router(competitors_router)
router.include_router(seo_router)
router.include_router(abm_router)
