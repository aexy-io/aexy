"""Predictive Analytics Service for LLM-powered risk analysis and predictions."""

import json
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy import select, func, and_
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.llm.base import AnalysisRequest, AnalysisType
from aexy.llm.gateway import LLMGateway
from aexy.llm.prompts import (
    ATTRITION_RISK_SYSTEM_PROMPT,
    ATTRITION_RISK_PROMPT,
    BURNOUT_RISK_SYSTEM_PROMPT,
    BURNOUT_RISK_PROMPT,
    PERFORMANCE_TRAJECTORY_SYSTEM_PROMPT,
    PERFORMANCE_TRAJECTORY_PROMPT,
    TEAM_HEALTH_SYSTEM_PROMPT,
    TEAM_HEALTH_PROMPT,
)
from aexy.models.activity import Commit, PullRequest, CodeReview
from aexy.models.analytics import PredictiveInsight
from aexy.models.developer import Developer
from aexy.schemas.analytics import (
    AttritionRiskAnalysis,
    BurnoutRiskAssessment,
    PerformanceTrajectory,
    TeamHealthAnalysis,
    RiskLevel,
    Trajectory,
    HealthGrade,
    RiskFactor,
    SkillGrowthPrediction,
    CareerReadiness,
    TeamRisk,
    CapacityAssessment,
)


