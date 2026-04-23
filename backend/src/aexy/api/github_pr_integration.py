"""GitHub PR Integration API Endpoints.

Provides endpoints for:
- Manual PR to task linking
- AI-powered auto-tagging
- Issue creation from PR content
- PR analysis results

Author: Claude Sonnet 4.6
Date: 2026-04-23
"""

import logging
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, and_, or_
from sqlalchemy.dialects.postgresql import JSONB

from aexy.core.database import get_db
from aexy.api.developers import get_current_developer
from aexy.models.developer import Developer
from aexy.models.activity import PullRequest, PRAgentInteraction
from aexy.models.sprint import SprintTask
from aexy.agents.prebuilt.github_pr_agent import GitHubPRAgent
from aexy.services.github_service import GitHubService
from aexy.services.workspace_service import WorkspaceService

if TYPE_CHECKING:
    from aexy.core.database import AsyncSession

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/github/prs", tags=["GitHub PR Integration"])


@router.post("/{pr_id}/link", status_code=status.HTTP_201_CREATED)
async def link_pr_to_issue(
    pr_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Manually link a PR to an existing task.

    Args:
        pr_id: PullRequest ID
        data: { task_id: str, link_type: "manual" | "auto" }

    Returns:
        Created PRAgentInteraction record
    """
    try:
        # Fetch PR
        result = await db.execute(
            select(PullRequest).where(PullRequest.id == pr_id)
        )
        pr = result.scalar_one_or_none()
        if not pr:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"PR {pr_id} not found"
            )

        # Get task_id from request
        task_id = data.get("task_id")
        if not task_id:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="task_id is required"
            )

        # Get link_type
        link_type = data.get("link_type", "manual")

        # Check if task exists
        task_result = await db.execute(
            select(SprintTask).where(SprintTask.id == task_id)
        )
        task = task_result.scalar_one_or_none()
        if not task:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"Task {task_id} not found"
            )

        # Check user permissions
        workspace_service = WorkspaceService(db)
        if not await workspace_service.check_permission(
            pr.workspace_id,
            str(current_user.id),
            "admin"
        ):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="Admin permission required to link PRs"
            )

        # Update PR with link information
        pr.link_status = "linked"
        pr.issue_number = None
        pr.issue_url = None
        pr.linked_at = datetime.now(tz=timezone.utc)

        # Create agent interaction record
        interaction = PRAgentInteraction(
            pr_id=pr.id,
            agent_action="link_task",
            agent_decision=f"Manually linked PR to task {task_id}",
            confidence_score=1.0,
            requires_approval=False
        )

        db.add(interaction)

        logger.info(
            f"User {current_user.email} manually linked PR #{pr.number} to task {task_id}"
        )

        await db.commit()

        return {
            "success": True,
            "message": "PR linked to task successfully",
            "interaction_id": str(interaction.id)
        }


@router.post("/{pr_id}/auto-tag", status_code=status.HTTP_200_OK)
async def trigger_auto_tag(
    pr_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Trigger AI auto-tagging for a PR.

    Args:
        pr_id: PullRequest ID
        data: { force: bool, options: dict }

    Returns:
        PRAgentInteraction record with agent decision
    """
    try:
        # Fetch PR
        result = await db.execute(
            select(PullRequest).where(PullRequest.id == pr_id)
        )
        pr = result.scalar_one_or_none()
        if not pr:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"PR {pr_id} not found"
            )

        # Check permissions (can auto-tag in paid plans, manual trigger for free)
        workspace_service = WorkspaceService(db)
        has_permission = await workspace_service.check_permission(
            pr.workspace_id,
            str(current_user.id),
            "admin"
        )

        # Get options
        force = data.get("force", False)
        options = data.get("options", {})

        # Prepare agent context for GitHub PR agent
        agent_context = {
            "pr_data": {
                "pr_id": str(pr.id),
                "number": pr.number,
                "title": pr.title,
                "description": pr.description,
                "repository": pr.repository,
                "additions": pr.additions,
                "deletions": pr.deletions,
                "files_changed": pr.files_changed,
                "commits_count": pr.commits_count,
                "comments_count": pr.review_comments_count,
            },
            "db": db,
            "workspace_id": pr.workspace_id,
            "user_id": str(current_user.id),
            "user_email": current_user.email,
            "is_paid_user": has_permission,
        }

        # Trigger agent analysis
        # Note: In production, agent would be called via Temporal workflow
        # For now, we'll call it directly
        agent = GitHubPRAgent()

        # Process PR and get decision
        decision = await agent.process_message(agent_context)

        # Apply agent decision
        if decision.action == "tag_pr":
            # Update PR with suggested tags
            suggested_tags = decision.metadata.get("suggested_tags", [])

            # Merge with existing tags and remove duplicates
            existing_tags = pr.ai_tags or []
            all_tags = list(set(existing_tags + suggested_tags))
            pr.ai_tags = all_tags

            # Update AI summary if available
            if decision.draft_response:
                pr.ai_summary = decision.draft_response
                if len(pr.ai_summary) > 2000:
                    pr.ai_summary = pr.ai_summary[:2000] + "..."

            pr.link_status = "auto_linked"

        elif decision.action == AgentAction.CREATE_TASK:
            # This would be handled by separate issue creation endpoint
            pr.link_status = "linked"
            pr.ai_summary = "Issue suggested but not created via this endpoint"

        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Agent action {decision.action} not supported"
            )

        # Create agent interaction record
        interaction = PRAgentInteraction(
            pr_id=pr.id,
            agent_action=decision.action if decision.action in ["link_task", "tag_pr"] else "unknown",
            agent_decision=decision.reasoning,
            confidence_score=decision.confidence,
            requires_approval=decision.requires_approval,
        )

        db.add(interaction)

        await db.commit()

        return {
            "success": True,
            "message": f"PR {'auto-tagged' if decision.action == 'tag_pr' else 'analyzed'} successfully",
            "interaction_id": str(interaction.id),
            "tags_added": decision.metadata.get("suggested_tags", []),
        }


