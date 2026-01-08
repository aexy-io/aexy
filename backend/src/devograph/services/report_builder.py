"""Report builder service for custom reports and scheduling."""

from datetime import datetime, timedelta
from uuid import uuid4

from sqlalchemy import select, and_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.analytics import CustomReport, ScheduledReport
from aexy.schemas.analytics import (
    CustomReportCreate,
    CustomReportUpdate,
    CustomReportResponse,
    ScheduledReportCreate,
    ScheduledReportUpdate,
    ScheduledReportResponse,
    ReportTemplateResponse,
    WidgetConfig,
    WidgetType,
    MetricType,
    ScheduleFrequency,
    DeliveryMethod,
    DateRange,
)
from aexy.services.analytics_dashboard import AnalyticsDashboardService


# Default report templates
DEFAULT_TEMPLATES: list[dict] = [
    {
        "id": "template-weekly-team",
        "name": "Weekly Team Report",
        "description": "Weekly summary of team productivity, skill distribution, and collaboration",
        "category": "team",
        "widgets": [
            {
                "id": "w1",
                "type": WidgetType.LINE_CHART.value,
                "metric": MetricType.COMMITS.value,
                "title": "Weekly Commit Activity",
                "config": {"group_by": "day", "show_trend": True},
                "position": {"x": 0, "y": 0, "w": 6, "h": 4},
            },
            {
                "id": "w2",
                "type": WidgetType.BAR_CHART.value,
                "metric": MetricType.PRS_MERGED.value,
                "title": "Pull Requests Merged",
                "config": {"group_by": "developer"},
                "position": {"x": 6, "y": 0, "w": 6, "h": 4},
            },
            {
                "id": "w3",
                "type": WidgetType.HEATMAP.value,
                "metric": MetricType.SKILL_COVERAGE.value,
                "title": "Team Skill Distribution",
                "config": {"max_skills": 10},
                "position": {"x": 0, "y": 4, "w": 12, "h": 6},
            },
            {
                "id": "w4",
                "type": WidgetType.PIE_CHART.value,
                "metric": MetricType.WORKLOAD.value,
                "title": "Workload Distribution",
                "config": {},
                "position": {"x": 0, "y": 10, "w": 6, "h": 4},
            },
            {
                "id": "w5",
                "type": WidgetType.KPI.value,
                "metric": MetricType.VELOCITY.value,
                "title": "Team Velocity",
                "config": {"show_change": True, "compare_period": "previous_week"},
                "position": {"x": 6, "y": 10, "w": 6, "h": 4},
            },
        ],
        "filters": {"date_range": {"days": 7}},
        "layout": {"columns": 12, "row_height": 40},
    },
    {
        "id": "template-monthly-performance",
        "name": "Monthly Performance Report",
        "description": "Monthly overview of developer performance, growth, and code quality",
        "category": "performance",
        "widgets": [
            {
                "id": "w1",
                "type": WidgetType.LINE_CHART.value,
                "metric": MetricType.COMMITS.value,
                "title": "Monthly Commit Trends",
                "config": {"group_by": "week", "show_trend": True},
                "position": {"x": 0, "y": 0, "w": 6, "h": 4},
            },
            {
                "id": "w2",
                "type": WidgetType.LINE_CHART.value,
                "metric": MetricType.REVIEW_TURNAROUND.value,
                "title": "Review Turnaround Time",
                "config": {"group_by": "week"},
                "position": {"x": 6, "y": 0, "w": 6, "h": 4},
            },
            {
                "id": "w3",
                "type": WidgetType.BAR_CHART.value,
                "metric": MetricType.CODE_QUALITY.value,
                "title": "Code Quality Metrics",
                "config": {"metrics": ["complexity", "coverage", "issues"]},
                "position": {"x": 0, "y": 4, "w": 12, "h": 4},
            },
            {
                "id": "w4",
                "type": WidgetType.TABLE.value,
                "metric": MetricType.SKILL_GROWTH.value,
                "title": "Skill Growth Summary",
                "config": {"show_delta": True},
                "position": {"x": 0, "y": 8, "w": 6, "h": 5},
            },
            {
                "id": "w5",
                "type": WidgetType.NETWORK.value,
                "metric": MetricType.COLLABORATION.value,
                "title": "Collaboration Network",
                "config": {},
                "position": {"x": 6, "y": 8, "w": 6, "h": 5},
            },
        ],
        "filters": {"date_range": {"days": 30}},
        "layout": {"columns": 12, "row_height": 40},
    },
    {
        "id": "template-developer-profile",
        "name": "Developer Profile Report",
        "description": "Individual developer skills, activity, and growth trajectory",
        "category": "individual",
        "widgets": [
            {
                "id": "w1",
                "type": WidgetType.KPI.value,
                "metric": MetricType.COMMITS.value,
                "title": "Total Commits",
                "config": {"show_change": True},
                "position": {"x": 0, "y": 0, "w": 3, "h": 2},
            },
            {
                "id": "w2",
                "type": WidgetType.KPI.value,
                "metric": MetricType.PRS_MERGED.value,
                "title": "PRs Merged",
                "config": {"show_change": True},
                "position": {"x": 3, "y": 0, "w": 3, "h": 2},
            },
            {
                "id": "w3",
                "type": WidgetType.KPI.value,
                "metric": MetricType.REVIEWS_GIVEN.value,
                "title": "Reviews Given",
                "config": {"show_change": True},
                "position": {"x": 6, "y": 0, "w": 3, "h": 2},
            },
            {
                "id": "w4",
                "type": WidgetType.KPI.value,
                "metric": MetricType.VELOCITY.value,
                "title": "Velocity Score",
                "config": {},
                "position": {"x": 9, "y": 0, "w": 3, "h": 2},
            },
            {
                "id": "w5",
                "type": WidgetType.LINE_CHART.value,
                "metric": MetricType.ACTIVITY.value,
                "title": "Activity Over Time",
                "config": {"group_by": "week"},
                "position": {"x": 0, "y": 2, "w": 12, "h": 4},
            },
            {
                "id": "w6",
                "type": WidgetType.HEATMAP.value,
                "metric": MetricType.SKILL_COVERAGE.value,
                "title": "Skill Profile",
                "config": {},
                "position": {"x": 0, "y": 6, "w": 6, "h": 5},
            },
            {
                "id": "w7",
                "type": WidgetType.BAR_CHART.value,
                "metric": MetricType.SKILL_GROWTH.value,
                "title": "Recent Skill Growth",
                "config": {},
                "position": {"x": 6, "y": 6, "w": 6, "h": 5},
            },
        ],
        "filters": {"date_range": {"days": 90}},
        "layout": {"columns": 12, "row_height": 40},
    },
    {
        "id": "template-team-health",
        "name": "Team Health Dashboard",
        "description": "Team health metrics including workload, collaboration, and risk indicators",
        "category": "health",
        "widgets": [
            {
                "id": "w1",
                "type": WidgetType.GAUGE.value,
                "metric": MetricType.TEAM_HEALTH.value,
                "title": "Overall Team Health",
                "config": {"thresholds": {"low": 40, "medium": 70}},
                "position": {"x": 0, "y": 0, "w": 4, "h": 4},
            },
            {
                "id": "w2",
                "type": WidgetType.PIE_CHART.value,
                "metric": MetricType.WORKLOAD.value,
                "title": "Workload Distribution",
                "config": {},
                "position": {"x": 4, "y": 0, "w": 4, "h": 4},
            },
            {
                "id": "w3",
                "type": WidgetType.TABLE.value,
                "metric": MetricType.BUS_FACTOR.value,
                "title": "Bus Factor Risks",
                "config": {},
                "position": {"x": 8, "y": 0, "w": 4, "h": 4},
            },
            {
                "id": "w4",
                "type": WidgetType.NETWORK.value,
                "metric": MetricType.COLLABORATION.value,
                "title": "Collaboration Network",
                "config": {},
                "position": {"x": 0, "y": 4, "w": 6, "h": 5},
            },
            {
                "id": "w5",
                "type": WidgetType.TABLE.value,
                "metric": MetricType.ATTRITION_RISK.value,
                "title": "Attrition Risk Indicators",
                "config": {},
                "position": {"x": 6, "y": 4, "w": 6, "h": 5},
            },
        ],
        "filters": {"date_range": {"days": 30}},
        "layout": {"columns": 12, "row_height": 40},
    },
    {
        "id": "template-executive-summary",
        "name": "Executive Summary",
        "description": "High-level KPIs and trends for leadership reporting",
        "category": "executive",
        "widgets": [
            {
                "id": "w1",
                "type": WidgetType.KPI.value,
                "metric": MetricType.VELOCITY.value,
                "title": "Team Velocity",
                "config": {"show_change": True, "compare_period": "previous_month"},
                "position": {"x": 0, "y": 0, "w": 3, "h": 2},
            },
            {
                "id": "w2",
                "type": WidgetType.KPI.value,
                "metric": MetricType.CODE_QUALITY.value,
                "title": "Code Quality",
                "config": {"show_change": True},
                "position": {"x": 3, "y": 0, "w": 3, "h": 2},
            },
            {
                "id": "w3",
                "type": WidgetType.KPI.value,
                "metric": MetricType.TEAM_HEALTH.value,
                "title": "Team Health",
                "config": {"show_change": True},
                "position": {"x": 6, "y": 0, "w": 3, "h": 2},
            },
            {
                "id": "w4",
                "type": WidgetType.KPI.value,
                "metric": MetricType.SKILL_GROWTH.value,
                "title": "Skill Growth",
                "config": {"show_change": True},
                "position": {"x": 9, "y": 0, "w": 3, "h": 2},
            },
            {
                "id": "w5",
                "type": WidgetType.LINE_CHART.value,
                "metric": MetricType.VELOCITY.value,
                "title": "Velocity Trend",
                "config": {"group_by": "week", "show_trend": True},
                "position": {"x": 0, "y": 2, "w": 6, "h": 4},
            },
            {
                "id": "w6",
                "type": WidgetType.BAR_CHART.value,
                "metric": MetricType.COMMITS.value,
                "title": "Team Output",
                "config": {"group_by": "developer", "stacked": True},
                "position": {"x": 6, "y": 2, "w": 6, "h": 4},
            },
        ],
        "filters": {"date_range": {"days": 30}},
        "layout": {"columns": 12, "row_height": 40},
    },
]


