"""API routes for Devograph."""

from fastapi import APIRouter

from devograph.api.admin import router as admin_router
from devograph.api.analysis import router as analysis_router
from devograph.api.auth import router as auth_router
from devograph.api.career import router as career_router
from devograph.api.developers import router as developers_router
from devograph.api.health import router as health_router
from devograph.api.hiring import router as hiring_router
from devograph.api.learning import router as learning_router
from devograph.api.teams import router as teams_router
from devograph.api.webhooks import router as webhooks_router
# Phase 4: Advanced Analytics
from devograph.api.analytics import router as analytics_router
from devograph.api.reports import router as reports_router
from devograph.api.predictions import router as predictions_router
from devograph.api.exports import router as exports_router
from devograph.api.slack import router as slack_router
from devograph.api.repositories import router as repositories_router
from devograph.api.billing import router as billing_router
# Organization & Team Management
from devograph.api.workspaces import router as workspaces_router
from devograph.api.workspace_teams import router as workspace_teams_router
# Sprint Planning
from devograph.api.sprints import router as sprints_router
from devograph.api.sprint_tasks import router as sprint_tasks_router
from devograph.api.sprint_analytics import router as sprint_analytics_router
from devograph.api.retrospectives import router as retrospectives_router
# Task Configuration
from devograph.api.task_config import router as task_config_router
# External Integrations
from devograph.api.integrations import router as integrations_router

api_router = APIRouter()

api_router.include_router(health_router, tags=["health"])
api_router.include_router(auth_router, prefix="/auth", tags=["auth"])
api_router.include_router(developers_router, prefix="/developers", tags=["developers"])
api_router.include_router(webhooks_router, prefix="/webhooks", tags=["webhooks"])
api_router.include_router(teams_router, prefix="/teams", tags=["teams"])
api_router.include_router(analysis_router, tags=["analysis"])
api_router.include_router(admin_router, tags=["admin"])
# Phase 3: Career Intelligence
api_router.include_router(career_router, tags=["career"])
api_router.include_router(learning_router, tags=["learning"])
api_router.include_router(hiring_router, tags=["hiring"])
# Phase 4: Advanced Analytics
api_router.include_router(analytics_router, tags=["analytics"])
api_router.include_router(reports_router, tags=["reports"])
api_router.include_router(predictions_router, tags=["predictions"])
api_router.include_router(exports_router, tags=["exports"])
# Phase 4: Ecosystem Integrations
api_router.include_router(slack_router, tags=["slack"])
# Repository Management
api_router.include_router(repositories_router, tags=["repositories"])
# Billing & Subscriptions
api_router.include_router(billing_router, tags=["billing"])
# Organization & Team Management
api_router.include_router(workspaces_router, tags=["workspaces"])
api_router.include_router(workspace_teams_router, tags=["workspace-teams"])
# Sprint Planning
api_router.include_router(sprints_router, tags=["sprints"])
api_router.include_router(sprint_tasks_router, tags=["sprint-tasks"])
api_router.include_router(sprint_analytics_router, tags=["sprint-analytics"])
api_router.include_router(retrospectives_router, tags=["retrospectives"])
# Task Configuration
api_router.include_router(task_config_router, tags=["task-config"])
# External Integrations
api_router.include_router(integrations_router, tags=["integrations"])