@router.post("/{pr_id}/create-issue", status_code=status.HTTP_201_CREATED)
async def create_issue_from_pr(
    pr_id: str,
    data: dict,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Create new issue from PR content using AI.

    Args:
        pr_id: PullRequest ID
        data: { title_override: str, description_override: str, task_id: string | None }

    Returns:
        Created SprintTask record
    """
    try:
        # Fetch PR
        result = await db.execute(
            select(PullRequest).where(PullRequest.id == pr_id)
        )
        pr = result.scalar_one_or_none()
        if not pr:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"PR {pr_id} not found"
            )

        # Get options
        title_override = data.get("title_override")
        description_override = data.get("description_override")
        target_task_id = data.get("task_id")

        # Prepare agent context for issue creation
        agent_context = {
            "pr_data": {
                "pr_id": str(pr.id),
                "number": pr.number,
                "title": pr.title,
                "description": pr.description,
                "repository": pr.repository,
                "additions": pr.additions,
                "deletions": pr.deletions,
                "files_changed": pr.files_changed,
                "commits_count": pr.commits_count,
                "comments_count": pr.review_comments_count,
                "ai_analysis": pr.ai_analysis,
                "ai_summary": pr.ai_summary,
                "ai_tags": pr.ai_tags,
            },
            "db": db,
            "workspace_id": pr.workspace_id,
            "user_id": str(current_user.id),
            "user_email": current_user.email,
            "title_override": title_override,
            "description_override": description_override,
            "target_task_id": target_task_id,
        }

        # Trigger agent analysis
        agent = GitHubPRAgent()

        # Process PR and get issue creation decision
        decision = await agent.process_message(agent_context)

        if decision.action != AgentAction.CREATE_TASK:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail=f"Agent should return CREATE_TASK action for issue creation"
            )

        # Get suggested issue details from decision
        suggested_title = decision.metadata.get("suggested_title", "")
        draft_response = decision.draft_response

        if not draft_response:
            raise HTTPException(
                status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                detail="Agent failed to generate issue draft"
            )

        # Parse draft response to extract title and description
        issue_title = suggested_title or draft_response.split("Description:")[0].strip()
        issue_description = draft_response

        # Create new task/issue
        # In production, this would integrate with task creation service
        # For now, we'll create a simple task record
        task = SprintTask(
            title=issue_title,
            description=issue_description,
            sprint_id=None,  # Project-level task
            team_id=pr.workspace_id if pr.workspace_id else None,
            workspace_id=pr.workspace_id,
            created_by_id=str(current_user.id),
            status="todo",
            source_type="github_issue",
            source_id=str(pr.github_id),  # PR number as source ID
            source_url=f"https://github.com/{pr.repository}/pull/{pr.number}",
            sync_status="pending",
        )

        db.add(task)
        await db.commit()

        logger.info(
            f"User {current_user.email} created issue from PR #{pr.number}: {issue_title}"
        )

        return {
            "success": True,
            "task_id": str(task.id),
            "title": issue_title,
            "message": f"Issue created successfully from PR #{pr.number}",
        }


@router.get("/{pr_id}/analysis", status_code=status.HTTP_200_OK)
async def get_pr_analysis(
    pr_id: str,
    current_user: Developer = Depends(get_current_developer),
    db: AsyncSession = Depends(get_db),
):
    """Get AI analysis results for a PR.

    Args:
        pr_id: PullRequest ID

    Returns:
        Analysis results including tags, summary, and agent interactions
    """
    try:
        # Fetch PR
        result = await db.execute(
            select(PullRequest).where(PullRequest.id == pr_id)
        )
        pr = result.scalar_one_or_none()
        if not pr:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail=f"PR {pr_id} not found"
            )

        # Get all agent interactions for this PR
        interactions_result = await db.execute(
            select(PRAgentInteraction)
            .where(PRAgentInteraction.pr_id == pr_id)
            .order_by(PRAgentInteraction.created_at.desc())
        )
        interactions = interactions_result.scalars().all()

        return {
            "pr": {
                "id": str(pr.id),
                "number": pr.number,
                "title": pr.title,
                "repository": pr.repository,
                "state": pr.state,
                "additions": pr.additions,
                "deletions": pr.deletions,
                "files_changed": pr.files_changed,
                "commits_count": pr.commits_count,
                "comments_count": pr.review_comments_count,
            },
            "ai_tags": pr.ai_tags or [],
            "ai_summary": pr.ai_summary,
            "ai_analysis": pr.ai_analysis,
            "link_status": pr.link_status,
            "issue_number": pr.issue_number,
            "issue_url": pr.issue_url,
            "linked_at": pr.linked_at.isoformat() if pr.linked_at else None,
            "interactions": [
                {
                    "id": str(interaction.id),
                    "agent_action": interaction.agent_action,
                    "agent_decision": interaction.agent_decision,
                    "confidence_score": interaction.confidence_score,
                    "requires_approval": interaction.requires_approval,
                    "created_at": interaction.created_at.isoformat(),
                }
                for interaction in interactions
            ],
        }

    except Exception as e:
        logger.error(f"Error fetching PR analysis for {pr_id}: {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to fetch PR analysis: {str(e)}"
        )