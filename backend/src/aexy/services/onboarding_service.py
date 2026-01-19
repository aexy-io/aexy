"""Service for managing user onboarding flows and milestones."""

import logging
from datetime import datetime, timezone, timedelta
from uuid import uuid4

from sqlalchemy import select, and_, func
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.email_marketing import (
    OnboardingFlow,
    OnboardingProgress,
    OnboardingMilestone,
    UserMilestoneAchievement,
    OnboardingStatus,
    EmailCampaign,
)
from aexy.models.crm import CRMAutomationTriggerType

logger = logging.getLogger(__name__)


# Default onboarding step types
STEP_TYPES = {
    "email": "Send an email",
    "wait": "Wait for a condition",
    "milestone": "Wait for milestone",
    "action": "Trigger an action",
}


class OnboardingService:
    """Service for managing user onboarding flows."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # =========================================================================
    # FLOW MANAGEMENT
    # =========================================================================

    async def create_flow(
        self,
        workspace_id: str,
        name: str,
        slug: str | None = None,
        description: str | None = None,
        steps: list[dict] | None = None,
        auto_start: bool = True,
        delay_between_steps: int = 86400,
    ) -> OnboardingFlow:
        """Create a new onboarding flow."""
        if not slug:
            slug = self._generate_slug(name)

        # Ensure unique slug
        existing = await self.db.execute(
            select(OnboardingFlow)
            .where(OnboardingFlow.workspace_id == workspace_id)
            .where(OnboardingFlow.slug == slug)
        )
        if existing.scalar_one_or_none():
            slug = f"{slug}-{str(uuid4())[:8]}"

        flow = OnboardingFlow(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            description=description,
            steps=steps or [],
            auto_start=auto_start,
            delay_between_steps=delay_between_steps,
        )
        self.db.add(flow)
        await self.db.commit()
        await self.db.refresh(flow)

        return flow

    async def get_flow(
        self,
        flow_id: str,
        workspace_id: str | None = None,
    ) -> OnboardingFlow | None:
        """Get an onboarding flow by ID."""
        query = select(OnboardingFlow).where(OnboardingFlow.id == flow_id)
        if workspace_id:
            query = query.where(OnboardingFlow.workspace_id == workspace_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_flow_by_slug(
        self,
        workspace_id: str,
        slug: str,
    ) -> OnboardingFlow | None:
        """Get an onboarding flow by slug."""
        result = await self.db.execute(
            select(OnboardingFlow)
            .where(OnboardingFlow.workspace_id == workspace_id)
            .where(OnboardingFlow.slug == slug)
        )
        return result.scalar_one_or_none()

    async def list_flows(
        self,
        workspace_id: str,
        is_active: bool | None = None,
    ) -> list[OnboardingFlow]:
        """List all onboarding flows for a workspace."""
        query = (
            select(OnboardingFlow)
            .where(OnboardingFlow.workspace_id == workspace_id)
            .order_by(OnboardingFlow.created_at.desc())
        )

        if is_active is not None:
            query = query.where(OnboardingFlow.is_active == is_active)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_flow(
        self,
        flow_id: str,
        workspace_id: str,
        **updates,
    ) -> OnboardingFlow | None:
        """Update an onboarding flow."""
        flow = await self.get_flow(flow_id, workspace_id)
        if not flow:
            return None

        for key, value in updates.items():
            if hasattr(flow, key) and value is not None:
                setattr(flow, key, value)

        await self.db.commit()
        await self.db.refresh(flow)
        return flow

    async def delete_flow(
        self,
        flow_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete an onboarding flow."""
        flow = await self.get_flow(flow_id, workspace_id)
        if not flow:
            return False

        await self.db.delete(flow)
        await self.db.commit()
        return True

    # =========================================================================
    # PROGRESS TRACKING
    # =========================================================================

    async def start_onboarding(
        self,
        flow_id: str,
        user_id: str,
        record_id: str | None = None,
    ) -> OnboardingProgress:
        """Start onboarding for a user."""
        # Check if already exists
        existing = await self.db.execute(
            select(OnboardingProgress)
            .where(OnboardingProgress.flow_id == flow_id)
            .where(OnboardingProgress.user_id == user_id)
        )
        progress = existing.scalar_one_or_none()

        if progress:
            # Reset if not completed
            if progress.status != OnboardingStatus.COMPLETED.value:
                progress.status = OnboardingStatus.IN_PROGRESS.value
                progress.current_step = 0
                progress.completed_steps = []
                progress.started_at = datetime.now(timezone.utc)
                await self.db.commit()
            return progress

        # Get flow for step scheduling
        flow = await self.get_flow(flow_id)
        if not flow:
            raise ValueError(f"Flow {flow_id} not found")

        now = datetime.now(timezone.utc)

        progress = OnboardingProgress(
            id=str(uuid4()),
            flow_id=flow_id,
            user_id=user_id,
            record_id=record_id,
            status=OnboardingStatus.IN_PROGRESS.value,
            current_step=0,
            completed_steps=[],
            started_at=now,
            next_step_scheduled=now,  # Start immediately
        )
        self.db.add(progress)
        await self.db.commit()
        await self.db.refresh(progress)

        logger.info(f"Started onboarding flow {flow_id} for user {user_id}")

        # Emit trigger event
        await self._emit_trigger_event(
            workspace_id=flow.workspace_id,
            event_type="user.onboarding_started",
            user_id=user_id,
            context={"flow_id": flow_id, "flow_slug": flow.slug},
        )

        return progress

    async def get_user_progress(
        self,
        flow_id: str,
        user_id: str,
    ) -> OnboardingProgress | None:
        """Get a user's progress for a specific flow."""
        result = await self.db.execute(
            select(OnboardingProgress)
            .where(OnboardingProgress.flow_id == flow_id)
            .where(OnboardingProgress.user_id == user_id)
            .options(selectinload(OnboardingProgress.flow))
        )
        return result.scalar_one_or_none()

    async def complete_step(
        self,
        progress_id: str,
        step_id: str | None = None,
    ) -> OnboardingProgress | None:
        """Mark the current step as complete and advance."""
        result = await self.db.execute(
            select(OnboardingProgress)
            .where(OnboardingProgress.id == progress_id)
            .options(selectinload(OnboardingProgress.flow))
        )
        progress = result.scalar_one_or_none()

        if not progress:
            return None

        flow = progress.flow
        steps = flow.steps or []

        now = datetime.now(timezone.utc)

        # Mark current step complete
        current_step_id = step_id or f"step_{progress.current_step}"
        if current_step_id not in progress.completed_steps:
            completed = list(progress.completed_steps)
            completed.append(current_step_id)
            progress.completed_steps = completed

        progress.last_step_at = now

        # Advance to next step
        progress.current_step += 1

        # Check if flow is complete
        if progress.current_step >= len(steps):
            progress.status = OnboardingStatus.COMPLETED.value
            progress.completed_at = now
            progress.next_step_scheduled = None

            logger.info(f"User {progress.user_id} completed onboarding flow {flow.id}")

            # Emit completion event
            await self._emit_trigger_event(
                workspace_id=flow.workspace_id,
                event_type="user.onboarding_completed",
                user_id=progress.user_id,
                context={"flow_id": flow.id, "flow_slug": flow.slug},
            )
        else:
            # Schedule next step
            delay = flow.delay_between_steps
            if len(steps) > progress.current_step:
                step = steps[progress.current_step]
                delay = step.get("delay", delay)

            progress.next_step_scheduled = now + timedelta(seconds=delay)

        await self.db.commit()
        await self.db.refresh(progress)

        return progress

    async def skip_onboarding(
        self,
        flow_id: str,
        user_id: str,
    ) -> OnboardingProgress | None:
        """Skip/opt-out of onboarding."""
        progress = await self.get_user_progress(flow_id, user_id)
        if not progress:
            return None

        progress.status = OnboardingStatus.SKIPPED.value
        progress.next_step_scheduled = None

        await self.db.commit()
        await self.db.refresh(progress)

        logger.info(f"User {user_id} skipped onboarding flow {flow_id}")
        return progress

    async def get_due_onboarding_steps(
        self,
        workspace_id: str | None = None,
        limit: int = 100,
    ) -> list[OnboardingProgress]:
        """Get onboarding steps that are due to be processed."""
        now = datetime.now(timezone.utc)

        query = (
            select(OnboardingProgress)
            .join(OnboardingFlow)
            .where(OnboardingProgress.status == OnboardingStatus.IN_PROGRESS.value)
            .where(OnboardingProgress.next_step_scheduled <= now)
            .where(OnboardingFlow.is_active == True)
            .options(selectinload(OnboardingProgress.flow))
            .limit(limit)
        )

        if workspace_id:
            query = query.where(OnboardingFlow.workspace_id == workspace_id)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    # =========================================================================
    # MILESTONE MANAGEMENT
    # =========================================================================

    async def create_milestone(
        self,
        workspace_id: str,
        name: str,
        trigger_event: str,
        slug: str | None = None,
        description: str | None = None,
        trigger_conditions: dict | None = None,
        campaign_id: str | None = None,
    ) -> OnboardingMilestone:
        """Create a new milestone."""
        if not slug:
            slug = self._generate_slug(name)

        milestone = OnboardingMilestone(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=name,
            slug=slug,
            description=description,
            trigger_event=trigger_event,
            trigger_conditions=trigger_conditions,
            campaign_id=campaign_id,
        )
        self.db.add(milestone)
        await self.db.commit()
        await self.db.refresh(milestone)

        return milestone

    async def get_milestone(
        self,
        milestone_id: str,
        workspace_id: str | None = None,
    ) -> OnboardingMilestone | None:
        """Get a milestone by ID."""
        query = select(OnboardingMilestone).where(OnboardingMilestone.id == milestone_id)
        if workspace_id:
            query = query.where(OnboardingMilestone.workspace_id == workspace_id)

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_milestones(
        self,
        workspace_id: str,
        is_active: bool | None = None,
    ) -> list[OnboardingMilestone]:
        """List all milestones for a workspace."""
        query = (
            select(OnboardingMilestone)
            .where(OnboardingMilestone.workspace_id == workspace_id)
            .order_by(OnboardingMilestone.created_at.desc())
        )

        if is_active is not None:
            query = query.where(OnboardingMilestone.is_active == is_active)

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def check_and_achieve_milestone(
        self,
        workspace_id: str,
        user_id: str,
        event_type: str,
        context: dict | None = None,
    ) -> list[UserMilestoneAchievement]:
        """Check if any milestones are triggered by an event."""
        # Find matching milestones
        milestones = await self.db.execute(
            select(OnboardingMilestone)
            .where(OnboardingMilestone.workspace_id == workspace_id)
            .where(OnboardingMilestone.trigger_event == event_type)
            .where(OnboardingMilestone.is_active == True)
        )
        milestones = list(milestones.scalars().all())

        achievements = []
        for milestone in milestones:
            # Check if already achieved
            existing = await self.db.execute(
                select(UserMilestoneAchievement)
                .where(UserMilestoneAchievement.milestone_id == milestone.id)
                .where(UserMilestoneAchievement.user_id == user_id)
            )
            if existing.scalar_one_or_none():
                continue

            # Check additional conditions if any
            if milestone.trigger_conditions:
                if not self._check_conditions(milestone.trigger_conditions, context):
                    continue

            # Create achievement
            achievement = UserMilestoneAchievement(
                id=str(uuid4()),
                milestone_id=milestone.id,
                user_id=user_id,
                context=context,
            )
            self.db.add(achievement)
            achievements.append(achievement)

            logger.info(f"User {user_id} achieved milestone: {milestone.name}")

            # Trigger associated campaign if configured
            if milestone.campaign_id:
                await self._trigger_milestone_campaign(
                    milestone=milestone,
                    user_id=user_id,
                    context=context,
                )

            # Emit milestone event for workflow triggers
            await self._emit_trigger_event(
                workspace_id=workspace_id,
                event_type=CRMAutomationTriggerType.USER_MILESTONE_REACHED.value,
                user_id=user_id,
                context={
                    "milestone_id": milestone.id,
                    "milestone_slug": milestone.slug,
                    "milestone_name": milestone.name,
                    **(context or {}),
                },
            )

        if achievements:
            await self.db.commit()

        return achievements

    async def get_user_achievements(
        self,
        user_id: str,
        workspace_id: str | None = None,
    ) -> list[UserMilestoneAchievement]:
        """Get all achievements for a user."""
        query = (
            select(UserMilestoneAchievement)
            .where(UserMilestoneAchievement.user_id == user_id)
            .options(selectinload(UserMilestoneAchievement.milestone))
            .order_by(UserMilestoneAchievement.achieved_at.desc())
        )

        if workspace_id:
            query = query.join(OnboardingMilestone).where(
                OnboardingMilestone.workspace_id == workspace_id
            )

        result = await self.db.execute(query)
        return list(result.scalars().all())

    # =========================================================================
    # EVENT HANDLING
    # =========================================================================

    async def handle_user_event(
        self,
        workspace_id: str,
        user_id: str,
        event_type: str,
        context: dict | None = None,
    ) -> dict:
        """
        Handle a user event that may trigger onboarding actions or milestones.

        Standard events:
        - user.first_login
        - user.profile_completed
        - user.integration_connected
        - user.feature_used

        Returns:
            Dict with triggered actions
        """
        results = {
            "milestones_achieved": [],
            "onboarding_started": [],
            "workflows_triggered": [],
        }

        # Check for milestone achievements
        achievements = await self.check_and_achieve_milestone(
            workspace_id=workspace_id,
            user_id=user_id,
            event_type=event_type,
            context=context,
        )
        results["milestones_achieved"] = [a.milestone_id for a in achievements]

        # Auto-start onboarding flows if this is first login
        if event_type == CRMAutomationTriggerType.USER_FIRST_LOGIN.value:
            flows = await self.list_flows(workspace_id, is_active=True)
            for flow in flows:
                if flow.auto_start:
                    progress = await self.start_onboarding(
                        flow_id=flow.id,
                        user_id=user_id,
                    )
                    results["onboarding_started"].append(flow.id)

        # Emit event for workflow triggers
        await self._emit_trigger_event(
            workspace_id=workspace_id,
            event_type=event_type,
            user_id=user_id,
            context=context,
        )

        return results

    # =========================================================================
    # HELPERS
    # =========================================================================

    def _generate_slug(self, name: str) -> str:
        """Generate slug from name."""
        import re
        slug = name.lower()
        slug = re.sub(r"[^a-z0-9]+", "-", slug)
        slug = slug.strip("-")
        return slug

    def _check_conditions(self, conditions: dict, context: dict | None) -> bool:
        """Check if trigger conditions are met."""
        if not context:
            return False

        for key, expected in conditions.items():
            actual = context.get(key)
            if isinstance(expected, list):
                if actual not in expected:
                    return False
            elif actual != expected:
                return False

        return True

    async def _trigger_milestone_campaign(
        self,
        milestone: OnboardingMilestone,
        user_id: str,
        context: dict | None = None,
    ) -> None:
        """Trigger the campaign associated with a milestone."""
        if not milestone.campaign_id:
            return

        # Get user email
        from aexy.models.developer import Developer
        result = await self.db.execute(
            select(Developer).where(Developer.id == user_id)
        )
        user = result.scalar_one_or_none()
        if not user or not user.email:
            return

        # Queue campaign email
        from aexy.processing.email_marketing_tasks import send_workflow_email
        send_workflow_email.delay(
            workspace_id=milestone.workspace_id,
            to=user.email,
            subject=f"Congratulations on reaching {milestone.name}!",
            body=f"<p>You've achieved: {milestone.name}</p>",
            record_id=None,
        )

        logger.info(f"Triggered milestone campaign for user {user_id}")

    async def _emit_trigger_event(
        self,
        workspace_id: str,
        event_type: str,
        user_id: str,
        context: dict | None = None,
    ) -> None:
        """Emit an event for workflow triggers."""
        # This integrates with the existing workflow system
        try:
            from aexy.services.workflow_service import WorkflowService
            workflow_service = WorkflowService(self.db)

            await workflow_service.trigger_by_event(
                workspace_id=workspace_id,
                event_type=event_type,
                event_data={
                    "user_id": user_id,
                    **(context or {}),
                },
            )
        except Exception as e:
            logger.warning(f"Failed to emit trigger event: {e}")


