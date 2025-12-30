"""Sprint analytics service for burndown, velocity, and team health metrics."""

from datetime import date, datetime, timedelta, timezone
from typing import Literal
from uuid import uuid4

from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from devograph.models.sprint import Sprint, SprintTask, SprintMetrics, TeamVelocity


class SprintAnalyticsService:
    """Service for sprint analytics and metrics."""

    def __init__(self, db: AsyncSession):
        self.db = db

    # Burndown
    async def get_burndown_data(self, sprint_id: str) -> dict:
        """Get burndown chart data for a sprint.

        Returns:
            Dict with dates, ideal, actual, and scope_changes arrays.
        """
        # Get sprint
        stmt = select(Sprint).where(Sprint.id == sprint_id)
        result = await self.db.execute(stmt)
        sprint = result.scalar_one_or_none()

        if not sprint:
            return {"dates": [], "ideal": [], "actual": [], "scope_changes": []}

        # Get all metrics snapshots
        stmt = (
            select(SprintMetrics)
            .where(SprintMetrics.sprint_id == sprint_id)
            .order_by(SprintMetrics.snapshot_date)
        )
        result = await self.db.execute(stmt)
        metrics = list(result.scalars().all())

        if not metrics:
            # No metrics yet, return projected data
            return self._generate_projected_burndown(sprint)

        dates = []
        ideal = []
        actual = []
        scope_changes = []

        for m in metrics:
            dates.append(m.snapshot_date.isoformat())
            ideal.append(m.ideal_burndown)
            actual.append(m.actual_burndown)

        # Detect scope changes (significant changes in total_points)
        prev_total = None
        for m in metrics:
            if prev_total is not None and abs(m.total_points - prev_total) > 0:
                scope_changes.append({
                    "date": m.snapshot_date.isoformat(),
                    "change": m.total_points - prev_total,
                    "new_total": m.total_points,
                })
            prev_total = m.total_points

        return {
            "dates": dates,
            "ideal": ideal,
            "actual": actual,
            "scope_changes": scope_changes,
        }

    def _generate_projected_burndown(self, sprint: Sprint) -> dict:
        """Generate projected burndown for a sprint without metrics."""
        if not sprint.start_date or not sprint.end_date:
            return {"dates": [], "ideal": [], "actual": [], "scope_changes": []}

        start = sprint.start_date.date()
        end = sprint.end_date.date()
        total_days = (end - start).days

        if total_days <= 0:
            return {"dates": [], "ideal": [], "actual": [], "scope_changes": []}

        # Calculate total points from tasks
        total_points = sum(
            t.story_points or 0 for t in (sprint.tasks or [])
        )

        dates = []
        ideal = []

        current = start
        while current <= end:
            dates.append(current.isoformat())
            days_elapsed = (current - start).days
            ideal_remaining = total_points * (1 - days_elapsed / total_days)
            ideal.append(max(0, ideal_remaining))
            current += timedelta(days=1)

        return {
            "dates": dates,
            "ideal": ideal,
            "actual": [],  # No actual data yet
            "scope_changes": [],
        }

    async def record_daily_metrics(self, sprint_id: str) -> SprintMetrics | None:
        """Record daily metrics snapshot for a sprint.

        This should be called by a scheduled task daily.
        """
        stmt = (
            select(Sprint)
            .where(Sprint.id == sprint_id, Sprint.status == "active")
        )
        result = await self.db.execute(stmt)
        sprint = result.scalar_one_or_none()

        if not sprint:
            return None

        today = date.today()

        # Check if we already have metrics for today
        stmt = (
            select(SprintMetrics)
            .where(
                SprintMetrics.sprint_id == sprint_id,
                SprintMetrics.snapshot_date == today,
            )
        )
        result = await self.db.execute(stmt)
        existing = result.scalar_one_or_none()

        # Calculate current stats
        stats = await self._calculate_sprint_stats(sprint)

        # Calculate ideal burndown
        if sprint.start_date and sprint.end_date:
            total_days = (sprint.end_date.date() - sprint.start_date.date()).days
            days_elapsed = (today - sprint.start_date.date()).days
            if total_days > 0:
                ideal_burndown = stats["total_points"] * (1 - days_elapsed / total_days)
            else:
                ideal_burndown = 0
        else:
            ideal_burndown = stats["remaining_points"]

        if existing:
            existing.total_points = stats["total_points"]
            existing.completed_points = stats["completed_points"]
            existing.remaining_points = stats["remaining_points"]
            existing.total_tasks = stats["total_tasks"]
            existing.completed_tasks = stats["completed_tasks"]
            existing.in_progress_tasks = stats["in_progress_tasks"]
            existing.ideal_burndown = ideal_burndown
            existing.actual_burndown = stats["remaining_points"]
            await self.db.flush()
            return existing

        metrics = SprintMetrics(
            id=str(uuid4()),
            sprint_id=sprint_id,
            snapshot_date=today,
            total_points=stats["total_points"],
            completed_points=stats["completed_points"],
            remaining_points=stats["remaining_points"],
            total_tasks=stats["total_tasks"],
            completed_tasks=stats["completed_tasks"],
            in_progress_tasks=stats["in_progress_tasks"],
            blocked_tasks=0,
            ideal_burndown=ideal_burndown,
            actual_burndown=stats["remaining_points"],
        )
        self.db.add(metrics)
        await self.db.flush()
        return metrics

    async def record_all_active_sprints(self) -> int:
        """Record metrics for all active sprints. Returns count of sprints recorded."""
        stmt = select(Sprint).where(Sprint.status == "active")
        result = await self.db.execute(stmt)
        active_sprints = result.scalars().all()

        count = 0
        for sprint in active_sprints:
            if await self.record_daily_metrics(sprint.id):
                count += 1

        return count

    # Velocity
    async def get_team_velocity(
        self, team_id: str, num_sprints: int = 6
    ) -> dict:
        """Get velocity trend for a team.

        Returns:
            Dict with sprints array, average_velocity, and trend.
        """
        stmt = (
            select(TeamVelocity)
            .where(TeamVelocity.team_id == team_id)
            .order_by(TeamVelocity.created_at.desc())
            .limit(num_sprints)
        )
        result = await self.db.execute(stmt)
        velocities = list(result.scalars().all())

        if not velocities:
            return {
                "sprints": [],
                "average_velocity": 0,
                "trend": "stable",
            }

        # Get sprint names
        sprint_ids = [v.sprint_id for v in velocities]
        stmt = select(Sprint).where(Sprint.id.in_(sprint_ids))
        result = await self.db.execute(stmt)
        sprints_map = {s.id: s for s in result.scalars().all()}

        data_points = []
        for v in reversed(velocities):  # Oldest first
            sprint = sprints_map.get(v.sprint_id)
            data_points.append({
                "sprint_id": v.sprint_id,
                "sprint_name": sprint.name if sprint else "Unknown",
                "committed": v.committed_points,
                "completed": v.completed_points,
                "carry_over": v.carry_over_points,
                "completion_rate": v.completion_rate,
            })

        # Calculate average
        avg_velocity = sum(v.completed_points for v in velocities) / len(velocities)

        # Determine trend (compare first half to second half)
        if len(velocities) >= 4:
            mid = len(velocities) // 2
            first_half = sum(velocities[i].completed_points for i in range(mid, len(velocities))) / mid
            second_half = sum(velocities[i].completed_points for i in range(mid)) / mid
            if second_half > first_half * 1.1:
                trend = "improving"
            elif second_half < first_half * 0.9:
                trend = "declining"
            else:
                trend = "stable"
        else:
            trend = "stable"

        return {
            "sprints": data_points,
            "average_velocity": round(avg_velocity, 1),
            "trend": trend,
        }

    async def calculate_sprint_velocity(self, sprint_id: str) -> TeamVelocity | None:
        """Calculate and store velocity for a completed sprint."""
        stmt = (
            select(Sprint)
            .where(Sprint.id == sprint_id, Sprint.status == "completed")
        )
        result = await self.db.execute(stmt)
        sprint = result.scalar_one_or_none()

        if not sprint:
            return None

        # Check if already calculated
        stmt = select(TeamVelocity).where(TeamVelocity.sprint_id == sprint_id)
        result = await self.db.execute(stmt)
        if result.scalar_one_or_none():
            return None

        stats = await self._calculate_sprint_stats(sprint)

        # Get carry-over points
        stmt = (
            select(func.coalesce(func.sum(SprintTask.story_points), 0))
            .where(
                SprintTask.sprint_id == sprint_id,
                SprintTask.status != "done",
            )
        )
        result = await self.db.execute(stmt)
        carry_over_points = result.scalar() or 0

        committed_points = sprint.velocity_commitment or stats["total_points"]
        completed_points = stats["completed_points"]

        completion_rate = (
            completed_points / committed_points if committed_points > 0 else 0
        )

        focus_factor = (
            completed_points / stats["total_points"]
            if stats["total_points"] > 0
            else 1.0
        )

        velocity = TeamVelocity(
            id=str(uuid4()),
            team_id=sprint.team_id,
            sprint_id=sprint_id,
            committed_points=committed_points,
            completed_points=completed_points,
            carry_over_points=carry_over_points,
            completion_rate=completion_rate,
            focus_factor=focus_factor,
        )
        self.db.add(velocity)
        await self.db.flush()
        return velocity

    async def predict_velocity(self, team_id: str) -> dict:
        """Predict next sprint velocity based on history."""
        velocity_data = await self.get_team_velocity(team_id, num_sprints=6)

        if not velocity_data["sprints"]:
            return {
                "predicted_velocity": 0,
                "confidence": 0,
                "range_low": 0,
                "range_high": 0,
            }

        completed_values = [s["completed"] for s in velocity_data["sprints"]]

        # Simple weighted average (more recent = more weight)
        weights = list(range(1, len(completed_values) + 1))
        weighted_sum = sum(v * w for v, w in zip(completed_values, weights))
        total_weight = sum(weights)

        predicted = weighted_sum / total_weight if total_weight > 0 else 0

        # Calculate standard deviation for confidence range
        if len(completed_values) >= 3:
            mean = sum(completed_values) / len(completed_values)
            variance = sum((v - mean) ** 2 for v in completed_values) / len(completed_values)
            std_dev = variance ** 0.5
            confidence = max(0, 1 - (std_dev / mean)) if mean > 0 else 0
        else:
            std_dev = predicted * 0.2  # Assume 20% variability
            confidence = 0.5

        return {
            "predicted_velocity": round(predicted, 1),
            "confidence": round(confidence, 2),
            "range_low": round(max(0, predicted - std_dev), 1),
            "range_high": round(predicted + std_dev, 1),
        }

    # Carry-over analysis
    async def get_carry_over_analysis(self, team_id: str) -> dict:
        """Analyze carry-over patterns for a team."""
        stmt = (
            select(TeamVelocity)
            .where(TeamVelocity.team_id == team_id)
            .order_by(TeamVelocity.created_at.desc())
            .limit(10)
        )
        result = await self.db.execute(stmt)
        velocities = list(result.scalars().all())

        if not velocities:
            return {
                "total_carry_over": 0,
                "average_carry_over": 0,
                "carry_over_rate": 0,
                "trend": "stable",
                "sprints": [],
            }

        # Get sprint names
        sprint_ids = [v.sprint_id for v in velocities]
        stmt = select(Sprint).where(Sprint.id.in_(sprint_ids))
        result = await self.db.execute(stmt)
        sprints_map = {s.id: s for s in result.scalars().all()}

        sprint_data = []
        for v in reversed(velocities):
            sprint = sprints_map.get(v.sprint_id)
            carry_over_rate = (
                v.carry_over_points / v.committed_points
                if v.committed_points > 0
                else 0
            )
            sprint_data.append({
                "sprint_id": v.sprint_id,
                "sprint_name": sprint.name if sprint else "Unknown",
                "carry_over_points": v.carry_over_points,
                "carry_over_rate": round(carry_over_rate * 100, 1),
            })

        total_carry_over = sum(v.carry_over_points for v in velocities)
        total_committed = sum(v.committed_points for v in velocities)
        average_carry_over = total_carry_over / len(velocities)
        carry_over_rate = total_carry_over / total_committed if total_committed > 0 else 0

        # Trend: compare first half to second half
        if len(velocities) >= 4:
            mid = len(velocities) // 2
            first_half = sum(velocities[i].carry_over_points for i in range(mid, len(velocities)))
            second_half = sum(velocities[i].carry_over_points for i in range(mid))
            if second_half > first_half * 1.2:
                trend = "increasing"
            elif second_half < first_half * 0.8:
                trend = "decreasing"
            else:
                trend = "stable"
        else:
            trend = "stable"

        return {
            "total_carry_over": total_carry_over,
            "average_carry_over": round(average_carry_over, 1),
            "carry_over_rate": round(carry_over_rate * 100, 1),
            "trend": trend,
            "sprints": sprint_data,
        }

    async def identify_chronic_carry_over(self, team_id: str) -> list[dict]:
        """Identify tasks that frequently get carried over."""
        # Get recent sprints
        stmt = (
            select(Sprint)
            .where(Sprint.team_id == team_id, Sprint.status == "completed")
            .order_by(Sprint.end_date.desc())
            .limit(5)
        )
        result = await self.db.execute(stmt)
        recent_sprints = list(result.scalars().all())

        if not recent_sprints:
            return []

        # Find tasks that were carried over
        sprint_ids = [s.id for s in recent_sprints]
        stmt = (
            select(SprintTask)
            .where(
                SprintTask.sprint_id.in_(sprint_ids),
                SprintTask.carried_over_from_sprint_id.isnot(None),
            )
        )
        result = await self.db.execute(stmt)
        carried_tasks = result.scalars().all()

        # Group by source_id to find recurring carry-overs
        task_counts: dict[str, dict] = {}
        for task in carried_tasks:
            key = f"{task.source_type}:{task.source_id}"
            if key not in task_counts:
                task_counts[key] = {
                    "source_type": task.source_type,
                    "source_id": task.source_id,
                    "title": task.title,
                    "count": 0,
                    "total_points": 0,
                }
            task_counts[key]["count"] += 1
            task_counts[key]["total_points"] += task.story_points or 0

        # Return tasks carried over more than once
        chronic = [
            v for v in task_counts.values()
            if v["count"] >= 2
        ]

        return sorted(chronic, key=lambda x: x["count"], reverse=True)

    # Team health
    async def get_team_health_metrics(self, team_id: str) -> dict:
        """Get team health metrics based on sprint performance."""
        velocity_data = await self.get_team_velocity(team_id, num_sprints=6)
        carry_over_data = await self.get_carry_over_analysis(team_id)

        if not velocity_data["sprints"]:
            return {
                "overall_score": 0,
                "velocity_score": 0,
                "consistency_score": 0,
                "completion_score": 0,
                "recommendations": ["Not enough data to calculate health metrics."],
            }

        sprints = velocity_data["sprints"]

        # Calculate scores (0-100)

        # Velocity score: based on trend
        if velocity_data["trend"] == "improving":
            velocity_score = 90
        elif velocity_data["trend"] == "stable":
            velocity_score = 75
        else:
            velocity_score = 50

        # Consistency score: low variance = high consistency
        completed_values = [s["completed"] for s in sprints]
        if len(completed_values) >= 2:
            mean = sum(completed_values) / len(completed_values)
            if mean > 0:
                variance = sum((v - mean) ** 2 for v in completed_values) / len(completed_values)
                cv = (variance ** 0.5) / mean  # Coefficient of variation
                consistency_score = max(0, min(100, 100 - (cv * 100)))
            else:
                consistency_score = 50
        else:
            consistency_score = 50

        # Completion score: based on average completion rate
        avg_completion = sum(s["completion_rate"] for s in sprints) / len(sprints)
        completion_score = min(100, avg_completion * 100)

        # Overall score: weighted average
        overall_score = (
            velocity_score * 0.3 +
            consistency_score * 0.35 +
            completion_score * 0.35
        )

        # Generate recommendations
        recommendations = []

        if carry_over_data["carry_over_rate"] > 20:
            recommendations.append(
                "High carry-over rate. Consider reducing sprint commitment or breaking down large tasks."
            )

        if consistency_score < 60:
            recommendations.append(
                "Velocity is inconsistent. Consider more accurate estimation or protecting team capacity."
            )

        if completion_score < 70:
            recommendations.append(
                "Low completion rate. Review if commitments are realistic or if there are blockers."
            )

        if velocity_data["trend"] == "declining":
            recommendations.append(
                "Velocity is declining. Investigate potential causes like technical debt or team changes."
            )

        if not recommendations:
            recommendations.append("Team is performing well! Keep up the good work.")

        return {
            "overall_score": round(overall_score, 1),
            "velocity_score": round(velocity_score, 1),
            "consistency_score": round(consistency_score, 1),
            "completion_score": round(completion_score, 1),
            "carry_over_rate": carry_over_data["carry_over_rate"],
            "average_velocity": velocity_data["average_velocity"],
            "velocity_trend": velocity_data["trend"],
            "recommendations": recommendations,
        }

    # Private helpers
    async def _calculate_sprint_stats(self, sprint: Sprint) -> dict:
        """Calculate statistics for a sprint."""
        tasks = sprint.tasks or []

        total_tasks = len(tasks)
        completed_tasks = len([t for t in tasks if t.status == "done"])
        in_progress_tasks = len([t for t in tasks if t.status == "in_progress"])

        total_points = sum(t.story_points or 0 for t in tasks)
        completed_points = sum(t.story_points or 0 for t in tasks if t.status == "done")

        return {
            "total_tasks": total_tasks,
            "completed_tasks": completed_tasks,
            "in_progress_tasks": in_progress_tasks,
            "todo_tasks": total_tasks - completed_tasks - in_progress_tasks,
            "total_points": total_points,
            "completed_points": completed_points,
            "remaining_points": total_points - completed_points,
            "completion_percentage": (
                round(completed_points / total_points * 100, 1)
                if total_points > 0
                else 0
            ),
        }