class ReportBuilderService:
    """Service for custom report creation and management."""

    def __init__(self, analytics_service: AnalyticsDashboardService | None = None):
        self.analytics = analytics_service or AnalyticsDashboardService()

    # -------------------------------------------------------------------------
    # Report CRUD Operations
    # -------------------------------------------------------------------------

    async def create_report(
        self,
        creator_id: str,
        data: CustomReportCreate,
        db: AsyncSession,
    ) -> CustomReport:
        """Create a new custom report."""
        report = CustomReport(
            id=str(uuid4()),
            creator_id=creator_id,
            organization_id=data.organization_id,
            name=data.name,
            description=data.description,
            widgets=[w.model_dump() for w in data.widgets],
            filters=data.filters.model_dump() if data.filters else {},
            layout=data.layout or {"columns": 12, "row_height": 40},
            is_template=data.is_template,
            is_public=data.is_public,
        )
        db.add(report)
        await db.commit()
        await db.refresh(report)
        return report

    async def get_report(
        self,
        report_id: str,
        db: AsyncSession,
        user_id: str | None = None,
    ) -> CustomReport | None:
        """Get a report by ID, checking access permissions."""
        stmt = select(CustomReport).where(CustomReport.id == report_id)
        result = await db.execute(stmt)
        report = result.scalar_one_or_none()

        if report is None:
            return None

        # Check access: creator, public, or same organization
        if user_id and report.creator_id != user_id and not report.is_public:
            # Could add organization check here if needed
            return None

        return report

    async def list_reports(
        self,
        db: AsyncSession,
        creator_id: str | None = None,
        organization_id: str | None = None,
        include_public: bool = True,
        include_templates: bool = False,
    ) -> list[CustomReport]:
        """List reports with filters."""
        conditions = []

        if creator_id:
            if include_public:
                conditions.append(
                    (CustomReport.creator_id == creator_id) | (CustomReport.is_public == True)
                )
            else:
                conditions.append(CustomReport.creator_id == creator_id)

        if organization_id:
            conditions.append(CustomReport.organization_id == organization_id)

        if not include_templates:
            conditions.append(CustomReport.is_template == False)

        stmt = select(CustomReport)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        stmt = stmt.order_by(CustomReport.updated_at.desc())

        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def update_report(
        self,
        report_id: str,
        data: CustomReportUpdate,
        db: AsyncSession,
        user_id: str,
    ) -> CustomReport | None:
        """Update an existing report."""
        report = await self.get_report(report_id, db)
        if not report:
            return None

        # Only creator can update
        if report.creator_id != user_id:
            return None

        update_data = data.model_dump(exclude_unset=True)

        # Handle nested objects
        if "widgets" in update_data and update_data["widgets"] is not None:
            update_data["widgets"] = [
                w.model_dump() if hasattr(w, "model_dump") else w
                for w in update_data["widgets"]
            ]
        if "filters" in update_data and update_data["filters"] is not None:
            update_data["filters"] = (
                update_data["filters"].model_dump()
                if hasattr(update_data["filters"], "model_dump")
                else update_data["filters"]
            )

        for key, value in update_data.items():
            if value is not None:
                setattr(report, key, value)

        report.updated_at = datetime.utcnow()
        await db.commit()
        await db.refresh(report)
        return report

    async def delete_report(
        self,
        report_id: str,
        db: AsyncSession,
        user_id: str,
    ) -> bool:
        """Delete a report. Returns True if successful."""
        report = await self.get_report(report_id, db)
        if not report:
            return False

        # Only creator can delete
        if report.creator_id != user_id:
            return False

        await db.delete(report)
        await db.commit()
        return True

    async def clone_report(
        self,
        report_id: str,
        new_name: str,
        db: AsyncSession,
        user_id: str,
    ) -> CustomReport | None:
        """Clone an existing report."""
        original = await self.get_report(report_id, db, user_id)
        if not original:
            return None

        cloned = CustomReport(
            id=str(uuid4()),
            creator_id=user_id,
            organization_id=original.organization_id,
            name=new_name,
            description=f"Cloned from: {original.name}",
            widgets=original.widgets.copy(),
            filters=original.filters.copy(),
            layout=original.layout.copy(),
            is_template=False,
            is_public=False,
        )
        db.add(cloned)
        await db.commit()
        await db.refresh(cloned)
        return cloned

    # -------------------------------------------------------------------------
    # Template Operations
    # -------------------------------------------------------------------------

    def get_templates(self, category: str | None = None) -> list[ReportTemplateResponse]:
        """Get available report templates."""
        templates = []
        for template in DEFAULT_TEMPLATES:
            if category and template.get("category") != category:
                continue
            templates.append(
                ReportTemplateResponse(
                    id=template["id"],
                    name=template["name"],
                    description=template["description"],
                    category=template.get("category", "general"),
                    preview_widgets=[
                        WidgetConfig(**w) for w in template["widgets"][:3]
                    ],
                    widget_count=len(template["widgets"]),
                )
            )
        return templates

    async def create_from_template(
        self,
        template_id: str,
        creator_id: str,
        db: AsyncSession,
        name: str | None = None,
        organization_id: str | None = None,
    ) -> CustomReport | None:
        """Create a new report from a template."""
        template = next(
            (t for t in DEFAULT_TEMPLATES if t["id"] == template_id),
            None,
        )
        if not template:
            return None

        report = CustomReport(
            id=str(uuid4()),
            creator_id=creator_id,
            organization_id=organization_id,
            name=name or template["name"],
            description=template["description"],
            widgets=template["widgets"],
            filters=template["filters"],
            layout=template["layout"],
            is_template=False,
            is_public=False,
        )
        db.add(report)
        await db.commit()
        await db.refresh(report)
        return report

    # -------------------------------------------------------------------------
    # Widget Data Fetching
    # -------------------------------------------------------------------------

    async def get_widget_data(
        self,
        widget: WidgetConfig,
        db: AsyncSession,
        developer_ids: list[str] | None = None,
        date_range: DateRange | None = None,
    ) -> dict:
        """Fetch data for a specific widget configuration."""
        metric = widget.metric
        config = widget.config or {}

        # Determine date range
        if date_range is None:
            days = config.get("days", 30)
            date_range = DateRange(
                start_date=datetime.utcnow() - timedelta(days=days),
                end_date=datetime.utcnow(),
            )

        # Route to appropriate data fetcher based on metric
        if metric == MetricType.SKILL_COVERAGE:
            if not developer_ids:
                return {"error": "Developer IDs required for skill heatmap"}
            data = await self.analytics.generate_skill_heatmap(
                developer_ids=developer_ids,
                db=db,
                skills=config.get("skills"),
                max_skills=config.get("max_skills", 15),
            )
            return data.model_dump()

        elif metric == MetricType.ACTIVITY:
            if developer_ids and len(developer_ids) == 1:
                data = await self.analytics.generate_activity_heatmap(
                    developer_id=developer_ids[0],
                    db=db,
                    days=config.get("days", 365),
                )
                return data.model_dump()
            return {"error": "Single developer ID required for activity heatmap"}

        elif metric in [MetricType.COMMITS, MetricType.PRS_MERGED, MetricType.REVIEWS_GIVEN]:
            if not developer_ids:
                return {"error": "Developer IDs required for productivity trends"}
            data = await self.analytics.get_productivity_trends(
                developer_ids=developer_ids,
                db=db,
                date_range=date_range,
                group_by=config.get("group_by", "week"),
            )
            return data.model_dump()

        elif metric == MetricType.WORKLOAD:
            if not developer_ids:
                return {"error": "Developer IDs required for workload distribution"}
            data = await self.analytics.get_workload_distribution(
                developer_ids=developer_ids,
                db=db,
                days=config.get("days", 30),
            )
            return data.model_dump()

        elif metric == MetricType.COLLABORATION:
            if not developer_ids:
                return {"error": "Developer IDs required for collaboration network"}
            data = await self.analytics.get_collaboration_network(
                developer_ids=developer_ids,
                db=db,
                days=config.get("days", 90),
            )
            return data.model_dump()

        elif metric == MetricType.VELOCITY:
            # Aggregate productivity metric
            if not developer_ids:
                return {"error": "Developer IDs required"}
            data = await self.analytics.get_productivity_trends(
                developer_ids=developer_ids,
                db=db,
                date_range=date_range,
                group_by=config.get("group_by", "week"),
            )
            # Calculate velocity from productivity data
            total_commits = sum(sum(p.commits) for p in data.developer_trends)
            total_prs = sum(sum(p.prs_merged) for p in data.developer_trends)
            return {
                "velocity_score": total_commits + (total_prs * 3),
                "commits": total_commits,
                "prs_merged": total_prs,
                "trend": data.overall_trend,
            }

        elif metric == MetricType.SKILL_GROWTH:
            # Would integrate with skill fingerprint history
            return {
                "message": "Skill growth data requires historical fingerprint comparison",
                "skills": [],
            }

        elif metric == MetricType.CODE_QUALITY:
            # Would integrate with code quality metrics
            return {
                "message": "Code quality data requires integration with linters/analyzers",
                "metrics": {},
            }

        elif metric in [MetricType.TEAM_HEALTH, MetricType.BUS_FACTOR, MetricType.ATTRITION_RISK]:
            # These require PredictiveAnalyticsService
            return {
                "message": f"{metric.value} requires predictive analytics service",
                "requires": "PredictiveAnalyticsService",
            }

        else:
            return {"error": f"Unknown metric type: {metric}"}

    async def get_report_data(
        self,
        report_id: str,
        db: AsyncSession,
        user_id: str,
        developer_ids: list[str] | None = None,
        date_range: DateRange | None = None,
    ) -> dict:
        """Fetch all widget data for a report."""
        report = await self.get_report(report_id, db, user_id)
        if not report:
            return {"error": "Report not found or access denied"}

        # Apply report filters if no overrides provided
        if date_range is None and report.filters:
            filter_range = report.filters.get("date_range", {})
            if "days" in filter_range:
                date_range = DateRange(
                    start_date=datetime.utcnow() - timedelta(days=filter_range["days"]),
                    end_date=datetime.utcnow(),
                )
            elif "start_date" in filter_range and "end_date" in filter_range:
                date_range = DateRange(
                    start_date=datetime.fromisoformat(filter_range["start_date"]),
                    end_date=datetime.fromisoformat(filter_range["end_date"]),
                )

        if developer_ids is None:
            developer_ids = report.filters.get("developer_ids", [])

        # Fetch data for each widget
        widget_data = {}
        for widget_dict in report.widgets:
            widget = WidgetConfig(**widget_dict)
            try:
                data = await self.get_widget_data(
                    widget=widget,
                    db=db,
                    developer_ids=developer_ids,
                    date_range=date_range,
                )
                widget_data[widget.id] = {
                    "title": widget.title,
                    "type": widget.type,
                    "data": data,
                }
            except Exception as e:
                widget_data[widget.id] = {
                    "title": widget.title,
                    "type": widget.type,
                    "error": str(e),
                }

        return {
            "report_id": report_id,
            "report_name": report.name,
            "generated_at": datetime.utcnow().isoformat(),
            "date_range": date_range.model_dump() if date_range else None,
            "widgets": widget_data,
        }

    # -------------------------------------------------------------------------
    # Schedule Operations
    # -------------------------------------------------------------------------

    async def create_schedule(
        self,
        report_id: str,
        data: ScheduledReportCreate,
        db: AsyncSession,
        user_id: str,
    ) -> ScheduledReport | None:
        """Create a scheduled report."""
        # Verify report exists and user has access
        report = await self.get_report(report_id, db, user_id)
        if not report:
            return None

        # Calculate next run time
        next_run = self._calculate_next_run(
            frequency=data.schedule,
            time_utc=data.time_utc,
            day_of_week=data.day_of_week,
            day_of_month=data.day_of_month,
        )

        schedule = ScheduledReport(
            id=str(uuid4()),
            report_id=report_id,
            schedule=data.schedule.value,
            day_of_week=data.day_of_week,
            day_of_month=data.day_of_month,
            time_utc=data.time_utc,
            recipients=data.recipients,
            delivery_method=data.delivery_method.value,
            export_format=data.export_format.value,
            is_active=True,
            next_run_at=next_run,
        )
        db.add(schedule)
        await db.commit()
        await db.refresh(schedule)
        return schedule

    async def get_schedule(
        self,
        schedule_id: str,
        db: AsyncSession,
    ) -> ScheduledReport | None:
        """Get a schedule by ID."""
        stmt = select(ScheduledReport).where(ScheduledReport.id == schedule_id)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def list_schedules(
        self,
        db: AsyncSession,
        report_id: str | None = None,
        active_only: bool = True,
    ) -> list[ScheduledReport]:
        """List scheduled reports."""
        conditions = []
        if report_id:
            conditions.append(ScheduledReport.report_id == report_id)
        if active_only:
            conditions.append(ScheduledReport.is_active == True)

        stmt = select(ScheduledReport)
        if conditions:
            stmt = stmt.where(and_(*conditions))
        stmt = stmt.order_by(ScheduledReport.next_run_at)

        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def update_schedule(
        self,
        schedule_id: str,
        data: ScheduledReportUpdate,
        db: AsyncSession,
    ) -> ScheduledReport | None:
        """Update a scheduled report."""
        schedule = await self.get_schedule(schedule_id, db)
        if not schedule:
            return None

        update_data = data.model_dump(exclude_unset=True)

        # Convert enums to values
        if "schedule" in update_data and update_data["schedule"] is not None:
            update_data["schedule"] = update_data["schedule"].value
        if "delivery_method" in update_data and update_data["delivery_method"] is not None:
            update_data["delivery_method"] = update_data["delivery_method"].value
        if "export_format" in update_data and update_data["export_format"] is not None:
            update_data["export_format"] = update_data["export_format"].value

        for key, value in update_data.items():
            if value is not None:
                setattr(schedule, key, value)

        # Recalculate next run if schedule changed
        if any(k in update_data for k in ["schedule", "time_utc", "day_of_week", "day_of_month"]):
            schedule.next_run_at = self._calculate_next_run(
                frequency=ScheduleFrequency(schedule.schedule),
                time_utc=schedule.time_utc,
                day_of_week=schedule.day_of_week,
                day_of_month=schedule.day_of_month,
            )

        await db.commit()
        await db.refresh(schedule)
        return schedule

    async def delete_schedule(
        self,
        schedule_id: str,
        db: AsyncSession,
    ) -> bool:
        """Delete a scheduled report."""
        schedule = await self.get_schedule(schedule_id, db)
        if not schedule:
            return False

        await db.delete(schedule)
        await db.commit()
        return True

    async def get_due_schedules(
        self,
        db: AsyncSession,
    ) -> list[ScheduledReport]:
        """Get schedules that are due to run."""
        now = datetime.utcnow()
        stmt = select(ScheduledReport).where(
            and_(
                ScheduledReport.is_active == True,
                ScheduledReport.next_run_at <= now,
            )
        )
        result = await db.execute(stmt)
        return list(result.scalars().all())

    async def mark_schedule_run(
        self,
        schedule_id: str,
        db: AsyncSession,
    ) -> ScheduledReport | None:
        """Mark a schedule as run and calculate next run time."""
        schedule = await self.get_schedule(schedule_id, db)
        if not schedule:
            return None

        schedule.last_sent_at = datetime.utcnow()
        schedule.next_run_at = self._calculate_next_run(
            frequency=ScheduleFrequency(schedule.schedule),
            time_utc=schedule.time_utc,
            day_of_week=schedule.day_of_week,
            day_of_month=schedule.day_of_month,
        )

        await db.commit()
        await db.refresh(schedule)
        return schedule

    def _calculate_next_run(
        self,
        frequency: ScheduleFrequency,
        time_utc: str,
        day_of_week: int | None = None,
        day_of_month: int | None = None,
    ) -> datetime:
        """Calculate the next run time for a schedule."""
        now = datetime.utcnow()
        hour, minute = map(int, time_utc.split(":"))

        if frequency == ScheduleFrequency.DAILY:
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)

        elif frequency == ScheduleFrequency.WEEKLY:
            target_day = day_of_week or 0  # Default to Monday
            days_ahead = target_day - now.weekday()
            if days_ahead < 0:
                days_ahead += 7
            next_run = now + timedelta(days=days_ahead)
            next_run = next_run.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(weeks=1)

        elif frequency == ScheduleFrequency.MONTHLY:
            target_day = day_of_month or 1
            # Try this month first
            try:
                next_run = now.replace(day=target_day, hour=hour, minute=minute, second=0, microsecond=0)
            except ValueError:
                # Day doesn't exist in this month, use last day
                import calendar
                last_day = calendar.monthrange(now.year, now.month)[1]
                next_run = now.replace(day=last_day, hour=hour, minute=minute, second=0, microsecond=0)

            if next_run <= now:
                # Move to next month
                if now.month == 12:
                    next_run = next_run.replace(year=now.year + 1, month=1)
                else:
                    next_run = next_run.replace(month=now.month + 1)
                try:
                    next_run = next_run.replace(day=target_day)
                except ValueError:
                    import calendar
                    last_day = calendar.monthrange(next_run.year, next_run.month)[1]
                    next_run = next_run.replace(day=last_day)

        else:
            # Default to daily
            next_run = now.replace(hour=hour, minute=minute, second=0, microsecond=0)
            if next_run <= now:
                next_run += timedelta(days=1)

        return next_run


# Convenience function
def get_report_builder_service(
    analytics_service: AnalyticsDashboardService | None = None,
) -> ReportBuilderService:
    """Get an instance of the report builder service."""
    return ReportBuilderService(analytics_service=analytics_service)
