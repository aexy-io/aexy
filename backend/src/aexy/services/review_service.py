"""Review service for managing performance review cycles and individual reviews."""

import hashlib
import logging
import secrets
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.llm.gateway import LLMGateway
from aexy.models.developer import Developer
from aexy.models.review import (
    ContributionSummary,
    IndividualReview,
    ReviewCycle,
    ReviewRequest,
    ReviewSubmission,
    WorkGoal,
)
from aexy.models.team import Team, TeamMember
from aexy.models.workspace import Workspace
from aexy.services.contribution_service import ContributionService
from aexy.services.notification_service import (
    notify_peer_review_requested,
    notify_peer_review_received,
    notify_manager_review_completed,
    notify_review_cycle_phase_changed,
)

logger = logging.getLogger(__name__)

# LLM prompt for generating review summary
REVIEW_SUMMARY_PROMPT = """Synthesize the following performance review inputs into a cohesive summary:

## Self-Review Highlights
{self_review_summary}

## Peer Feedback (Anonymous)
{peer_feedback_summary}

## Manager Observations
{manager_observations}

## Contribution Metrics
{contribution_metrics}

## Goals Achievement
{goals_summary}

Generate a professional, growth-oriented summary that:
1. Acknowledges key accomplishments with specific examples
2. Identifies 2-3 growth areas with constructive framing
3. Suggests development priorities for the next period
4. Maintains a balanced, objective tone

The summary should be 3-4 paragraphs."""


@dataclass
class ReviewCycleProgress:
    """Review cycle progress statistics."""

    total_reviews: int
    completed: int
    pending_self_review: int
    pending_peer_review: int
    pending_manager_review: int
    acknowledged: int


