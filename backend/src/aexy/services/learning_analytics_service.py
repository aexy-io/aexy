"""Learning analytics service for metrics and reporting."""

import logging
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import and_, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from aexy.models.compliance import (
    AssignmentStatus,
    CertificationStatus,
    DeveloperCertification,
    MandatoryTraining,
    TrainingAssignment,
)
from aexy.models.developer import Developer
from aexy.models.learning_activity import LearningActivityLog, LearningTimeSession
from aexy.models.learning_analytics import (
    LearningAnalyticsSnapshot,
    LearningReportDefinition,
    LearningReportRun,
    ReportRunStatus,
    ReportType,
    SnapshotType,
)
from aexy.models.learning_management import (
    ApprovalStatus,
    CourseApprovalRequest,
    GoalStatus,
    LearningBudget,
    LearningGoal,
)
from aexy.models.team import Team, TeamMember
from aexy.schemas.learning_analytics import (
    AnalyticsSnapshotFilter,
    AnalyticsSnapshotResponse,
    CompletionRateEntry,
    CompletionRateReport,
    ExecutiveDashboard,
    ExecutiveDashboardMetrics,
    LearningTrends,
    ReportConfig,
    ReportDefinitionCreate,
    ReportDefinitionFilter,
    ReportDefinitionUpdate,
    ReportDefinitionWithDetails,
    ReportRunFilter,
    ReportRunWithDetails,
    ROIMetrics,
    SkillGapAnalysis,
    SkillGapEntry,
    TeamPerformanceComparison,
    TeamPerformanceEntry,
    TrendDataPoint,
)

logger = logging.getLogger(__name__)


