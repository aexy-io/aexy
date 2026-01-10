"""API routes for Aexy."""

from fastapi import APIRouter

from aexy.api.admin import router as admin_router
from aexy.api.analysis import router as analysis_router
from aexy.api.auth import router as auth_router
from aexy.api.career import router as career_router
from aexy.api.developers import router as developers_router
from aexy.api.health import router as health_router
from aexy.api.hiring import router as hiring_router
from aexy.api.learning import router as learning_router
from aexy.api.learning_activities import router as learning_activities_router
from aexy.api.gamification import router as gamification_router
from aexy.api.teams import router as teams_router
from aexy.api.webhooks import router as webhooks_router
# Phase 4: Advanced Analytics
from aexy.api.analytics import router as analytics_router
from aexy.api.reports import router as reports_router
from aexy.api.predictions import router as predictions_router
from aexy.api.exports import router as exports_router
from aexy.api.slack import router as slack_router
from aexy.api.repositories import router as repositories_router
from aexy.api.billing import router as billing_router
# Organization & Team Management
from aexy.api.workspaces import router as workspaces_router
from aexy.api.workspace_teams import router as workspace_teams_router
# Sprint Planning
from aexy.api.sprints import router as sprints_router
from aexy.api.sprint_tasks import router as sprint_tasks_router
from aexy.api.sprint_analytics import router as sprint_analytics_router
from aexy.api.retrospectives import router as retrospectives_router
from aexy.api.project_tasks import router as project_tasks_router
# Task Configuration
from aexy.api.task_config import router as task_config_router
# External Integrations
from aexy.api.integrations import router as integrations_router
from aexy.api.integrations import webhook_router as integration_webhooks_router
# Epics
from aexy.api.epics import router as epics_router
# Reviews & Goals
from aexy.api.reviews import router as reviews_router
# Notifications
from aexy.api.notifications import router as notifications_router
# On-Call Scheduling
from aexy.api.oncall import router as oncall_router
from aexy.api.google_calendar import router as google_calendar_router
# Documentation
from aexy.api.documents import router as documents_router
from aexy.api.documents import template_router as templates_router
from aexy.api.collaboration import router as collaboration_router
from aexy.api.document_spaces import router as document_spaces_router
# Tracking
from aexy.api.tracking import router as tracking_router
# Ticketing
from aexy.api.ticket_forms import router as ticket_forms_router
from aexy.api.tickets import router as tickets_router
from aexy.api.public_forms import router as public_forms_router
from aexy.api.escalation import router as escalation_router
from aexy.api.escalation import escalation_ticket_router
# Assessment Platform
from aexy.api.assessments import router as assessments_router
from aexy.api.assessment_take import router as assessment_take_router
# CRM
from aexy.api.crm import router as crm_router
from aexy.api.crm_automation import router as crm_automation_router
# Visual Workflow Builder
from aexy.api.workflows import router as workflows_router
from aexy.api.workflows import workflows_router as workflows_list_router
from aexy.api.workflows import templates_router as workflow_templates_router
# Workflow Events (webhooks for event-based waits)
from aexy.api.workflow_events import router as workflow_events_router
# Google Integration (Gmail & Calendar sync for CRM)
from aexy.api.google_integration import router as google_integration_router
# AI Agents
from aexy.api.agents import router as agents_router
from aexy.api.agents import writing_style_router

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
api_router.include_router(learning_activities_router, tags=["learning-activities"])
api_router.include_router(gamification_router, tags=["gamification"])
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
api_router.include_router(project_tasks_router, tags=["project-tasks"])
# Task Configuration
api_router.include_router(task_config_router, tags=["task-config"])
# External Integrations
api_router.include_router(integrations_router, tags=["integrations"])
api_router.include_router(integration_webhooks_router, tags=["integration-webhooks"])
# Epics
api_router.include_router(epics_router, tags=["epics"])
# Reviews & Goals
api_router.include_router(reviews_router, tags=["reviews"])
# Notifications
api_router.include_router(notifications_router, tags=["notifications"])
# On-Call Scheduling
api_router.include_router(oncall_router, tags=["oncall"])
api_router.include_router(google_calendar_router, tags=["google-calendar"])
# Documentation
api_router.include_router(documents_router, tags=["documents"])
api_router.include_router(templates_router, tags=["templates"])
api_router.include_router(collaboration_router, tags=["collaboration"])
api_router.include_router(document_spaces_router, tags=["document-spaces"])
# Tracking
api_router.include_router(tracking_router, tags=["tracking"])
# Ticketing
api_router.include_router(ticket_forms_router, tags=["ticket-forms"])
api_router.include_router(tickets_router, tags=["tickets"])
api_router.include_router(public_forms_router, tags=["public-forms"])
api_router.include_router(escalation_router, tags=["escalation"])
api_router.include_router(escalation_ticket_router, tags=["escalation"])
# Assessment Platform
api_router.include_router(assessments_router, tags=["assessments"])
api_router.include_router(assessment_take_router, tags=["assessment-take"])
# CRM
api_router.include_router(crm_router, tags=["crm"])
api_router.include_router(crm_automation_router, tags=["crm-automation"])
# Visual Workflow Builder
api_router.include_router(workflows_router, tags=["workflows"])
api_router.include_router(workflows_list_router, tags=["workflows"])
api_router.include_router(workflow_templates_router, tags=["workflow-templates"])
# Workflow Events (webhooks for event-based waits)
api_router.include_router(workflow_events_router, tags=["workflow-events"])
# Google Integration (Gmail & Calendar for CRM)
api_router.include_router(google_integration_router, tags=["google-integration"])
# AI Agents
api_router.include_router(agents_router, tags=["agents"])
api_router.include_router(writing_style_router, tags=["writing-style"])
