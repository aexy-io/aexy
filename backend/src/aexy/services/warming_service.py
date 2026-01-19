"""Warming service for managing email domain/IP warming schedules."""

import logging
from datetime import datetime, timezone, timedelta
from uuid import uuid4

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from aexy.models.email_infrastructure import (
    SendingDomain,
    DedicatedIP,
    WarmingSchedule,
    WarmingProgress,
    DomainHealth,
    WarmingStatus,
    DomainStatus,
    DomainHealthStatus,
    WarmingScheduleType,
    CONSERVATIVE_SCHEDULE,
    MODERATE_SCHEDULE,
    AGGRESSIVE_SCHEDULE,
)
from aexy.schemas.email_infrastructure import (
    WarmingScheduleCreate,
    WarmingScheduleUpdate,
    WarmingStep,
)

logger = logging.getLogger(__name__)


# Default warming thresholds
DEFAULT_MAX_BOUNCE_RATE = 0.05  # 5%
DEFAULT_MAX_COMPLAINT_RATE = 0.001  # 0.1%
DEFAULT_MIN_DELIVERY_RATE = 0.90  # 90%


class WarmingService:
    """Service for managing email warming."""

    def __init__(self, db: AsyncSession | Session):
        self.db = db

    # -------------------------------------------------------------------------
    # WARMING SCHEDULE CRUD
    # -------------------------------------------------------------------------

    async def create_schedule(
        self,
        workspace_id: str,
        data: WarmingScheduleCreate,
    ) -> WarmingSchedule:
        """Create a custom warming schedule."""
        schedule = WarmingSchedule(
            id=str(uuid4()),
            workspace_id=workspace_id,
            name=data.name,
            schedule_type=data.schedule_type,
            description=data.description,
            steps=[step.model_dump() for step in data.steps],
            max_bounce_rate=data.max_bounce_rate,
            max_complaint_rate=data.max_complaint_rate,
            min_delivery_rate=data.min_delivery_rate,
            auto_pause_on_threshold=data.auto_pause_on_threshold,
            auto_adjust_volume=data.auto_adjust_volume,
            is_system=False,
        )

        self.db.add(schedule)
        await self.db.commit()
        await self.db.refresh(schedule)

        logger.info(f"Created warming schedule: {schedule.id} ({schedule.name})")
        return schedule

    async def update_schedule(
        self,
        schedule_id: str,
        workspace_id: str,
        data: WarmingScheduleUpdate,
    ) -> WarmingSchedule | None:
        """Update a warming schedule."""
        result = await self.db.execute(
            select(WarmingSchedule).where(
                and_(
                    WarmingSchedule.id == schedule_id,
                    WarmingSchedule.workspace_id == workspace_id,
                    WarmingSchedule.is_system == False,
                )
            )
        )
        schedule = result.scalar_one_or_none()

        if not schedule:
            return None

        update_data = data.model_dump(exclude_unset=True)

        if "steps" in update_data and update_data["steps"]:
            update_data["steps"] = [
                step.model_dump() if isinstance(step, WarmingStep) else step
                for step in update_data["steps"]
            ]

        for key, value in update_data.items():
            setattr(schedule, key, value)

        await self.db.commit()
        await self.db.refresh(schedule)

        return schedule

    async def delete_schedule(
        self,
        schedule_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete a warming schedule."""
        result = await self.db.execute(
            select(WarmingSchedule).where(
                and_(
                    WarmingSchedule.id == schedule_id,
                    WarmingSchedule.workspace_id == workspace_id,
                    WarmingSchedule.is_system == False,
                )
            )
        )
        schedule = result.scalar_one_or_none()

        if not schedule:
            return False

        await self.db.delete(schedule)
        await self.db.commit()

        return True

    async def get_schedule(
        self,
        schedule_id: str,
        workspace_id: str | None = None,
    ) -> WarmingSchedule | None:
        """Get a warming schedule by ID."""
        query = select(WarmingSchedule).where(WarmingSchedule.id == schedule_id)

        # Allow fetching system schedules without workspace_id
        if workspace_id:
            query = query.where(
                (WarmingSchedule.workspace_id == workspace_id) |
                (WarmingSchedule.is_system == True)
            )

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_schedules(
        self,
        workspace_id: str,
    ) -> list[WarmingSchedule]:
        """List all warming schedules including system schedules."""
        result = await self.db.execute(
            select(WarmingSchedule).where(
                (WarmingSchedule.workspace_id == workspace_id) |
                (WarmingSchedule.is_system == True)
            ).order_by(WarmingSchedule.is_system.desc(), WarmingSchedule.name.asc())
        )
        return list(result.scalars().all())

    async def get_or_create_system_schedules(self) -> list[WarmingSchedule]:
        """Ensure system warming schedules exist."""
        schedules = []

        system_schedules = [
            {
                "name": "Conservative (21 days)",
                "schedule_type": WarmingScheduleType.CONSERVATIVE.value,
                "description": "Gradual warming over 21 days. Best for new domains with no reputation.",
                "steps": CONSERVATIVE_SCHEDULE,
            },
            {
                "name": "Moderate (14 days)",
                "schedule_type": WarmingScheduleType.MODERATE.value,
                "description": "Balanced warming over 14 days. Good for domains with some existing reputation.",
                "steps": MODERATE_SCHEDULE,
            },
            {
                "name": "Aggressive (7 days)",
                "schedule_type": WarmingScheduleType.AGGRESSIVE.value,
                "description": "Fast warming over 7 days. Only for domains with established reputation.",
                "steps": AGGRESSIVE_SCHEDULE,
            },
        ]

        for schedule_data in system_schedules:
            result = await self.db.execute(
                select(WarmingSchedule).where(
                    and_(
                        WarmingSchedule.schedule_type == schedule_data["schedule_type"],
                        WarmingSchedule.is_system == True,
                    )
                )
            )
            existing = result.scalar_one_or_none()

            if existing:
                schedules.append(existing)
            else:
                schedule = WarmingSchedule(
                    id=str(uuid4()),
                    workspace_id=None,
                    is_system=True,
                    max_bounce_rate=DEFAULT_MAX_BOUNCE_RATE,
                    max_complaint_rate=DEFAULT_MAX_COMPLAINT_RATE,
                    min_delivery_rate=DEFAULT_MIN_DELIVERY_RATE,
                    auto_pause_on_threshold=True,
                    auto_adjust_volume=True,
                    **schedule_data,
                )
                self.db.add(schedule)
                schedules.append(schedule)

        await self.db.commit()
        return schedules

    # -------------------------------------------------------------------------
    # DOMAIN WARMING
    # -------------------------------------------------------------------------

    async def start_domain_warming(
        self,
        domain_id: str,
        workspace_id: str,
        schedule_id: str | None = None,
        schedule_type: str = "moderate",
    ) -> SendingDomain:
        """Start warming for a domain."""
        result = await self.db.execute(
            select(SendingDomain).where(
                and_(
                    SendingDomain.id == domain_id,
                    SendingDomain.workspace_id == workspace_id,
                )
            )
        )
        domain = result.scalar_one_or_none()

        if not domain:
            raise ValueError("Domain not found")

        if domain.status not in [DomainStatus.VERIFIED.value, DomainStatus.ACTIVE.value]:
            raise ValueError(f"Domain must be verified before warming (current status: {domain.status})")

        # Get or determine schedule
        if schedule_id:
            schedule = await self.get_schedule(schedule_id, workspace_id)
        else:
            # Get system schedule by type
            result = await self.db.execute(
                select(WarmingSchedule).where(
                    and_(
                        WarmingSchedule.schedule_type == schedule_type,
                        WarmingSchedule.is_system == True,
                    )
                )
            )
            schedule = result.scalar_one_or_none()

            if not schedule:
                # Create system schedules if they don't exist
                await self.get_or_create_system_schedules()
                result = await self.db.execute(
                    select(WarmingSchedule).where(
                        and_(
                            WarmingSchedule.schedule_type == schedule_type,
                            WarmingSchedule.is_system == True,
                        )
                    )
                )
                schedule = result.scalar_one_or_none()

        if not schedule:
            raise ValueError("Warming schedule not found")

        # Update domain
        now = datetime.now(timezone.utc)
        domain.warming_status = WarmingStatus.IN_PROGRESS.value
        domain.warming_schedule_id = schedule.id
        domain.warming_started_at = now
        domain.warming_day = 1
        domain.status = DomainStatus.WARMING.value

        # Set initial daily limit from first step
        steps = schedule.steps
        if steps:
            domain.daily_limit = steps[0].get("volume", 50)

        # Create first warming progress entry
        progress = WarmingProgress(
            id=str(uuid4()),
            domain_id=domain.id,
            day_number=1,
            date=now.replace(hour=0, minute=0, second=0, microsecond=0),
            target_volume=domain.daily_limit,
        )
        self.db.add(progress)

        await self.db.commit()
        await self.db.refresh(domain)

        logger.info(f"Started warming for domain {domain.domain} with schedule {schedule.name}")
        return domain

    async def pause_domain_warming(
        self,
        domain_id: str,
        workspace_id: str,
    ) -> SendingDomain:
        """Pause warming for a domain."""
        result = await self.db.execute(
            select(SendingDomain).where(
                and_(
                    SendingDomain.id == domain_id,
                    SendingDomain.workspace_id == workspace_id,
                )
            )
        )
        domain = result.scalar_one_or_none()

        if not domain:
            raise ValueError("Domain not found")

        domain.warming_status = WarmingStatus.PAUSED.value
        domain.status = DomainStatus.PAUSED.value

        await self.db.commit()
        await self.db.refresh(domain)

        logger.info(f"Paused warming for domain {domain.domain}")
        return domain

    async def resume_domain_warming(
        self,
        domain_id: str,
        workspace_id: str,
    ) -> SendingDomain:
        """Resume warming for a domain."""
        result = await self.db.execute(
            select(SendingDomain).where(
                and_(
                    SendingDomain.id == domain_id,
                    SendingDomain.workspace_id == workspace_id,
                )
            )
        )
        domain = result.scalar_one_or_none()

        if not domain:
            raise ValueError("Domain not found")

        if domain.warming_status != WarmingStatus.PAUSED.value:
            raise ValueError("Domain warming is not paused")

        domain.warming_status = WarmingStatus.IN_PROGRESS.value
        domain.status = DomainStatus.WARMING.value

        await self.db.commit()
        await self.db.refresh(domain)

        logger.info(f"Resumed warming for domain {domain.domain}")
        return domain

    async def advance_warming_day(
        self,
        domain_id: str,
    ) -> WarmingProgress | None:
        """
        Advance a domain to the next warming day.

        Called by the daily warming task.
        """
        result = await self.db.execute(
            select(SendingDomain).where(SendingDomain.id == domain_id)
        )
        domain = result.scalar_one_or_none()

        if not domain or domain.warming_status != WarmingStatus.IN_PROGRESS.value:
            return None

        # Get schedule
        schedule = await self.get_schedule(domain.warming_schedule_id)
        if not schedule:
            return None

        steps = schedule.steps
        current_day = domain.warming_day
        next_day = current_day + 1

        # Mark current day as completed
        result = await self.db.execute(
            select(WarmingProgress).where(
                and_(
                    WarmingProgress.domain_id == domain_id,
                    WarmingProgress.day_number == current_day,
                )
            )
        )
        current_progress = result.scalar_one_or_none()

        if current_progress:
            current_progress.completed = True
            current_progress.actual_volume = domain.daily_sent

            # Calculate rates
            if current_progress.sent > 0:
                current_progress.delivery_rate = current_progress.delivered / current_progress.sent
                current_progress.bounce_rate = current_progress.bounced / current_progress.sent
                current_progress.complaint_rate = current_progress.complaints / current_progress.sent

                # Check thresholds
                if (current_progress.bounce_rate > schedule.max_bounce_rate or
                    current_progress.complaint_rate > schedule.max_complaint_rate):
                    current_progress.threshold_exceeded = True

                    if schedule.auto_pause_on_threshold:
                        domain.warming_status = WarmingStatus.PAUSED.value
                        domain.status = DomainStatus.PAUSED.value
                        logger.warning(f"Auto-paused warming for domain {domain.domain} due to thresholds")
                        await self.db.commit()
                        return current_progress

        # Find next step
        next_volume = None
        max_day = max(step.get("day", 0) for step in steps)

        if next_day > max_day:
            # Warming complete
            domain.warming_status = WarmingStatus.COMPLETED.value
            domain.status = DomainStatus.ACTIVE.value
            domain.daily_limit = steps[-1].get("volume", 100000)  # Max volume
            logger.info(f"Warming completed for domain {domain.domain}")
            await self.db.commit()
            return current_progress

        # Find volume for next day (interpolate between steps)
        for i, step in enumerate(steps):
            if step.get("day") >= next_day:
                if i == 0:
                    next_volume = step.get("volume")
                else:
                    # Linear interpolation between steps
                    prev_step = steps[i - 1]
                    prev_day = prev_step.get("day")
                    prev_vol = prev_step.get("volume")
                    curr_day = step.get("day")
                    curr_vol = step.get("volume")

                    if curr_day == prev_day:
                        next_volume = curr_vol
                    else:
                        # Interpolate
                        ratio = (next_day - prev_day) / (curr_day - prev_day)
                        next_volume = int(prev_vol + (curr_vol - prev_vol) * ratio)
                break

        if next_volume is None:
            next_volume = steps[-1].get("volume", 100000)

        # AI-driven adjustment (if enabled)
        if schedule.auto_adjust_volume and current_progress:
            next_volume = self._calculate_adjusted_volume(
                next_volume, current_progress, schedule
            )

        # Update domain
        domain.warming_day = next_day
        domain.daily_limit = next_volume
        domain.daily_sent = 0  # Reset for new day

        # Create new progress entry
        now = datetime.now(timezone.utc)
        new_progress = WarmingProgress(
            id=str(uuid4()),
            domain_id=domain.id,
            day_number=next_day,
            date=now.replace(hour=0, minute=0, second=0, microsecond=0),
            target_volume=next_volume,
        )
        self.db.add(new_progress)

        await self.db.commit()
        await self.db.refresh(new_progress)

        logger.info(f"Advanced domain {domain.domain} to day {next_day} with limit {next_volume}")
        return new_progress

    def _calculate_adjusted_volume(
        self,
        target_volume: int,
        previous_progress: WarmingProgress,
        schedule: WarmingSchedule,
    ) -> int:
        """
        Calculate AI-adjusted volume based on previous day performance.

        Returns adjusted volume.
        """
        if not previous_progress.sent:
            return target_volume

        # Get rates
        bounce_rate = previous_progress.bounce_rate or 0
        complaint_rate = previous_progress.complaint_rate or 0
        delivery_rate = previous_progress.delivery_rate or 1

        # Calculate adjustment factor
        adjustment = 1.0

        # Penalize high bounce rate
        if bounce_rate > schedule.max_bounce_rate * 0.5:
            adjustment *= 0.8  # Reduce by 20%
        elif bounce_rate > schedule.max_bounce_rate * 0.75:
            adjustment *= 0.6  # Reduce by 40%

        # Penalize high complaint rate
        if complaint_rate > schedule.max_complaint_rate * 0.5:
            adjustment *= 0.7  # Reduce by 30%
        elif complaint_rate > schedule.max_complaint_rate * 0.75:
            adjustment *= 0.5  # Reduce by 50%

        # Reward good delivery rate
        if delivery_rate > 0.98:
            adjustment *= 1.1  # Increase by 10%

        # Cap adjustments
        adjustment = max(0.5, min(1.2, adjustment))

        adjusted_volume = int(target_volume * adjustment)

        # Store recommendation
        if adjustment != 1.0:
            action = "reduce" if adjustment < 1 else "increase"
            previous_progress.ai_recommendation = {
                "action": action,
                "reason": f"Adjusted based on bounce_rate={bounce_rate:.3f}, complaint_rate={complaint_rate:.4f}",
                "original_volume": target_volume,
                "suggested_volume": adjusted_volume,
                "adjustment_factor": adjustment,
            }

        return adjusted_volume

    # -------------------------------------------------------------------------
    # WARMING STATUS & PROGRESS
    # -------------------------------------------------------------------------

    async def get_warming_status(
        self,
        domain_id: str,
        workspace_id: str,
    ) -> dict:
        """Get detailed warming status for a domain."""
        result = await self.db.execute(
            select(SendingDomain).where(
                and_(
                    SendingDomain.id == domain_id,
                    SendingDomain.workspace_id == workspace_id,
                )
            )
        )
        domain = result.scalar_one_or_none()

        if not domain:
            raise ValueError("Domain not found")

        # Get schedule
        schedule = None
        total_days = 0
        schedule_type = None

        if domain.warming_schedule_id:
            schedule = await self.get_schedule(domain.warming_schedule_id)
            if schedule:
                total_days = max(step.get("day", 0) for step in schedule.steps)
                schedule_type = schedule.schedule_type

        # Calculate progress percentage
        progress_pct = 0
        if total_days > 0:
            progress_pct = min(100, (domain.warming_day / total_days) * 100)

        # Get next day limit
        next_day_limit = None
        if schedule and domain.warming_day < total_days:
            next_day = domain.warming_day + 1
            for step in schedule.steps:
                if step.get("day") >= next_day:
                    next_day_limit = step.get("volume")
                    break

        # Get recent metrics
        result = await self.db.execute(
            select(WarmingProgress)
            .where(WarmingProgress.domain_id == domain_id)
            .order_by(WarmingProgress.day_number.desc())
            .limit(7)
        )
        recent_progress = list(result.scalars().all())

        recent_metrics = {
            "total_sent": sum(p.sent for p in recent_progress),
            "total_delivered": sum(p.delivered for p in recent_progress),
            "total_bounced": sum(p.bounced for p in recent_progress),
            "total_complaints": sum(p.complaints for p in recent_progress),
            "days_tracked": len(recent_progress),
        }

        if recent_metrics["total_sent"] > 0:
            recent_metrics["avg_delivery_rate"] = recent_metrics["total_delivered"] / recent_metrics["total_sent"]
            recent_metrics["avg_bounce_rate"] = recent_metrics["total_bounced"] / recent_metrics["total_sent"]

        return {
            "domain_id": domain.id,
            "warming_status": domain.warming_status,
            "warming_day": domain.warming_day,
            "total_days": total_days,
            "current_daily_limit": domain.daily_limit,
            "daily_sent": domain.daily_sent,
            "started_at": domain.warming_started_at,
            "schedule_type": schedule_type,
            "progress_percentage": progress_pct,
            "next_day_limit": next_day_limit,
            "health_score": domain.health_score,
            "recent_metrics": recent_metrics,
        }

    async def get_warming_progress(
        self,
        domain_id: str,
        workspace_id: str,
    ) -> list[WarmingProgress]:
        """Get warming progress history for a domain."""
        # Verify domain belongs to workspace
        result = await self.db.execute(
            select(SendingDomain).where(
                and_(
                    SendingDomain.id == domain_id,
                    SendingDomain.workspace_id == workspace_id,
                )
            )
        )
        domain = result.scalar_one_or_none()

        if not domain:
            raise ValueError("Domain not found")

        result = await self.db.execute(
            select(WarmingProgress)
            .where(WarmingProgress.domain_id == domain_id)
            .order_by(WarmingProgress.day_number.asc())
        )
        return list(result.scalars().all())

    async def update_warming_metrics(
        self,
        domain_id: str,
        sent: int = 0,
        delivered: int = 0,
        bounced: int = 0,
        complaints: int = 0,
    ) -> WarmingProgress | None:
        """Update today's warming progress metrics."""
        result = await self.db.execute(
            select(SendingDomain).where(SendingDomain.id == domain_id)
        )
        domain = result.scalar_one_or_none()

        if not domain or domain.warming_status != WarmingStatus.IN_PROGRESS.value:
            return None

        # Get today's progress
        result = await self.db.execute(
            select(WarmingProgress).where(
                and_(
                    WarmingProgress.domain_id == domain_id,
                    WarmingProgress.day_number == domain.warming_day,
                )
            )
        )
        progress = result.scalar_one_or_none()

        if progress:
            progress.sent += sent
            progress.delivered += delivered
            progress.bounced += bounced
            progress.complaints += complaints
            await self.db.commit()
            await self.db.refresh(progress)

        return progress