class LearningAnalyticsService:
    """Service for learning analytics and reporting."""

    def __init__(self, db: AsyncSession) -> None:
        """Initialize the analytics service."""
        self.db = db

    # ==================== Executive Dashboard ====================

    async def get_executive_dashboard(
        self,
        workspace_id: str,
        period_days: int = 30,
        team_ids: list[str] | None = None,
    ) -> ExecutiveDashboard:
        """Get executive dashboard with comprehensive metrics."""
        now = datetime.now(timezone.utc)
        period_start = now - timedelta(days=period_days)
        previous_period_start = period_start - timedelta(days=period_days)

        # Get current period metrics
        current_metrics = await self._get_period_metrics(
            workspace_id, period_start, now, team_ids
        )

        # Get previous period metrics for comparison
        previous_metrics = await self._get_period_metrics(
            workspace_id, previous_period_start, period_start, team_ids
        )

        # Calculate changes
        metrics = ExecutiveDashboardMetrics(
            total_learning_hours=current_metrics.get("learning_hours", 0),
            learning_hours_change=self._calc_change(
                current_metrics.get("learning_hours", 0),
                previous_metrics.get("learning_hours", 0),
            ),
            active_learners=current_metrics.get("active_learners", 0),
            active_learners_change=self._calc_change(
                current_metrics.get("active_learners", 0),
                previous_metrics.get("active_learners", 0),
            ),
            courses_completed=current_metrics.get("courses_completed", 0),
            courses_completed_change=self._calc_change(
                current_metrics.get("courses_completed", 0),
                previous_metrics.get("courses_completed", 0),
            ),
            certifications_earned=current_metrics.get("certifications_earned", 0),
            certifications_earned_change=self._calc_change(
                current_metrics.get("certifications_earned", 0),
                previous_metrics.get("certifications_earned", 0),
            ),
            total_goals=current_metrics.get("total_goals", 0),
            completed_goals=current_metrics.get("completed_goals", 0),
            goal_completion_rate=current_metrics.get("goal_completion_rate", 0),
            overdue_goals=current_metrics.get("overdue_goals", 0),
            compliance_rate=current_metrics.get("compliance_rate", 0),
            compliance_rate_change=self._calc_change(
                current_metrics.get("compliance_rate", 0),
                previous_metrics.get("compliance_rate", 0),
            ),
            non_compliant_count=current_metrics.get("non_compliant_count", 0),
            total_budget_cents=current_metrics.get("total_budget_cents", 0),
            spent_budget_cents=current_metrics.get("spent_budget_cents", 0),
            budget_utilization=current_metrics.get("budget_utilization", 0),
        )

        # Get trends
        trends = await self._get_learning_trends(workspace_id, period_days, team_ids)

        # Get skill gaps
        skill_gaps = await self._get_skill_gap_analysis(workspace_id, team_ids)

        # Get team comparison
        team_comparison = await self._get_team_comparison(workspace_id, period_start, now)

        # Get ROI metrics
        roi = await self._get_roi_metrics(workspace_id, period_start, now)

        return ExecutiveDashboard(
            metrics=metrics,
            trends=trends,
            skill_gaps=skill_gaps,
            team_comparison=team_comparison,
            roi=roi,
            period_start=period_start,
            period_end=now,
        )

    async def _get_period_metrics(
        self,
        workspace_id: str,
        start: datetime,
        end: datetime,
        team_ids: list[str] | None = None,
    ) -> dict[str, Any]:
        """Get aggregated metrics for a period."""
        # Get developer IDs for filtering
        developer_ids = None
        if team_ids:
            member_query = select(TeamMember.developer_id).where(
                TeamMember.team_id.in_(team_ids)
            ).distinct()
            result = await self.db.execute(member_query)
            developer_ids = list(result.scalars().all())

        # Learning hours (from time sessions)
        hours_query = select(func.sum(LearningTimeSession.duration_seconds)).where(
            and_(
                LearningTimeSession.workspace_id == workspace_id,
                LearningTimeSession.started_at >= start,
                LearningTimeSession.started_at < end,
            )
        )
        if developer_ids:
            hours_query = hours_query.where(LearningTimeSession.developer_id.in_(developer_ids))

        result = await self.db.execute(hours_query)
        total_seconds = result.scalar() or 0
        learning_hours = total_seconds / 3600

        # Active learners
        learners_query = select(func.count(func.distinct(LearningTimeSession.developer_id))).where(
            and_(
                LearningTimeSession.workspace_id == workspace_id,
                LearningTimeSession.started_at >= start,
                LearningTimeSession.started_at < end,
            )
        )
        if developer_ids:
            learners_query = learners_query.where(LearningTimeSession.developer_id.in_(developer_ids))

        result = await self.db.execute(learners_query)
        active_learners = result.scalar() or 0

        # Completed goals
        goals_query = select(
            func.count(),
            func.sum(func.cast(LearningGoal.status == GoalStatus.COMPLETED.value, func.Integer)),
            func.sum(func.cast(
                and_(
                    LearningGoal.due_date < end,
                    LearningGoal.status.notin_([GoalStatus.COMPLETED.value, GoalStatus.CANCELLED.value])
                ),
                func.Integer
            )),
        ).where(
            and_(
                LearningGoal.workspace_id == workspace_id,
                LearningGoal.status != GoalStatus.CANCELLED.value,
            )
        )
        if developer_ids:
            goals_query = goals_query.where(LearningGoal.developer_id.in_(developer_ids))

        result = await self.db.execute(goals_query)
        row = result.first()
        total_goals = row[0] or 0
        completed_goals = row[1] or 0
        overdue_goals = row[2] or 0
        goal_completion_rate = (completed_goals / total_goals * 100) if total_goals > 0 else 0

        # Certifications earned
        certs_query = select(func.count()).where(
            and_(
                DeveloperCertification.workspace_id == workspace_id,
                DeveloperCertification.issued_date >= start,
                DeveloperCertification.issued_date < end,
            )
        )
        if developer_ids:
            certs_query = certs_query.where(DeveloperCertification.developer_id.in_(developer_ids))

        result = await self.db.execute(certs_query)
        certifications_earned = result.scalar() or 0

        # Compliance rate
        compliance_query = select(
            func.count(),
            func.sum(func.cast(TrainingAssignment.status == AssignmentStatus.COMPLETED.value, func.Integer)),
        ).where(
            TrainingAssignment.workspace_id == workspace_id
        )
        if developer_ids:
            compliance_query = compliance_query.where(TrainingAssignment.developer_id.in_(developer_ids))

        result = await self.db.execute(compliance_query)
        row = result.first()
        total_assignments = row[0] or 0
        completed_assignments = row[1] or 0
        compliance_rate = (completed_assignments / total_assignments * 100) if total_assignments > 0 else 100

        # Non-compliant count
        non_compliant_query = select(func.count(func.distinct(TrainingAssignment.developer_id))).where(
            and_(
                TrainingAssignment.workspace_id == workspace_id,
                TrainingAssignment.status == AssignmentStatus.OVERDUE.value,
            )
        )
        result = await self.db.execute(non_compliant_query)
        non_compliant_count = result.scalar() or 0

        # Budget
        budget_query = select(
            func.sum(LearningBudget.budget_cents),
            func.sum(LearningBudget.spent_cents),
        ).where(
            and_(
                LearningBudget.workspace_id == workspace_id,
                LearningBudget.is_active == True,
            )
        )
        result = await self.db.execute(budget_query)
        row = result.first()
        total_budget = row[0] or 0
        spent_budget = row[1] or 0
        budget_utilization = (spent_budget / total_budget * 100) if total_budget > 0 else 0

        return {
            "learning_hours": learning_hours,
            "active_learners": active_learners,
            "courses_completed": 0,  # Would need activity logs
            "certifications_earned": certifications_earned,
            "total_goals": total_goals,
            "completed_goals": completed_goals,
            "overdue_goals": overdue_goals,
            "goal_completion_rate": goal_completion_rate,
            "compliance_rate": compliance_rate,
            "non_compliant_count": non_compliant_count,
            "total_budget_cents": total_budget,
            "spent_budget_cents": spent_budget,
            "budget_utilization": budget_utilization,
        }

    def _calc_change(self, current: float, previous: float) -> float:
        """Calculate percentage change."""
        if previous == 0:
            return 100.0 if current > 0 else 0.0
        return ((current - previous) / previous) * 100

    async def _get_learning_trends(
        self,
        workspace_id: str,
        period_days: int,
        team_ids: list[str] | None = None,
    ) -> LearningTrends:
        """Get learning trends over time."""
        now = datetime.now(timezone.utc)
        start = now - timedelta(days=period_days)

        # Generate date points
        learning_hours_data = []
        active_learners_data = []

        # Aggregate by day for shorter periods, by week for longer
        if period_days <= 30:
            interval_days = 1
        elif period_days <= 90:
            interval_days = 7
        else:
            interval_days = 30

        current_date = start
        while current_date < now:
            next_date = min(current_date + timedelta(days=interval_days), now)

            # Get learning hours for this interval
            hours_query = select(func.sum(LearningTimeSession.duration_seconds)).where(
                and_(
                    LearningTimeSession.workspace_id == workspace_id,
                    LearningTimeSession.started_at >= current_date,
                    LearningTimeSession.started_at < next_date,
                )
            )
            result = await self.db.execute(hours_query)
            hours = (result.scalar() or 0) / 3600

            # Get active learners for this interval
            learners_query = select(func.count(func.distinct(LearningTimeSession.developer_id))).where(
                and_(
                    LearningTimeSession.workspace_id == workspace_id,
                    LearningTimeSession.started_at >= current_date,
                    LearningTimeSession.started_at < next_date,
                )
            )
            result = await self.db.execute(learners_query)
            learners = result.scalar() or 0

            date_str = current_date.strftime("%Y-%m-%d")
            learning_hours_data.append(TrendDataPoint(date=date_str, value=hours))
            active_learners_data.append(TrendDataPoint(date=date_str, value=float(learners)))

            current_date = next_date

        return LearningTrends(
            learning_hours=learning_hours_data,
            active_learners=active_learners_data,
            courses_completed=[],
            goal_completion_rate=[],
        )

    async def _get_skill_gap_analysis(
        self,
        workspace_id: str,
        team_ids: list[str] | None = None,
    ) -> SkillGapAnalysis:
        """Analyze skill gaps based on goals and certifications."""
        # This would ideally be based on skill requirements vs current skills
        # For now, return a placeholder
        return SkillGapAnalysis(
            skills=[],
            total_gaps=0,
            critical_gaps=0,
        )

    async def _get_team_comparison(
        self,
        workspace_id: str,
        start: datetime,
        end: datetime,
    ) -> TeamPerformanceComparison:
        """Get team performance comparison."""
        # Get all teams in workspace
        teams_query = select(Team).where(Team.workspace_id == workspace_id)
        result = await self.db.execute(teams_query)
        teams = list(result.scalars().all())

        team_entries = []
        for team in teams:
            # Get team members
            members_query = select(TeamMember.developer_id).where(TeamMember.team_id == team.id)
            result = await self.db.execute(members_query)
            member_ids = list(result.scalars().all())

            if not member_ids:
                continue

            # Get metrics for this team
            metrics = await self._get_period_metrics(
                workspace_id, start, end, team_ids=[team.id]
            )

            team_entries.append(TeamPerformanceEntry(
                team_id=team.id,
                team_name=team.name,
                learning_hours=metrics.get("learning_hours", 0),
                courses_completed=metrics.get("courses_completed", 0),
                goal_completion_rate=metrics.get("goal_completion_rate", 0),
                compliance_rate=metrics.get("compliance_rate", 0),
                budget_utilization=metrics.get("budget_utilization", 0),
            ))

        return TeamPerformanceComparison(
            teams=team_entries,
            workspace_average={},
        )

    async def _get_roi_metrics(
        self,
        workspace_id: str,
        start: datetime,
        end: datetime,
    ) -> ROIMetrics:
        """Calculate ROI metrics."""
        # Total investment (from budgets spent)
        budget_query = select(func.sum(LearningBudget.spent_cents)).where(
            and_(
                LearningBudget.workspace_id == workspace_id,
                LearningBudget.fiscal_year == start.year,
            )
        )
        result = await self.db.execute(budget_query)
        total_investment = result.scalar() or 0

        # Certifications earned
        certs_query = select(func.count()).where(
            and_(
                DeveloperCertification.workspace_id == workspace_id,
                DeveloperCertification.issued_date >= start,
                DeveloperCertification.issued_date < end,
            )
        )
        result = await self.db.execute(certs_query)
        certs_earned = result.scalar() or 0

        cost_per_cert = (total_investment // certs_earned) if certs_earned > 0 else 0

        return ROIMetrics(
            total_investment_cents=total_investment,
            total_courses_completed=0,
            total_certifications_earned=certs_earned,
            cost_per_course_cents=0,
            cost_per_certification_cents=cost_per_cert,
            estimated_value_generated_cents=0,
            roi_percentage=0,
        )

    # ==================== Completion Rates ====================

    async def get_completion_rates(
        self,
        workspace_id: str,
        period_type: str = "monthly",
        periods: int = 12,
    ) -> CompletionRateReport:
        """Get completion rates over time."""
        now = datetime.now(timezone.utc)
        entries = []
        overall_total = 0
        overall_completed = 0

        for i in range(periods):
            if period_type == "daily":
                period_start = now - timedelta(days=i+1)
                period_end = now - timedelta(days=i)
                period_label = period_start.strftime("%Y-%m-%d")
            elif period_type == "weekly":
                period_start = now - timedelta(weeks=i+1)
                period_end = now - timedelta(weeks=i)
                period_label = f"Week {periods-i}"
            else:  # monthly
                # Approximate months
                period_start = now - timedelta(days=30*(i+1))
                period_end = now - timedelta(days=30*i)
                period_label = period_start.strftime("%Y-%m")

            # Get goal completion for this period
            query = select(
                func.count(),
                func.sum(func.cast(LearningGoal.status == GoalStatus.COMPLETED.value, func.Integer)),
            ).where(
                and_(
                    LearningGoal.workspace_id == workspace_id,
                    LearningGoal.created_at >= period_start,
                    LearningGoal.created_at < period_end,
                )
            )
            result = await self.db.execute(query)
            row = result.first()
            total = row[0] or 0
            completed = row[1] or 0

            rate = (completed / total * 100) if total > 0 else 0
            entries.append(CompletionRateEntry(
                period=period_label,
                total=total,
                completed=completed,
                rate=rate,
            ))

            overall_total += total
            overall_completed += completed

        overall_rate = (overall_completed / overall_total * 100) if overall_total > 0 else 0

        return CompletionRateReport(
            entries=list(reversed(entries)),  # Oldest first
            overall_rate=overall_rate,
            period_type=period_type,
        )

    # ==================== Report Definitions CRUD ====================

    async def create_report_definition(
        self,
        workspace_id: str,
        data: ReportDefinitionCreate,
        created_by_id: str,
    ) -> LearningReportDefinition:
        """Create a new report definition."""
        definition = LearningReportDefinition(
            workspace_id=workspace_id,
            created_by_id=created_by_id,
            name=data.name,
            description=data.description,
            report_type=data.report_type.value,
            config=data.config.model_dump() if data.config else {},
            is_scheduled=data.is_scheduled,
            schedule_frequency=data.schedule_frequency.value if data.schedule_frequency else None,
            schedule_day=data.schedule_day,
            schedule_time=data.schedule_time,
            recipients=data.recipients,
            export_format=data.export_format.value,
            extra_data=data.extra_data,
        )

        if data.is_scheduled and data.schedule_frequency:
            definition.next_run_at = self._calculate_next_run(
                data.schedule_frequency.value,
                data.schedule_day,
                data.schedule_time,
            )

        self.db.add(definition)
        await self.db.commit()
        await self.db.refresh(definition)

        logger.info(f"Created report definition {definition.id}")
        return definition

    def _calculate_next_run(
        self,
        frequency: str,
        day: int | None,
        time_str: str | None,
    ) -> datetime:
        """Calculate the next run time for a scheduled report."""
        now = datetime.now(timezone.utc)

        # Parse time
        hour, minute = 9, 0  # Default to 9 AM
        if time_str:
            parts = time_str.split(":")
            hour, minute = int(parts[0]), int(parts[1])

        if frequency == "daily":
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)
        elif frequency == "weekly":
            target_day = day or 0  # Monday
            days_ahead = target_day - now.weekday()
            if days_ahead <= 0:
                days_ahead += 7
            next_run = (now + timedelta(days=days_ahead)).replace(
                hour=hour, minute=minute, second=0, microsecond=0
            )
        elif frequency == "monthly":
            target_day = min(day or 1, 28)  # Avoid month-end issues
            next_run = now.replace(day=target_day, hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                # Move to next month
                if now.month == 12:
                    next_run = next_run.replace(year=now.year + 1, month=1)
                else:
                    next_run = next_run.replace(month=now.month + 1)
        else:
            next_run = now + timedelta(days=1)

        return next_run

    async def get_report_definition(
        self,
        definition_id: str,
        workspace_id: str | None = None,
    ) -> LearningReportDefinition | None:
        """Get a report definition by ID."""
        query = select(LearningReportDefinition).where(
            LearningReportDefinition.id == definition_id
        )
        if workspace_id:
            query = query.where(LearningReportDefinition.workspace_id == workspace_id)

        query = query.options(selectinload(LearningReportDefinition.runs))

        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def list_report_definitions(
        self,
        workspace_id: str,
        filters: ReportDefinitionFilter | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[ReportDefinitionWithDetails], int]:
        """List report definitions."""
        query = select(LearningReportDefinition).where(
            LearningReportDefinition.workspace_id == workspace_id
        )

        if filters:
            if filters.report_type:
                query = query.where(
                    LearningReportDefinition.report_type == filters.report_type.value
                )
            if filters.is_scheduled is not None:
                query = query.where(LearningReportDefinition.is_scheduled == filters.is_scheduled)
            if filters.is_active is not None:
                query = query.where(LearningReportDefinition.is_active == filters.is_active)
            if filters.created_by_id:
                query = query.where(LearningReportDefinition.created_by_id == filters.created_by_id)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(LearningReportDefinition.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)
        query = query.options(selectinload(LearningReportDefinition.runs))

        result = await self.db.execute(query)
        definitions = list(result.scalars().all())

        # Build response with details
        definitions_with_details = []
        for definition in definitions:
            # Get created by details
            created_by = None
            if definition.created_by_id:
                created_by_query = select(Developer).where(Developer.id == definition.created_by_id)
                created_by_result = await self.db.execute(created_by_query)
                created_by = created_by_result.scalar_one_or_none()

            # Get last run
            last_run = None
            if definition.runs:
                sorted_runs = sorted(definition.runs, key=lambda r: r.created_at, reverse=True)
                if sorted_runs:
                    last_run = sorted_runs[0]

            definitions_with_details.append(ReportDefinitionWithDetails(
                id=definition.id,
                workspace_id=definition.workspace_id,
                created_by_id=definition.created_by_id,
                name=definition.name,
                description=definition.description,
                report_type=definition.report_type,
                config=definition.config,
                is_scheduled=definition.is_scheduled,
                schedule_frequency=definition.schedule_frequency,
                schedule_day=definition.schedule_day,
                schedule_time=definition.schedule_time,
                next_run_at=definition.next_run_at,
                recipients=definition.recipients,
                export_format=definition.export_format,
                is_active=definition.is_active,
                extra_data=definition.extra_data,
                created_at=definition.created_at,
                updated_at=definition.updated_at,
                created_by_name=created_by.name if created_by else None,
                created_by_email=created_by.email if created_by else None,
                last_run_at=last_run.created_at if last_run else None,
                last_run_status=last_run.status if last_run else None,
                total_runs=len(definition.runs) if definition.runs else 0,
            ))

        return definitions_with_details, total

    async def update_report_definition(
        self,
        definition_id: str,
        workspace_id: str,
        data: ReportDefinitionUpdate,
    ) -> LearningReportDefinition | None:
        """Update a report definition."""
        definition = await self.get_report_definition(definition_id, workspace_id)
        if not definition:
            return None

        update_data = data.model_dump(exclude_unset=True)
        for field, value in update_data.items():
            if field == "report_type" and value:
                value = value.value
            elif field == "schedule_frequency" and value:
                value = value.value
            elif field == "export_format" and value:
                value = value.value
            elif field == "config" and value:
                value = value.model_dump()
            setattr(definition, field, value)

        # Recalculate next run if schedule changed
        if data.is_scheduled is not None or data.schedule_frequency is not None:
            if definition.is_scheduled and definition.schedule_frequency:
                definition.next_run_at = self._calculate_next_run(
                    definition.schedule_frequency,
                    definition.schedule_day,
                    definition.schedule_time,
                )
            else:
                definition.next_run_at = None

        await self.db.commit()
        await self.db.refresh(definition)

        logger.info(f"Updated report definition {definition_id}")
        return definition

    async def delete_report_definition(
        self,
        definition_id: str,
        workspace_id: str,
    ) -> bool:
        """Delete a report definition."""
        definition = await self.get_report_definition(definition_id, workspace_id)
        if not definition:
            return False

        await self.db.delete(definition)
        await self.db.commit()

        logger.info(f"Deleted report definition {definition_id}")
        return True

    # ==================== Report Runs ====================

    async def trigger_report_run(
        self,
        definition_id: str,
        workspace_id: str,
        triggered_by: str = "manual",
    ) -> LearningReportRun:
        """Trigger a report run."""
        definition = await self.get_report_definition(definition_id, workspace_id)
        if not definition:
            raise ValueError("Report definition not found")

        run = LearningReportRun(
            report_definition_id=definition.id,
            workspace_id=workspace_id,
            status=ReportRunStatus.PENDING.value,
            triggered_by=triggered_by,
        )

        self.db.add(run)
        await self.db.commit()
        await self.db.refresh(run)

        # In a real implementation, this would trigger a Temporal activity
        # For now, just mark as completed
        run.status = ReportRunStatus.COMPLETED.value
        run.started_at = datetime.now(timezone.utc)
        run.completed_at = datetime.now(timezone.utc)
        run.metrics_summary = {"status": "placeholder"}

        await self.db.commit()
        await self.db.refresh(run)

        logger.info(f"Triggered report run {run.id} for definition {definition_id}")
        return run

    async def list_report_runs(
        self,
        workspace_id: str,
        filters: ReportRunFilter | None = None,
        page: int = 1,
        page_size: int = 20,
    ) -> tuple[list[ReportRunWithDetails], int]:
        """List report runs."""
        query = select(LearningReportRun).where(
            LearningReportRun.workspace_id == workspace_id
        )

        if filters:
            if filters.report_definition_id:
                query = query.where(
                    LearningReportRun.report_definition_id == filters.report_definition_id
                )
            if filters.status:
                query = query.where(LearningReportRun.status == filters.status.value)
            if filters.triggered_by:
                query = query.where(LearningReportRun.triggered_by == filters.triggered_by)
            if filters.from_date:
                query = query.where(LearningReportRun.created_at >= filters.from_date)
            if filters.to_date:
                query = query.where(LearningReportRun.created_at <= filters.to_date)

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await self.db.execute(count_query)
        total = total_result.scalar() or 0

        # Apply pagination
        query = query.order_by(LearningReportRun.created_at.desc())
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await self.db.execute(query)
        runs = list(result.scalars().all())

        # Build response with details
        runs_with_details = []
        for run in runs:
            # Get report definition
            definition = await self.get_report_definition(run.report_definition_id)

            duration = None
            if run.started_at and run.completed_at:
                duration = int((run.completed_at - run.started_at).total_seconds())

            runs_with_details.append(ReportRunWithDetails(
                id=run.id,
                report_definition_id=run.report_definition_id,
                workspace_id=run.workspace_id,
                status=run.status,
                triggered_by=run.triggered_by,
                started_at=run.started_at,
                completed_at=run.completed_at,
                result_file_path=run.result_file_path,
                result_file_size_bytes=run.result_file_size_bytes,
                result_file_format=run.result_file_format,
                metrics_summary=run.metrics_summary,
                error_message=run.error_message,
                extra_data=run.extra_data,
                created_at=run.created_at,
                report_name=definition.name if definition else "",
                report_type=definition.report_type if definition else None,
                duration_seconds=duration,
            ))

        return runs_with_details, total