# =========================================================================
# DEFAULT ONBOARDING TEMPLATES
# =========================================================================

DEFAULT_ONBOARDING_STEPS = [
    {
        "id": "welcome",
        "type": "email",
        "name": "Welcome Email",
        "delay": 0,
        "config": {
            "template_slug": "welcome",
            "subject": "Welcome to {{workspace_name}}!",
        },
    },
    {
        "id": "getting_started",
        "type": "email",
        "name": "Getting Started Guide",
        "delay": 86400,  # 1 day
        "config": {
            "template_slug": "getting-started",
            "subject": "Get started with {{workspace_name}}",
        },
    },
    {
        "id": "feature_highlight",
        "type": "email",
        "name": "Feature Highlight",
        "delay": 259200,  # 3 days
        "config": {
            "template_slug": "feature-highlight",
            "subject": "Did you know? Top features of {{workspace_name}}",
        },
    },
    {
        "id": "check_in",
        "type": "email",
        "name": "Check-in Email",
        "delay": 604800,  # 7 days
        "config": {
            "template_slug": "check-in",
            "subject": "How's it going with {{workspace_name}}?",
        },
    },
]


DEFAULT_MILESTONES = [
    {
        "name": "First Login",
        "slug": "first-login",
        "trigger_event": "user.first_login",
    },
    {
        "name": "Profile Completed",
        "slug": "profile-completed",
        "trigger_event": "user.profile_completed",
    },
    {
        "name": "First Integration",
        "slug": "first-integration",
        "trigger_event": "user.integration_connected",
    },
    {
        "name": "First Project Created",
        "slug": "first-project",
        "trigger_event": "project.created",
    },
    {
        "name": "First Team Member Invited",
        "slug": "first-invite",
        "trigger_event": "team.member_invited",
    },
]