class ReviewService:
    """Service for managing review cycles and individual reviews."""

    def __init__(
        self,
        db: AsyncSession,
        llm_gateway: LLMGateway | None = None,
        contribution_service: ContributionService | None = None,
    ) -> None:
        """Initialize the review service.

        Args:
            db: Database session.
            llm_gateway: LLM gateway for summary generation.
            contribution_service: Service for contribution aggregation.
        """
        self.db = db
        self.llm_gateway = llm_gateway
        self.contribution_service = contribution_service

    # ============ Review Cycle Management ============

    async def create_review_cycle(
        self,
        workspace_id: str,
        name: str,
        period_start: Any,
        period_end: Any,
        cycle_type: str = "annual",
        self_review_deadline: Any | None = None,
        peer_review_deadline: Any | None = None,
        manager_review_deadline: Any | None = None,
        settings: dict | None = None,
    ) -> ReviewCycle:
        """Create a new review cycle.

        Args:
            workspace_id: Workspace ID.
            name: Cycle name.
            period_start: Start of review period.
            period_end: End of review period.
            cycle_type: Type of cycle.
            self_review_deadline: Deadline for self-reviews.
            peer_review_deadline: Deadline for peer reviews.
            manager_review_deadline: Deadline for manager reviews.
            settings: Cycle configuration settings.

        Returns:
            Created ReviewCycle.
        """
        default_settings = {
            "enable_self_review": True,
            "enable_peer_review": True,
            "enable_manager_review": True,
            "anonymous_peer_reviews": True,
            "min_peer_reviewers": 2,
            "max_peer_reviewers": 5,
            "peer_selection_mode": "both",
            "include_github_metrics": True,
            "review_questions": [],
            "rating_scale": {"min": 1, "max": 5},
        }

        if settings:
            default_settings.update(settings)

        cycle = ReviewCycle(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            cycle_type=cycle_type,
            period_start=period_start,
            period_end=period_end,
            self_review_deadline=self_review_deadline,
            peer_review_deadline=peer_review_deadline,
            manager_review_deadline=manager_review_deadline,
            settings=default_settings,
            status="draft",
        )

        self.db.add(cycle)
        await self.db.flush()

        return cycle

    async def get_review_cycle(self, cycle_id: str) -> ReviewCycle | None:
        """Get a review cycle by ID."""
        return await self.db.get(ReviewCycle, cycle_id)

    async def list_review_cycles(
        self,
        workspace_id: str,
        status: str | None = None,
    ) -> list[ReviewCycle]:
        """List review cycles for a workspace."""
        conditions = [ReviewCycle.workspace_id == workspace_id]
        if status:
            conditions.append(ReviewCycle.status == status)

        stmt = (
            select(ReviewCycle)
            .where(and_(*conditions))
            .order_by(ReviewCycle.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def update_review_cycle(
        self,
        cycle_id: str,
        **updates: Any,
    ) -> ReviewCycle | None:
        """Update a review cycle."""
        cycle = await self.get_review_cycle(cycle_id)
        if not cycle:
            return None

        allowed_fields = {
            "name", "cycle_type", "period_start", "period_end",
            "self_review_deadline", "peer_review_deadline", "manager_review_deadline",
            "settings", "status",
        }

        for field, value in updates.items():
            if field in allowed_fields and value is not None:
                setattr(cycle, field, value)

        cycle.updated_at = datetime.utcnow()
        await self.db.flush()

        return cycle

    async def activate_review_cycle(self, cycle_id: str) -> ReviewCycle | None:
        """Activate a review cycle and create individual reviews.

        Args:
            cycle_id: Cycle ID.

        Returns:
            Activated ReviewCycle or None.
        """
        cycle = await self.get_review_cycle(cycle_id)
        if not cycle or cycle.status != "draft":
            return None

        # Create individual reviews for all workspace developers
        await self._create_individual_reviews_for_cycle(cycle)

        cycle.status = "active"
        cycle.updated_at = datetime.utcnow()
        await self.db.flush()

        return cycle

    async def advance_cycle_phase(self, cycle_id: str) -> str | None:
        """Advance the review cycle to the next phase.

        Args:
            cycle_id: Cycle ID.

        Returns:
            New status or None if invalid.
        """
        cycle = await self.get_review_cycle(cycle_id)
        if not cycle:
            return None

        phase_order = [
            "draft", "active", "self_review", "peer_review",
            "manager_review", "completed"
        ]

        current_idx = phase_order.index(cycle.status)
        if current_idx < len(phase_order) - 1:
            new_status = phase_order[current_idx + 1]
            cycle.status = new_status
            cycle.updated_at = datetime.utcnow()
            await self.db.flush()

            # Notify all developers in the cycle about the phase change
            try:
                # Get all developers in this cycle
                review_stmt = select(IndividualReview.developer_id).where(
                    IndividualReview.review_cycle_id == cycle_id
                )
                result = await self.db.execute(review_stmt)
                developer_ids = [row[0] for row in result.fetchall()]

                if developer_ids:
                    await notify_review_cycle_phase_changed(
                        db=self.db,
                        recipient_ids=developer_ids,
                        cycle_id=cycle_id,
                        cycle_name=cycle.name,
                        new_phase=new_status,
                    )
            except Exception as e:
                logger.warning(f"Failed to send cycle phase change notifications: {e}")

        return cycle.status

    async def get_cycle_progress(self, cycle_id: str) -> ReviewCycleProgress:
        """Get progress statistics for a review cycle."""
        stmt = select(IndividualReview).where(
            IndividualReview.review_cycle_id == cycle_id
        )
        result = await self.db.execute(stmt)
        reviews = list(result.scalars().all())

        return ReviewCycleProgress(
            total_reviews=len(reviews),
            completed=sum(1 for r in reviews if r.status == "completed"),
            pending_self_review=sum(1 for r in reviews if r.status == "pending"),
            pending_peer_review=sum(1 for r in reviews if r.status == "peer_review_in_progress"),
            pending_manager_review=sum(1 for r in reviews if r.status == "manager_review_in_progress"),
            acknowledged=sum(1 for r in reviews if r.status == "acknowledged"),
        )

    # ============ Individual Review Management ============

    async def get_individual_review(
        self,
        review_id: str,
        include_submissions: bool = False,
    ) -> IndividualReview | None:
        """Get an individual review by ID."""
        if include_submissions:
            stmt = (
                select(IndividualReview)
                .options(selectinload(IndividualReview.submissions))
                .where(IndividualReview.id == review_id)
            )
            result = await self.db.execute(stmt)
            return result.scalar_one_or_none()
        return await self.db.get(IndividualReview, review_id)

    async def get_developer_reviews(
        self,
        developer_id: str,
        status: str | None = None,
    ) -> list[IndividualReview]:
        """Get reviews where developer is the reviewee."""
        conditions = [IndividualReview.developer_id == developer_id]
        if status:
            conditions.append(IndividualReview.status == status)

        stmt = (
            select(IndividualReview)
            .where(and_(*conditions))
            .order_by(IndividualReview.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def get_manager_reviews(
        self,
        manager_id: str,
    ) -> list[IndividualReview]:
        """Get reviews where developer is the manager."""
        stmt = (
            select(IndividualReview)
            .where(
                and_(
                    IndividualReview.manager_id == manager_id,
                    IndividualReview.status.in_([
                        "self_review_submitted",
                        "peer_review_in_progress",
                        "manager_review_in_progress",
                    ]),
                )
            )
            .order_by(IndividualReview.created_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def generate_contribution_summary(
        self,
        review_id: str,
    ) -> dict | None:
        """Generate and cache contribution summary for a review.

        Args:
            review_id: Review ID.

        Returns:
            Contribution summary dictionary or None.
        """
        review = await self.get_individual_review(review_id)
        if not review:
            return None

        cycle = await self.get_review_cycle(review.review_cycle_id)
        if not cycle:
            return None

        if self.contribution_service:
            summary = await self.contribution_service.generate_contribution_summary(
                review.developer_id,
                cycle.period_start,
                cycle.period_end,
            )

            review.contribution_summary = summary.metrics
            review.contribution_summary["highlights"] = summary.highlights
            review.contribution_summary["ai_insights"] = summary.ai_insights
            review.updated_at = datetime.utcnow()
            await self.db.flush()

            return review.contribution_summary

        return None

    # ============ Review Submission Management ============

    async def submit_self_review(
        self,
        review_id: str,
        responses: dict,
        linked_goals: list[str] | None = None,
        linked_contributions: list[str] | None = None,
    ) -> ReviewSubmission:
        """Submit a self-review.

        Args:
            review_id: Individual review ID.
            responses: Review responses (COIN framework).
            linked_goals: IDs of linked goals.
            linked_contributions: IDs of linked contributions.

        Returns:
            Created ReviewSubmission.
        """
        review = await self.get_individual_review(review_id)
        if not review:
            raise ValueError("Review not found")

        submission = ReviewSubmission(
            id=str(uuid4()),
            individual_review_id=review_id,
            submission_type="self",
            reviewer_id=review.developer_id,
            is_anonymous=False,
            responses=responses,
            linked_goals=linked_goals or [],
            linked_contributions=linked_contributions or [],
            status="submitted",
            submitted_at=datetime.utcnow(),
        )

        self.db.add(submission)

        review.status = "self_review_submitted"
        review.updated_at = datetime.utcnow()

        await self.db.flush()

        return submission

    async def submit_peer_review(
        self,
        review_id: str,
        reviewer_id: str,
        responses: dict,
        is_anonymous: bool = True,
        linked_goals: list[str] | None = None,
        linked_contributions: list[str] | None = None,
    ) -> ReviewSubmission:
        """Submit a peer review.

        Args:
            review_id: Individual review ID.
            reviewer_id: Reviewer's developer ID.
            responses: Review responses.
            is_anonymous: Whether review is anonymous.
            linked_goals: IDs of linked goals.
            linked_contributions: IDs of linked contributions.

        Returns:
            Created ReviewSubmission.
        """
        review = await self.get_individual_review(review_id)
        if not review:
            raise ValueError("Review not found")

        anonymous_token = None
        if is_anonymous:
            anonymous_token = self._generate_anonymous_token(review_id, reviewer_id)

        submission = ReviewSubmission(
            id=str(uuid4()),
            individual_review_id=review_id,
            submission_type="peer",
            reviewer_id=reviewer_id,
            anonymous_token=anonymous_token,
            is_anonymous=is_anonymous,
            responses=responses,
            linked_goals=linked_goals or [],
            linked_contributions=linked_contributions or [],
            status="submitted",
            submitted_at=datetime.utcnow(),
        )

        self.db.add(submission)
        await self.db.flush()

        # Update any pending request
        request_stmt = select(ReviewRequest).where(
            and_(
                ReviewRequest.individual_review_id == review_id,
                ReviewRequest.reviewer_id == reviewer_id,
                ReviewRequest.status == "accepted",
            )
        )
        request_result = await self.db.execute(request_stmt)
        request = request_result.scalar_one_or_none()
        if request:
            request.status = "completed"
            request.submission_id = submission.id
            request.updated_at = datetime.utcnow()
            await self.db.flush()

        # Notify the reviewee that they received peer feedback
        try:
            await notify_peer_review_received(
                db=self.db,
                developer_id=review.developer_id,
                review_id=review_id,
            )
        except Exception as e:
            logger.warning(f"Failed to send peer review received notification: {e}")

        return submission

    async def submit_manager_review(
        self,
        review_id: str,
        responses: dict,
        overall_rating: float,
        ratings_breakdown: dict | None = None,
        linked_goals: list[str] | None = None,
        linked_contributions: list[str] | None = None,
    ) -> ReviewSubmission:
        """Submit a manager review.

        Args:
            review_id: Individual review ID.
            responses: Review responses.
            overall_rating: Overall rating (1-5).
            ratings_breakdown: Detailed ratings by category.
            linked_goals: IDs of linked goals.
            linked_contributions: IDs of linked contributions.

        Returns:
            Created ReviewSubmission.
        """
        review = await self.get_individual_review(review_id)
        if not review:
            raise ValueError("Review not found")
        if not review.manager_id:
            raise ValueError("No manager assigned")

        submission = ReviewSubmission(
            id=str(uuid4()),
            individual_review_id=review_id,
            submission_type="manager",
            reviewer_id=review.manager_id,
            is_anonymous=False,
            responses=responses,
            linked_goals=linked_goals or [],
            linked_contributions=linked_contributions or [],
            status="submitted",
            submitted_at=datetime.utcnow(),
        )

        self.db.add(submission)

        review.status = "manager_review_in_progress"
        review.overall_rating = overall_rating
        review.ratings_breakdown = ratings_breakdown or {}
        review.updated_at = datetime.utcnow()

        await self.db.flush()

        return submission

    async def finalize_review(
        self,
        review_id: str,
        overall_rating: float,
        ratings_breakdown: dict | None = None,
        generate_ai_summary: bool = True,
    ) -> IndividualReview | None:
        """Finalize a review (manager action).

        Args:
            review_id: Review ID.
            overall_rating: Final overall rating.
            ratings_breakdown: Final ratings by category.
            generate_ai_summary: Whether to generate AI summary.

        Returns:
            Finalized IndividualReview or None.
        """
        review = await self.get_individual_review(review_id, include_submissions=True)
        if not review:
            return None

        review.overall_rating = overall_rating
        review.ratings_breakdown = ratings_breakdown or {}
        review.status = "completed"
        review.completed_at = datetime.utcnow()
        review.updated_at = datetime.utcnow()

        # Generate AI summary if requested
        if generate_ai_summary and self.llm_gateway:
            ai_summary = await self._generate_review_summary(review)
            if ai_summary:
                review.ai_summary = ai_summary

        await self.db.flush()

        # Notify the developer that their review is complete
        try:
            await notify_manager_review_completed(
                db=self.db,
                developer_id=review.developer_id,
                review_id=review_id,
            )
        except Exception as e:
            logger.warning(f"Failed to send manager review completed notification: {e}")

        return review

    async def acknowledge_review(self, review_id: str) -> IndividualReview | None:
        """Employee acknowledges their completed review.

        Args:
            review_id: Review ID.

        Returns:
            Updated IndividualReview or None.
        """
        review = await self.get_individual_review(review_id)
        if not review or review.status != "completed":
            return None

        review.status = "acknowledged"
        review.acknowledged_at = datetime.utcnow()
        review.updated_at = datetime.utcnow()

        await self.db.flush()

        return review

    # ============ Peer Review Request Management ============

    async def request_peer_review(
        self,
        review_id: str,
        requester_id: str,
        reviewer_id: str,
        message: str | None = None,
    ) -> ReviewRequest:
        """Request peer review from a team member.

        Args:
            review_id: Individual review ID.
            requester_id: Requester's developer ID.
            reviewer_id: Reviewer's developer ID.
            message: Optional message.

        Returns:
            Created ReviewRequest.
        """
        request = ReviewRequest(
            id=str(uuid4()),
            individual_review_id=review_id,
            requester_id=requester_id,
            reviewer_id=reviewer_id,
            request_source="employee",
            message=message,
            status="pending",
            requested_at=datetime.utcnow(),
        )

        self.db.add(request)
        await self.db.flush()

        # Send notification to reviewer
        try:
            requester = await self.db.get(Developer, requester_id)
            if requester:
                await notify_peer_review_requested(
                    db=self.db,
                    reviewer_id=reviewer_id,
                    requester_name=requester.name or requester.email,
                    requester_avatar=requester.avatar_url,
                    review_id=review_id,
                    request_id=request.id,
                )
        except Exception as e:
            logger.warning(f"Failed to send peer review request notification: {e}")

        return request

    async def assign_peer_reviewers(
        self,
        review_id: str,
        manager_id: str,
        reviewer_ids: list[str],
        message: str | None = None,
    ) -> list[ReviewRequest]:
        """Manager assigns peer reviewers.

        Args:
            review_id: Individual review ID.
            manager_id: Manager's developer ID.
            reviewer_ids: List of reviewer developer IDs.
            message: Optional message.

        Returns:
            List of created ReviewRequest.
        """
        review = await self.get_individual_review(review_id)
        if not review:
            raise ValueError("Review not found")

        # Get developer info for notifications
        developer = await self.db.get(Developer, review.developer_id)
        requester_name = developer.name or developer.email if developer else "A team member"
        requester_avatar = developer.avatar_url if developer else None

        requests = []
        for reviewer_id in reviewer_ids:
            request = ReviewRequest(
                id=str(uuid4()),
                individual_review_id=review_id,
                requester_id=review.developer_id,
                reviewer_id=reviewer_id,
                request_source="manager",
                assigned_by_id=manager_id,
                message=message,
                status="pending",
                requested_at=datetime.utcnow(),
            )
            self.db.add(request)
            requests.append(request)

        await self.db.flush()

        # Send notifications to all reviewers
        for request in requests:
            try:
                await notify_peer_review_requested(
                    db=self.db,
                    reviewer_id=request.reviewer_id,
                    requester_name=requester_name,
                    requester_avatar=requester_avatar,
                    review_id=review_id,
                    request_id=request.id,
                )
            except Exception as e:
                logger.warning(f"Failed to send peer review request notification: {e}")

        return requests

    async def get_pending_peer_requests(
        self,
        reviewer_id: str,
    ) -> list[ReviewRequest]:
        """Get pending peer review requests for a reviewer."""
        stmt = (
            select(ReviewRequest)
            .where(
                and_(
                    ReviewRequest.reviewer_id == reviewer_id,
                    ReviewRequest.status.in_(["pending", "accepted"]),
                )
            )
            .order_by(ReviewRequest.requested_at.desc())
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def respond_to_peer_request(
        self,
        request_id: str,
        accept: bool,
        decline_reason: str | None = None,
    ) -> ReviewRequest | None:
        """Respond to a peer review request.

        Args:
            request_id: Request ID.
            accept: Whether to accept.
            decline_reason: Reason for declining.

        Returns:
            Updated ReviewRequest or None.
        """
        request = await self.db.get(ReviewRequest, request_id)
        if not request or request.status != "pending":
            return None

        request.status = "accepted" if accept else "declined"
        request.responded_at = datetime.utcnow()
        request.updated_at = datetime.utcnow()

        if not accept and decline_reason:
            request.message = f"{request.message or ''}\nDeclined: {decline_reason}".strip()

        await self.db.flush()

        return request

    async def get_review_by_anonymous_token(
        self,
        token: str,
    ) -> tuple[IndividualReview, ReviewRequest] | None:
        """Get review and request by anonymous token.

        Args:
            token: Anonymous token.

        Returns:
            Tuple of (IndividualReview, ReviewRequest) or None.
        """
        # This would need a more sophisticated lookup
        # For now, return None as placeholder
        return None

    # ============ Helper Methods ============

    async def _create_individual_reviews_for_cycle(
        self,
        cycle: ReviewCycle,
    ) -> list[IndividualReview]:
        """Create individual reviews for all developers in workspace."""
        # Get workspace and its teams
        workspace = await self.db.get(Workspace, cycle.workspace_id)
        if not workspace:
            return []

        # Get all team members
        teams_stmt = (
            select(Team)
            .options(selectinload(Team.members))
            .where(Team.workspace_id == cycle.workspace_id)
        )
        teams_result = await self.db.execute(teams_stmt)
        teams = list(teams_result.scalars().all())

        # Create reviews for each team member
        reviews = []
        processed_developers = set()

        for team in teams:
            # Find team lead
            team_lead_id = None
            for member in team.members:
                if member.role == "lead":
                    team_lead_id = member.developer_id
                    break

            for member in team.members:
                if member.developer_id in processed_developers:
                    continue

                processed_developers.add(member.developer_id)

                # Assign manager (team lead or None)
                manager_id = team_lead_id if member.developer_id != team_lead_id else None

                review = IndividualReview(
                    id=str(uuid4()),
                    review_cycle_id=cycle.id,
                    developer_id=member.developer_id,
                    manager_id=manager_id,
                    manager_source="team_lead" if manager_id else "assigned",
                    status="pending",
                )

                self.db.add(review)
                reviews.append(review)

        await self.db.flush()

        return reviews

    def _generate_anonymous_token(
        self,
        review_id: str,
        reviewer_id: str,
    ) -> str:
        """Generate an anonymous token for peer reviews."""
        # Use cryptographic hash to create untraceable token
        secret = secrets.token_hex(16)
        payload = f"{review_id}:{reviewer_id}:{secret}"
        return hashlib.sha256(payload.encode()).hexdigest()[:32]

    async def _generate_review_summary(
        self,
        review: IndividualReview,
    ) -> str | None:
        """Generate AI summary for a completed review."""
        if not self.llm_gateway:
            return None

        try:
            # Gather all submissions
            self_review = ""
            peer_feedback = ""
            manager_review = ""

            for submission in review.submissions:
                responses = submission.responses or {}
                if submission.submission_type == "self":
                    self_review = responses.get("overall_feedback", "")
                    if responses.get("achievements"):
                        self_review += "\nAchievements: " + ", ".join(
                            a.get("accomplishment", "") for a in responses["achievements"]
                        )
                elif submission.submission_type == "peer":
                    peer_feedback += f"\n- {responses.get('overall_feedback', '')}"
                elif submission.submission_type == "manager":
                    manager_review = responses.get("overall_feedback", "")

            # Format contribution metrics
            contribution_metrics = "Not available"
            if review.contribution_summary:
                cs = review.contribution_summary
                contribution_metrics = f"""
                - Commits: {cs.get('commits', {}).get('total', 0)}
                - PRs Merged: {cs.get('pull_requests', {}).get('merged', 0)}
                - Code Reviews: {cs.get('code_reviews', {}).get('given', 0)}
                """

            # Get goals summary
            goals_stmt = select(WorkGoal).where(
                and_(
                    WorkGoal.developer_id == review.developer_id,
                    WorkGoal.review_cycle_id == review.review_cycle_id,
                )
            )
            goals_result = await self.db.execute(goals_stmt)
            goals = list(goals_result.scalars().all())

            goals_summary = "No goals tracked"
            if goals:
                completed = sum(1 for g in goals if g.status == "completed")
                goals_summary = f"{completed}/{len(goals)} goals completed"

            prompt = REVIEW_SUMMARY_PROMPT.format(
                self_review_summary=self_review or "Not provided",
                peer_feedback_summary=peer_feedback or "Not provided",
                manager_observations=manager_review or "Not provided",
                contribution_metrics=contribution_metrics,
                goals_summary=goals_summary,
            )

            result = await self.llm_gateway.analyze(
                analysis_type="review_summary",
                context=prompt,
                data={},
            )

            return result.get("summary", result.get("content", str(result)))
        except Exception as e:
            logger.error(f"Failed to generate review summary: {e}")
            return None
