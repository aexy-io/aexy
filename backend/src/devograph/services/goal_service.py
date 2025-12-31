"""Goal service for managing SMART work goals."""

import logging
from dataclasses import dataclass
from datetime import date, datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select, func, and_, or_
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.models.activity import Commit, PullRequest
from devograph.models.career import LearningMilestone, LearningPath
from devograph.models.developer import Developer
from devograph.models.review import WorkGoal

logger = logging.getLogger(__name__)


@dataclass
class GoalSuggestion:
    """Goal suggestion from learning path."""

    title: str
    goal_type: str
    suggested_measurable: str
    suggested_keywords: list[str]
    learning_milestone_id: str | None
    skill_name: str | None


@dataclass
class LinkedContribution:
    """Linked GitHub contribution."""

    type: str  # "commit" or "pull_request"
    id: str
    title: str
    additions: int
    deletions: int
    created_at: datetime
    url: str | None


class GoalService:
    """Service for managing work goals with SMART framework."""

    def __init__(
        self,
        db: AsyncSession,
    ) -> None:
        """Initialize the goal service.

        Args:
            db: Database session.
        """
        self.db = db

    async def create_goal(
        self,
        developer_id: str,
        workspace_id: str,
        title: str,
        specific: str,
        measurable: str,
        time_bound: date,
        description: str | None = None,
        achievable: str | None = None,
        relevant: str | None = None,
        goal_type: str = "performance",
        priority: str = "medium",
        is_private: bool = False,
        key_results: list[dict] | None = None,
        tracking_keywords: list[str] | None = None,
        review_cycle_id: str | None = None,
        learning_milestone_id: str | None = None,
        suggested_from_path: bool = False,
    ) -> WorkGoal:
        """Create a new SMART goal.

        Args:
            developer_id: Developer ID.
            workspace_id: Workspace ID.
            title: Goal title.
            specific: What exactly will be accomplished.
            measurable: How success will be measured.
            time_bound: Target completion date.
            description: Optional description.
            achievable: Why this is realistic.
            relevant: How this aligns with broader goals.
            goal_type: Type of goal.
            priority: Priority level.
            is_private: Whether goal is private.
            key_results: OKR-style key results.
            tracking_keywords: Keywords for auto-linking.
            review_cycle_id: Associated review cycle.
            learning_milestone_id: Linked learning milestone.
            suggested_from_path: Whether suggested from learning path.

        Returns:
            Created WorkGoal.
        """
        # Format key results with IDs
        formatted_key_results = []
        if key_results:
            for kr in key_results:
                formatted_key_results.append({
                    "id": str(uuid4()),
                    "description": kr.get("description", ""),
                    "target": kr.get("target", 100),
                    "current": kr.get("current", 0),
                    "unit": kr.get("unit", "%"),
                })

        goal = WorkGoal(
            id=str(uuid4()),
            developer_id=developer_id,
            workspace_id=workspace_id,
            title=title,
            description=description,
            specific=specific,
            measurable=measurable,
            achievable=achievable,
            relevant=relevant,
            time_bound=time_bound,
            goal_type=goal_type,
            priority=priority,
            is_private=is_private,
            key_results=formatted_key_results,
            tracking_keywords=tracking_keywords or [],
            review_cycle_id=review_cycle_id,
            learning_milestone_id=learning_milestone_id,
            suggested_from_path=suggested_from_path,
        )

        self.db.add(goal)
        await self.db.flush()

        return goal

    async def get_goal(self, goal_id: str) -> WorkGoal | None:
        """Get a goal by ID."""
        return await self.db.get(WorkGoal, goal_id)

    async def list_goals(
        self,
        developer_id: str,
        workspace_id: str | None = None,
        status: str | None = None,
        goal_type: str | None = None,
        review_cycle_id: str | None = None,
    ) -> list[WorkGoal]:
        """List goals for a developer.

        Args:
            developer_id: Developer ID.
            workspace_id: Optional workspace filter.
            status: Optional status filter.
            goal_type: Optional type filter.
            review_cycle_id: Optional review cycle filter.

        Returns:
            List of WorkGoal.
        """
        conditions = [WorkGoal.developer_id == developer_id]

        if workspace_id:
            conditions.append(WorkGoal.workspace_id == workspace_id)
        if status:
            conditions.append(WorkGoal.status == status)
        if goal_type:
            conditions.append(WorkGoal.goal_type == goal_type)
        if review_cycle_id:
            conditions.append(WorkGoal.review_cycle_id == review_cycle_id)

        stmt = (
            select(WorkGoal)
            .where(and_(*conditions))
            .order_by(WorkGoal.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_goal(
        self,
        goal_id: str,
        **updates: Any,
    ) -> WorkGoal | None:
        """Update a goal.

        Args:
            goal_id: Goal ID.
            **updates: Fields to update.

        Returns:
            Updated WorkGoal or None.
        """
        goal = await self.get_goal(goal_id)
        if not goal:
            return None

        allowed_fields = {
            "title", "description", "specific", "measurable", "achievable",
            "relevant", "time_bound", "goal_type", "priority", "is_private",
            "tracking_keywords", "status",
        }

        for field, value in updates.items():
            if field in allowed_fields and value is not None:
                setattr(goal, field, value)

        goal.updated_at = datetime.utcnow()
        await self.db.flush()

        return goal

    async def update_progress(
        self,
        goal_id: str,
        progress_percentage: int,
        key_result_updates: list[dict] | None = None,
    ) -> WorkGoal | None:
        """Update goal progress.

        Args:
            goal_id: Goal ID.
            progress_percentage: New progress percentage (0-100).
            key_result_updates: Optional updates to key results.

        Returns:
            Updated WorkGoal or None.
        """
        goal = await self.get_goal(goal_id)
        if not goal:
            return None

        goal.progress_percentage = min(max(progress_percentage, 0), 100)

        # Update key results if provided
        if key_result_updates:
            updated_key_results = goal.key_results.copy()
            for update in key_result_updates:
                kr_id = update.get("id")
                if not kr_id:
                    continue
                for kr in updated_key_results:
                    if kr.get("id") == kr_id:
                        if "current" in update:
                            kr["current"] = update["current"]
                        if "description" in update:
                            kr["description"] = update["description"]
                        if "target" in update:
                            kr["target"] = update["target"]
                        break
            goal.key_results = updated_key_results

        goal.updated_at = datetime.utcnow()

        # Auto-complete if progress is 100%
        if progress_percentage >= 100 and goal.status == "active":
            goal.status = "completed"
            goal.completed_at = datetime.utcnow()

            # Update linked learning milestone if present
            if goal.learning_milestone_id:
                await self._update_linked_milestone(goal.learning_milestone_id)

        await self.db.flush()

        return goal

    async def add_key_result(
        self,
        goal_id: str,
        description: str,
        target: float,
        unit: str = "%",
    ) -> WorkGoal | None:
        """Add a key result to a goal.

        Args:
            goal_id: Goal ID.
            description: Key result description.
            target: Target value.
            unit: Unit of measurement.

        Returns:
            Updated WorkGoal or None.
        """
        goal = await self.get_goal(goal_id)
        if not goal:
            return None

        new_kr = {
            "id": str(uuid4()),
            "description": description,
            "target": target,
            "current": 0,
            "unit": unit,
        }

        key_results = goal.key_results.copy()
        key_results.append(new_kr)
        goal.key_results = key_results
        goal.updated_at = datetime.utcnow()

        await self.db.flush()

        return goal

    async def complete_goal(
        self,
        goal_id: str,
        final_notes: str | None = None,
    ) -> WorkGoal | None:
        """Mark a goal as completed.

        Args:
            goal_id: Goal ID.
            final_notes: Optional completion notes.

        Returns:
            Updated WorkGoal or None.
        """
        goal = await self.get_goal(goal_id)
        if not goal:
            return None

        goal.status = "completed"
        goal.progress_percentage = 100
        goal.completed_at = datetime.utcnow()
        goal.updated_at = datetime.utcnow()

        if final_notes:
            goal.description = f"{goal.description or ''}\n\nCompletion Notes: {final_notes}".strip()

        # Update linked learning milestone
        if goal.learning_milestone_id:
            await self._update_linked_milestone(goal.learning_milestone_id)

        await self.db.flush()

        return goal

    async def auto_link_contributions(
        self,
        goal_id: str,
    ) -> dict[str, list[str]]:
        """Auto-link GitHub activity to a goal based on tracking keywords.

        Args:
            goal_id: Goal ID.

        Returns:
            Dictionary with linked commit SHAs and PR IDs.
        """
        goal = await self.get_goal(goal_id)
        if not goal or not goal.tracking_keywords:
            return {"commits": [], "pull_requests": []}

        # Build search pattern
        keywords = goal.tracking_keywords
        start_date = goal.created_at
        end_date = goal.time_bound

        linked_commits: list[str] = []
        linked_prs: list[str] = []

        # Search commits
        for keyword in keywords:
            commits_stmt = (
                select(Commit)
                .where(
                    and_(
                        Commit.developer_id == goal.developer_id,
                        Commit.committed_at >= start_date,
                        Commit.committed_at <= datetime.combine(end_date, datetime.max.time()),
                        Commit.message.ilike(f"%{keyword}%"),
                    )
                )
            )
            commits_result = await self.db.execute(commits_stmt)
            for commit in commits_result.scalars():
                if commit.sha not in linked_commits:
                    linked_commits.append(commit.sha)

        # Search PRs
        for keyword in keywords:
            prs_stmt = (
                select(PullRequest)
                .where(
                    and_(
                        PullRequest.developer_id == goal.developer_id,
                        PullRequest.created_at >= start_date,
                        PullRequest.created_at <= datetime.combine(end_date, datetime.max.time()),
                        or_(
                            PullRequest.title.ilike(f"%{keyword}%"),
                            PullRequest.body.ilike(f"%{keyword}%"),
                        ),
                    )
                )
            )
            prs_result = await self.db.execute(prs_stmt)
            for pr in prs_result.scalars():
                pr_id = str(pr.id)
                if pr_id not in linked_prs:
                    linked_prs.append(pr_id)

        # Update goal with linked activity
        goal.linked_activity = {
            "commits": linked_commits,
            "pull_requests": linked_prs,
            "auto_linked_at": datetime.utcnow().isoformat(),
        }
        goal.updated_at = datetime.utcnow()

        await self.db.flush()

        return {"commits": linked_commits, "pull_requests": linked_prs}

    async def get_linked_contributions(
        self,
        goal_id: str,
    ) -> list[LinkedContribution]:
        """Get linked contributions for a goal.

        Args:
            goal_id: Goal ID.

        Returns:
            List of LinkedContribution.
        """
        goal = await self.get_goal(goal_id)
        if not goal:
            return []

        contributions = []
        linked = goal.linked_activity or {}

        # Get linked commits
        commit_shas = linked.get("commits", [])
        if commit_shas:
            commits_stmt = select(Commit).where(Commit.sha.in_(commit_shas))
            commits_result = await self.db.execute(commits_stmt)
            for commit in commits_result.scalars():
                contributions.append(LinkedContribution(
                    type="commit",
                    id=commit.sha,
                    title=commit.message[:100] if commit.message else "",
                    additions=commit.additions or 0,
                    deletions=commit.deletions or 0,
                    created_at=commit.committed_at,
                    url=None,
                ))

        # Get linked PRs
        pr_ids = linked.get("pull_requests", [])
        if pr_ids:
            prs_stmt = select(PullRequest).where(PullRequest.id.in_(pr_ids))
            prs_result = await self.db.execute(prs_stmt)
            for pr in prs_result.scalars():
                contributions.append(LinkedContribution(
                    type="pull_request",
                    id=str(pr.id),
                    title=pr.title or "",
                    additions=pr.additions or 0,
                    deletions=pr.deletions or 0,
                    created_at=pr.created_at,
                    url=pr.html_url,
                ))

        return sorted(contributions, key=lambda c: c.created_at, reverse=True)

    async def suggest_goals_from_learning_path(
        self,
        developer_id: str,
    ) -> list[GoalSuggestion]:
        """Suggest work goals from active learning path.

        Args:
            developer_id: Developer ID.

        Returns:
            List of GoalSuggestion.
        """
        # Get active learning path
        path_stmt = (
            select(LearningPath)
            .where(
                and_(
                    LearningPath.developer_id == developer_id,
                    LearningPath.status == "active",
                )
            )
        )
        path_result = await self.db.execute(path_stmt)
        path = path_result.scalar_one_or_none()

        if not path:
            return []

        # Get milestones in progress
        milestones_stmt = (
            select(LearningMilestone)
            .where(
                and_(
                    LearningMilestone.learning_path_id == path.id,
                    LearningMilestone.status.in_(["not_started", "in_progress"]),
                )
            )
            .order_by(LearningMilestone.sequence)
            .limit(3)
        )
        milestones_result = await self.db.execute(milestones_stmt)

        suggestions = []
        for milestone in milestones_result.scalars():
            skill_keyword = milestone.skill_name.lower().replace(" ", "-")
            suggestions.append(GoalSuggestion(
                title=f"Apply {milestone.skill_name} in production project",
                goal_type="skill_development",
                suggested_measurable=f"Complete 3 PRs primarily using {milestone.skill_name}",
                suggested_keywords=[skill_keyword, milestone.skill_name.lower()],
                learning_milestone_id=str(milestone.id),
                skill_name=milestone.skill_name,
            ))

        return suggestions

    async def calculate_goal_achievement_rate(
        self,
        developer_id: str,
        period_start: date,
        period_end: date,
    ) -> dict[str, Any]:
        """Calculate goal completion statistics for a period.

        Args:
            developer_id: Developer ID.
            period_start: Start of period.
            period_end: End of period.

        Returns:
            Dictionary with achievement statistics.
        """
        start_dt = datetime.combine(period_start, datetime.min.time())
        end_dt = datetime.combine(period_end, datetime.max.time())

        # Get goals in period
        stmt = select(WorkGoal).where(
            and_(
                WorkGoal.developer_id == developer_id,
                WorkGoal.created_at >= start_dt,
                WorkGoal.created_at <= end_dt,
            )
        )
        result = await self.db.execute(stmt)
        goals = list(result.scalars().all())

        total = len(goals)
        completed = sum(1 for g in goals if g.status == "completed")
        in_progress = sum(1 for g in goals if g.status == "active")
        cancelled = sum(1 for g in goals if g.status == "cancelled")
        deferred = sum(1 for g in goals if g.status == "deferred")

        avg_progress = 0
        if total > 0:
            avg_progress = sum(g.progress_percentage for g in goals) / total

        return {
            "total_goals": total,
            "completed": completed,
            "in_progress": in_progress,
            "cancelled": cancelled,
            "deferred": deferred,
            "completion_rate": round(completed / total * 100, 1) if total > 0 else 0,
            "average_progress": round(avg_progress, 1),
            "by_type": self._count_by_type(goals),
            "by_priority": self._count_by_priority(goals),
        }

    async def _update_linked_milestone(self, milestone_id: str) -> None:
        """Update linked learning milestone when goal is completed."""
        milestone = await self.db.get(LearningMilestone, milestone_id)
        if milestone and milestone.status != "completed":
            milestone.status = "completed"
            milestone.completed_date = date.today()
            milestone.current_score = milestone.target_score
            await self.db.flush()

    def _count_by_type(self, goals: list[WorkGoal]) -> dict[str, int]:
        """Count goals by type."""
        counts: dict[str, int] = {}
        for goal in goals:
            counts[goal.goal_type] = counts.get(goal.goal_type, 0) + 1
        return counts

    def _count_by_priority(self, goals: list[WorkGoal]) -> dict[str, int]:
        """Count goals by priority."""
        counts: dict[str, int] = {}
        for goal in goals:
            counts[goal.priority] = counts.get(goal.priority, 0) + 1
        return counts