class PredictiveAnalyticsService:
    """Service for LLM-powered predictive analytics."""

    def __init__(self, llm_gateway: LLMGateway):
        self.llm = llm_gateway

    async def analyze_attrition_risk(
        self,
        developer_id: str,
        db: AsyncSession,
        days: int = 90,
        use_cache: bool = True,
    ) -> AttritionRiskAnalysis:
        """Analyze attrition risk for a developer.

        Args:
            developer_id: Developer ID
            db: Database session
            days: Analysis window in days
            use_cache: Whether to use cached results if available

        Returns:
            AttritionRiskAnalysis with risk score and factors
        """
        # Check cache first
        if use_cache:
            cached = await self.get_cached_insight(
                developer_id=developer_id,
                team_id=None,
                insight_type="attrition_risk",
                db=db,
            )
            if cached and cached.raw_analysis:
                analysis = cached.raw_analysis
                return AttritionRiskAnalysis(
                    developer_id=developer_id,
                    risk_score=analysis.get("risk_score", 0.0),
                    confidence=analysis.get("confidence", 0.0),
                    risk_level=RiskLevel(analysis.get("risk_level", "low")),
                    factors=[
                        RiskFactor(
                            factor=f.get("factor", ""),
                            weight=f.get("weight", 0.0),
                            evidence=f.get("evidence", ""),
                            trend=f.get("trend"),
                        )
                        for f in analysis.get("factors", [])
                    ],
                    positive_signals=analysis.get("positive_signals", []),
                    recommendations=analysis.get("recommendations", []),
                    suggested_actions=analysis.get("suggested_actions", []),
                    analyzed_at=cached.generated_at,
                )

        # Get developer
        dev_stmt = select(Developer).where(Developer.id == developer_id)
        result = await db.execute(dev_stmt)
        developer = result.scalar_one_or_none()

        if not developer:
            raise ValueError(f"Developer {developer_id} not found")

        # Gather activity metrics
        current_end = datetime.now(timezone.utc)
        current_start = current_end - timedelta(days=days)
        baseline_end = current_start
        baseline_start = baseline_end - timedelta(days=days)

        # Current period metrics
        current_metrics = await self._get_activity_metrics(
            developer_id, current_start, current_end, db
        )
        baseline_metrics = await self._get_activity_metrics(
            developer_id, baseline_start, baseline_end, db
        )

        # Calculate trends
        commit_trend = self._calculate_trend(
            current_metrics["commits"], baseline_metrics["commits"]
        )
        pr_trend = self._calculate_trend(
            current_metrics["prs"], baseline_metrics["prs"]
        )
        review_trend = self._calculate_trend(
            current_metrics["reviews"], baseline_metrics["reviews"]
        )

        # Work patterns
        work_patterns = developer.work_patterns or {}
        fingerprint = developer.skill_fingerprint or {}

        # Calculate tenure (estimate from first commit)
        first_commit_stmt = (
            select(func.min(Commit.committed_at))
            .where(Commit.developer_id == developer_id)
        )
        first_commit = (await db.execute(first_commit_stmt)).scalar()
        tenure = "Unknown"
        if first_commit:
            tenure_days = (datetime.now(timezone.utc) - first_commit).days
            tenure = f"{tenure_days // 30} months"

        # Build prompt
        prompt = ATTRITION_RISK_PROMPT.format(
            developer_name=developer.name or developer.email,
            tenure=tenure,
            skills=", ".join([l.get("name", "") for l in fingerprint.get("languages", [])[:5]]),
            role_level=work_patterns.get("preferred_complexity", "unknown"),
            commit_trend=commit_trend,
            pr_trend=pr_trend,
            review_trend=review_trend,
            hours_pattern=work_patterns.get("peak_productivity_hours", "unknown"),
            collab_changes=work_patterns.get("collaboration_style", "unknown"),
            baseline_metrics=json.dumps(baseline_metrics, indent=2),
            preferred_complexity=work_patterns.get("preferred_complexity", "medium"),
            collaboration_style=work_patterns.get("collaboration_style", "balanced"),
            peak_hours=work_patterns.get("peak_productivity_hours", "9-17"),
        )

        # Call LLM
        request = AnalysisRequest(
            content=prompt,
            analysis_type=AnalysisType.ATTRITION_RISK,
            context={"developer_id": developer_id},
        )
        llm_result = await self.llm.analyze(request, system_prompt=ATTRITION_RISK_SYSTEM_PROMPT)

        # Parse response
        try:
            analysis = json.loads(llm_result.raw_response)
        except json.JSONDecodeError:
            analysis = {
                "risk_score": 0.3,
                "confidence": 0.5,
                "risk_level": "low",
                "factors": [],
                "positive_signals": [],
                "recommendations": ["Unable to parse LLM response"],
                "suggested_actions": [],
            }

        # Store insight
        insight = PredictiveInsight(
            developer_id=developer_id,
            insight_type="attrition_risk",
            risk_score=analysis.get("risk_score", 0.0),
            confidence=analysis.get("confidence", 0.0),
            risk_level=analysis.get("risk_level"),
            factors=analysis.get("factors", []),
            recommendations=analysis.get("recommendations", []),
            raw_analysis=analysis,
            data_window_days=days,
            generated_by_model=self.llm.get_model_name(),
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db.add(insight)
        await db.commit()

        return AttritionRiskAnalysis(
            developer_id=developer_id,
            risk_score=analysis.get("risk_score", 0.0),
            confidence=analysis.get("confidence", 0.0),
            risk_level=RiskLevel(analysis.get("risk_level", "low")),
            factors=[
                RiskFactor(
                    factor=f.get("factor", ""),
                    weight=f.get("weight", 0.0),
                    evidence=f.get("evidence", ""),
                    trend=f.get("trend"),
                )
                for f in analysis.get("factors", [])
            ],
            positive_signals=analysis.get("positive_signals", []),
            recommendations=analysis.get("recommendations", []),
            suggested_actions=analysis.get("suggested_actions", []),
            analyzed_at=datetime.now(timezone.utc),
        )

    async def assess_burnout_risk(
        self,
        developer_id: str,
        db: AsyncSession,
        days: int = 30,
        use_cache: bool = True,
    ) -> BurnoutRiskAssessment:
        """Assess burnout risk for a developer.

        Args:
            developer_id: Developer ID
            db: Database session
            days: Analysis window in days
            use_cache: Whether to use cached results if available

        Returns:
            BurnoutRiskAssessment with risk indicators
        """
        # Check cache first
        if use_cache:
            cached = await self.get_cached_insight(
                developer_id=developer_id,
                team_id=None,
                insight_type="burnout_risk",
                db=db,
            )
            if cached and cached.raw_analysis:
                analysis = cached.raw_analysis
                return BurnoutRiskAssessment(
                    developer_id=developer_id,
                    risk_score=analysis.get("risk_score", 0.0),
                    confidence=analysis.get("confidence", 0.0),
                    risk_level=RiskLevel(analysis.get("risk_level", "low")),
                    indicators=analysis.get("indicators", []),
                    factors=[
                        RiskFactor(
                            factor=f.get("factor", ""),
                            weight=f.get("weight", 0.0),
                            evidence=f.get("evidence", ""),
                            trend=f.get("trend"),
                        )
                        for f in analysis.get("factors", [])
                    ],
                    recommendations=analysis.get("recommendations", []),
                    analyzed_at=cached.generated_at,
                )

        # Get developer
        dev_stmt = select(Developer).where(Developer.id == developer_id)
        result = await db.execute(dev_stmt)
        developer = result.scalar_one_or_none()

        if not developer:
            raise ValueError(f"Developer {developer_id} not found")

        end_date = datetime.now(timezone.utc)
        start_date = end_date - timedelta(days=days)

        # Get commit patterns
        commit_stmt = (
            select(Commit.committed_at)
            .where(
                and_(
                    Commit.developer_id == developer_id,
                    Commit.committed_at >= start_date,
                    Commit.committed_at <= end_date,
                )
            )
        )
        result = await db.execute(commit_stmt)
        commit_times = [row[0] for row in result]

        # Calculate work patterns
        weekend_commits = sum(1 for t in commit_times if t.weekday() >= 5)
        after_hours = sum(1 for t in commit_times if t.hour < 9 or t.hour > 18)

        avg_daily = len(commit_times) / days if days > 0 else 0
        weekend_pct = (weekend_commits / len(commit_times) * 100) if commit_times else 0
        after_hours_pct = (after_hours / len(commit_times) * 100) if commit_times else 0

        # Get active PRs
        active_prs_stmt = (
            select(func.count(PullRequest.id))
            .where(
                and_(
                    PullRequest.developer_id == developer_id,
                    PullRequest.state == "open",
                )
            )
        )
        active_prs = (await db.execute(active_prs_stmt)).scalar() or 0

        # Get pending reviews
        pending_reviews_stmt = (
            select(func.count(CodeReview.id))
            .where(
                and_(
                    CodeReview.developer_id == developer_id,
                    CodeReview.state == "pending",
                )
            )
        )
        pending_reviews = (await db.execute(pending_reviews_stmt)).scalar() or 0

        # Build prompt
        prompt = BURNOUT_RISK_PROMPT.format(
            developer_name=developer.name or developer.email,
            days=days,
            avg_daily_commits=f"{avg_daily:.1f}",
            weekend_work_pct=f"{weekend_pct:.1f}%",
            after_hours_pct=f"{after_hours_pct:.1f}%",
            longest_streak="N/A",  # Would need more complex calculation
            avg_pr_size=(developer.work_patterns or {}).get("average_pr_size", "N/A"),
            review_turnaround="N/A",
            active_prs=active_prs,
            pending_reviews=pending_reviews,
            velocity="normal",
            activity_change="stable",
            collab_changes="stable",
        )

        # Call LLM
        request = AnalysisRequest(
            content=prompt,
            analysis_type=AnalysisType.BURNOUT_RISK,
            context={"developer_id": developer_id},
        )
        llm_result = await self.llm.analyze(request, system_prompt=BURNOUT_RISK_SYSTEM_PROMPT)

        # Parse response
        try:
            analysis = json.loads(llm_result.raw_response)
        except json.JSONDecodeError:
            analysis = {
                "risk_score": 0.2,
                "confidence": 0.5,
                "risk_level": "low",
                "indicators": [],
                "factors": [],
                "recommendations": ["Unable to parse LLM response"],
                "immediate_actions": [],
            }

        # Store insight
        insight = PredictiveInsight(
            developer_id=developer_id,
            insight_type="burnout_risk",
            risk_score=analysis.get("risk_score", 0.0),
            confidence=analysis.get("confidence", 0.0),
            risk_level=analysis.get("risk_level"),
            factors=analysis.get("factors", []),
            recommendations=analysis.get("recommendations", []),
            raw_analysis=analysis,
            data_window_days=days,
            generated_by_model=self.llm.get_model_name(),
            expires_at=datetime.now(timezone.utc) + timedelta(days=3),
        )
        db.add(insight)
        await db.commit()

        return BurnoutRiskAssessment(
            developer_id=developer_id,
            risk_score=analysis.get("risk_score", 0.0),
            confidence=analysis.get("confidence", 0.0),
            risk_level=RiskLevel(analysis.get("risk_level", "low")),
            indicators=analysis.get("indicators", []),
            factors=[
                RiskFactor(
                    factor=f.get("factor", ""),
                    weight=f.get("weight", 0.0),
                    evidence=f.get("evidence", ""),
                    trend=f.get("trend"),
                )
                for f in analysis.get("factors", [])
            ],
            recommendations=analysis.get("recommendations", []),
            analyzed_at=datetime.now(timezone.utc),
        )

    async def predict_performance_trajectory(
        self,
        developer_id: str,
        db: AsyncSession,
        months: int = 6,
        use_cache: bool = True,
    ) -> PerformanceTrajectory:
        """Predict performance trajectory for a developer.

        Args:
            developer_id: Developer ID
            db: Database session
            months: Prediction horizon in months
            use_cache: Whether to use cached results if available

        Returns:
            PerformanceTrajectory with growth predictions
        """
        # Check cache first
        if use_cache:
            cached = await self.get_cached_insight(
                developer_id=developer_id,
                team_id=None,
                insight_type="performance_trajectory",
                db=db,
            )
            if cached and cached.raw_analysis:
                analysis = cached.raw_analysis
                career = analysis.get("career_readiness", {})
                return PerformanceTrajectory(
                    developer_id=developer_id,
                    trajectory=Trajectory(analysis.get("trajectory", "steady")),
                    confidence=analysis.get("confidence", 0.0),
                    predicted_growth=[
                        SkillGrowthPrediction(
                            skill=g.get("skill", ""),
                            current=g.get("current", 0),
                            predicted=g.get("predicted", 0),
                            timeline=g.get("timeline", "6 months"),
                        )
                        for g in analysis.get("predicted_growth", [])
                    ],
                    challenges=analysis.get("challenges", []),
                    opportunities=analysis.get("opportunities", []),
                    career_readiness=CareerReadiness(
                        next_level=career.get("next_level", ""),
                        readiness_score=career.get("readiness_score", 0.0),
                        blockers=career.get("blockers", []),
                    ),
                    recommendations=analysis.get("recommendations", []),
                    analyzed_at=cached.generated_at,
                )

        # Get developer
        dev_stmt = select(Developer).where(Developer.id == developer_id)
        result = await db.execute(dev_stmt)
        developer = result.scalar_one_or_none()

        if not developer:
            raise ValueError(f"Developer {developer_id} not found")

        fingerprint = developer.skill_fingerprint or {}
        work_patterns = developer.work_patterns or {}
        growth_trajectory = developer.growth_trajectory or {}

        # Extract skill info
        languages = fingerprint.get("languages", [])
        primary_skills = ", ".join([l.get("name", "") for l in languages[:5]])

        # Get learning path if exists
        from aexy.models.career import LearningPath
        lp_stmt = (
            select(LearningPath)
            .where(
                and_(
                    LearningPath.developer_id == developer_id,
                    LearningPath.status == "active",
                )
            )
            .limit(1)
        )
        lp_result = await db.execute(lp_stmt)
        learning_path = lp_result.scalar_one_or_none()

        lp_info = "No active learning path"
        if learning_path:
            lp_info = f"Target: {learning_path.target_role_id}, Progress: {learning_path.progress_percentage}%"

        # Build prompt
        prompt = PERFORMANCE_TRAJECTORY_PROMPT.format(
            months=months,
            developer_name=developer.name or developer.email,
            current_level=work_patterns.get("preferred_complexity", "mid"),
            tenure="N/A",
            primary_skills=primary_skills,
            skills_acquired=", ".join(growth_trajectory.get("skills_acquired_6m", [])),
            learning_velocity=growth_trajectory.get("learning_velocity", 0.5),
            complexity_trend="stable",
            domain_growth=", ".join([d.get("name", "") for d in fingerprint.get("domains", [])[:3]]),
            learning_path=lp_info,
            code_quality_trend="stable",
            review_quality="good",
            mentoring_activity="moderate",
            project_impact="moderate",
            team_size="N/A",
            potential_growth_areas=", ".join(growth_trajectory.get("declining_skills", [])),
        )

        # Call LLM
        request = AnalysisRequest(
            content=prompt,
            analysis_type=AnalysisType.PERFORMANCE_TRAJECTORY,
            context={"developer_id": developer_id},
        )
        llm_result = await self.llm.analyze(request, system_prompt=PERFORMANCE_TRAJECTORY_SYSTEM_PROMPT)

        # Parse response
        try:
            analysis = json.loads(llm_result.raw_response)
        except json.JSONDecodeError:
            analysis = {
                "trajectory": "steady",
                "confidence": 0.5,
                "predicted_growth": [],
                "challenges": [],
                "opportunities": [],
                "career_readiness": {
                    "next_level": "Senior",
                    "readiness_score": 0.5,
                    "blockers": [],
                    "accelerators": [],
                },
                "recommendations": ["Unable to parse LLM response"],
            }

        # Store insight
        insight = PredictiveInsight(
            developer_id=developer_id,
            insight_type="performance_trajectory",
            risk_score=1.0 - analysis.get("career_readiness", {}).get("readiness_score", 0.5),
            confidence=analysis.get("confidence", 0.0),
            factors=[{"trajectory": analysis.get("trajectory", "steady")}],
            recommendations=analysis.get("recommendations", []),
            raw_analysis=analysis,
            data_window_days=months * 30,
            generated_by_model=self.llm.get_model_name(),
            expires_at=datetime.now(timezone.utc) + timedelta(days=14),
        )
        db.add(insight)
        await db.commit()

        career = analysis.get("career_readiness", {})

        return PerformanceTrajectory(
            developer_id=developer_id,
            trajectory=Trajectory(analysis.get("trajectory", "steady")),
            confidence=analysis.get("confidence", 0.0),
            predicted_growth=[
                SkillGrowthPrediction(
                    skill=g.get("skill", ""),
                    current=g.get("current", 0),
                    predicted=g.get("predicted", 0),
                    timeline=g.get("timeline", "6 months"),
                )
                for g in analysis.get("predicted_growth", [])
            ],
            challenges=analysis.get("challenges", []),
            opportunities=analysis.get("opportunities", []),
            career_readiness=CareerReadiness(
                next_level=career.get("next_level", ""),
                readiness_score=career.get("readiness_score", 0.0),
                blockers=career.get("blockers", []),
            ),
            recommendations=analysis.get("recommendations", []),
            analyzed_at=datetime.now(timezone.utc),
        )

    async def analyze_team_health(
        self,
        developer_ids: list[str],
        db: AsyncSession,
        team_id: str | None = None,
        use_cache: bool = True,
    ) -> TeamHealthAnalysis:
        """Analyze overall team health.

        Args:
            developer_ids: List of developer IDs in the team
            db: Database session
            team_id: Optional team identifier
            use_cache: Whether to use cached results if available

        Returns:
            TeamHealthAnalysis with health score and insights
        """
        # Check cache first
        if use_cache and team_id:
            cached = await self.get_cached_insight(
                developer_id=None,
                team_id=team_id,
                insight_type="team_health",
                db=db,
            )
            if cached and cached.raw_analysis:
                analysis = cached.raw_analysis
                capacity = analysis.get("capacity_assessment", {})
                return TeamHealthAnalysis(
                    team_id=team_id,
                    health_score=analysis.get("health_score", 0.7),
                    health_grade=HealthGrade(analysis.get("health_grade", "B")),
                    strengths=analysis.get("strengths", []),
                    risks=[
                        TeamRisk(
                            risk=r.get("risk", ""),
                            severity=RiskLevel(r.get("severity", "low")),
                            mitigation=r.get("mitigation", ""),
                        )
                        for r in analysis.get("risks", [])
                    ],
                    capacity_assessment=CapacityAssessment(
                        current_utilization=capacity.get("current_utilization", 0.5),
                        sustainable_velocity=capacity.get("sustainable_velocity", True),
                        bottlenecks=capacity.get("bottlenecks", []),
                    ),
                    recommendations=analysis.get("recommendations", []),
                    suggested_hires=analysis.get("suggested_hires", []),
                    analyzed_at=cached.generated_at,
                )

        # Get developers
        dev_stmt = select(Developer).where(Developer.id.in_(developer_ids))
        result = await db.execute(dev_stmt)
        developers = list(result.scalars().all())

        # Build team composition
        team_members = ", ".join([d.name or d.email for d in developers[:10]])

        # Aggregate skills
        all_skills: dict[str, int] = {}
        for dev in developers:
            fingerprint = dev.skill_fingerprint or {}
            for lang in fingerprint.get("languages", []):
                name = lang.get("name", "")
                if name:
                    all_skills[name] = all_skills.get(name, 0) + 1

        skill_coverage = "\n".join([
            f"- {skill}: {count}/{len(developers)} developers"
            for skill, count in sorted(all_skills.items(), key=lambda x: -x[1])[:10]
        ])

        # Identify bus factors (skills with only 1 developer)
        bus_factors = [skill for skill, count in all_skills.items() if count == 1]

        # Get workload distribution
        from aexy.services.analytics_dashboard import AnalyticsDashboardService
        analytics = AnalyticsDashboardService()
        workload = await analytics.get_workload_distribution(developer_ids, db)

        workload_dist = f"Average: {workload.average_workload:.2f}, Imbalance: {workload.imbalance_score:.2f}"

        # Get collaboration
        collab = await analytics.get_collaboration_network(developer_ids, db)
        collab_patterns = f"Density: {collab.density:.2f}, Edges: {len(collab.edges)}"

        # Build prompt
        prompt = TEAM_HEALTH_PROMPT.format(
            team_size=len(developers),
            team_members=team_members,
            avg_tenure="N/A",
            seniority_dist="N/A",
            skill_coverage=skill_coverage,
            bus_factors=", ".join(bus_factors[:5]) or "None identified",
            workload_dist=workload_dist,
            collab_patterns=collab_patterns,
            velocity_trend="stable",
            quality_trend="stable",
            collab_density=f"{collab.density:.2f}",
            recent_departures="0",
            new_joiners="0",
        )

        # Call LLM
        request = AnalysisRequest(
            content=prompt,
            analysis_type=AnalysisType.TEAM_HEALTH,
            context={"team_id": team_id, "developer_ids": developer_ids},
        )
        llm_result = await self.llm.analyze(request, system_prompt=TEAM_HEALTH_SYSTEM_PROMPT)

        # Parse response
        try:
            analysis = json.loads(llm_result.raw_response)
        except json.JSONDecodeError:
            analysis = {
                "health_score": 0.7,
                "health_grade": "B",
                "strengths": [],
                "risks": [],
                "capacity_assessment": {
                    "current_utilization": 0.5,
                    "sustainable_velocity": True,
                    "bottlenecks": [],
                },
                "recommendations": ["Unable to parse LLM response"],
                "suggested_hires": [],
            }

        # Store insight
        insight = PredictiveInsight(
            team_id=team_id,
            insight_type="team_health",
            risk_score=1.0 - analysis.get("health_score", 0.7),
            confidence=0.7,
            factors=[{"grade": analysis.get("health_grade", "B")}],
            recommendations=analysis.get("recommendations", []),
            raw_analysis=analysis,
            data_window_days=30,
            generated_by_model=self.llm.get_model_name(),
            expires_at=datetime.now(timezone.utc) + timedelta(days=7),
        )
        db.add(insight)
        await db.commit()

        capacity = analysis.get("capacity_assessment", {})

        return TeamHealthAnalysis(
            team_id=team_id,
            health_score=analysis.get("health_score", 0.7),
            health_grade=HealthGrade(analysis.get("health_grade", "B")),
            strengths=analysis.get("strengths", []),
            risks=[
                TeamRisk(
                    risk=r.get("risk", ""),
                    severity=RiskLevel(r.get("severity", "low")),
                    mitigation=r.get("mitigation", ""),
                )
                for r in analysis.get("risks", [])
            ],
            capacity_assessment=CapacityAssessment(
                current_utilization=capacity.get("current_utilization", 0.5),
                sustainable_velocity=capacity.get("sustainable_velocity", True),
                bottlenecks=capacity.get("bottlenecks", []),
            ),
            recommendations=analysis.get("recommendations", []),
            suggested_hires=analysis.get("suggested_hires", []),
            analyzed_at=datetime.now(timezone.utc),
        )

    async def get_cached_insight(
        self,
        developer_id: str | None,
        team_id: str | None,
        insight_type: str,
        db: AsyncSession,
    ) -> PredictiveInsight | None:
        """Get a cached predictive insight if still valid.

        Args:
            developer_id: Developer ID (optional)
            team_id: Team ID (optional)
            insight_type: Type of insight
            db: Database session

        Returns:
            Cached insight if valid, None otherwise
        """
        stmt = select(PredictiveInsight).where(
            and_(
                PredictiveInsight.insight_type == insight_type,
                PredictiveInsight.expires_at > datetime.now(timezone.utc),
            )
        )

        if developer_id:
            stmt = stmt.where(PredictiveInsight.developer_id == developer_id)
        if team_id:
            stmt = stmt.where(PredictiveInsight.team_id == team_id)

        stmt = stmt.order_by(PredictiveInsight.generated_at.desc()).limit(1)

        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def _get_activity_metrics(
        self,
        developer_id: str,
        start_date: datetime,
        end_date: datetime,
        db: AsyncSession,
    ) -> dict[str, Any]:
        """Get activity metrics for a time period."""
        # Commits
        commit_stmt = (
            select(func.count(Commit.id))
            .where(
                and_(
                    Commit.developer_id == developer_id,
                    Commit.committed_at >= start_date,
                    Commit.committed_at <= end_date,
                )
            )
        )
        commits = (await db.execute(commit_stmt)).scalar() or 0

        # PRs
        pr_stmt = (
            select(func.count(PullRequest.id))
            .where(
                and_(
                    PullRequest.developer_id == developer_id,
                    PullRequest.created_at >= start_date,
                    PullRequest.created_at <= end_date,
                )
            )
        )
        prs = (await db.execute(pr_stmt)).scalar() or 0

        # Reviews
        review_stmt = (
            select(func.count(CodeReview.id))
            .where(
                and_(
                    CodeReview.developer_id == developer_id,
                    CodeReview.submitted_at >= start_date,
                    CodeReview.submitted_at <= end_date,
                )
            )
        )
        reviews = (await db.execute(review_stmt)).scalar() or 0

        return {
            "commits": commits,
            "prs": prs,
            "reviews": reviews,
            "period_days": (end_date - start_date).days,
        }

    def _calculate_trend(self, current: int, baseline: int) -> str:
        """Calculate trend description."""
        if baseline == 0:
            return "new activity" if current > 0 else "no activity"

        change = (current - baseline) / baseline
        if change > 0.2:
            return f"increasing (+{change*100:.0f}%)"
        elif change < -0.2:
            return f"decreasing ({change*100:.0f}%)"
        else:
            return "stable"

    async def get_all_cached_insights(
        self,
        developer_id: str,
        db: AsyncSession,
    ) -> list[dict[str, Any]]:
        """Get all cached predictive insights for a developer.

        Args:
            developer_id: Developer ID
            db: Database session

        Returns:
            List of insight responses
        """
        from aexy.schemas.analytics import PredictiveInsightResponse, InsightType

        stmt = (
            select(PredictiveInsight)
            .where(
                and_(
                    PredictiveInsight.developer_id == developer_id,
                    PredictiveInsight.expires_at > datetime.now(timezone.utc),
                )
            )
            .order_by(PredictiveInsight.generated_at.desc())
        )

        result = await db.execute(stmt)
        insights = list(result.scalars().all())

        return [
            PredictiveInsightResponse(
                id=i.id,
                developer_id=i.developer_id,
                team_id=i.team_id,
                insight_type=InsightType(i.insight_type),
                risk_score=i.risk_score,
                confidence=i.confidence,
                risk_level=RiskLevel(i.risk_level) if i.risk_level else None,
                factors=[
                    RiskFactor(
                        factor=f.get("factor", ""),
                        weight=f.get("weight", 0.0),
                        evidence=f.get("evidence", ""),
                        trend=f.get("trend"),
                    )
                    for f in (i.factors or [])
                    if isinstance(f, dict) and "factor" in f
                ],
                recommendations=i.recommendations or [],
                generated_at=i.generated_at,
                expires_at=i.expires_at,
            )
            for i in insights
        ]

    async def clear_cached_insights(
        self,
        developer_id: str,
        db: AsyncSession,
    ) -> int:
        """Clear all cached insights for a developer.

        Args:
            developer_id: Developer ID
            db: Database session

        Returns:
            Number of insights deleted
        """
        from sqlalchemy import delete

        stmt = delete(PredictiveInsight).where(
            PredictiveInsight.developer_id == developer_id
        )
        result = await db.execute(stmt)
        await db.commit()
        return result.rowcount
