"""AI-powered insights service using LLM gateway.

Provides narrative summaries, anomaly detection, root cause analysis,
1:1 prep notes, sprint retro insights, trajectory forecasting,
team composition recommendations, and hiring timeline estimation.
"""

import json
import logging
import statistics
from datetime import datetime, timedelta, timezone
from typing import Any

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.services.developer_insights_service import DeveloperInsightsService

logger = logging.getLogger(__name__)


def _get_gateway():
    """Return the LLM gateway singleton (or None)."""
    from aexy.llm.gateway import get_llm_gateway
    return get_llm_gateway()


class InsightsAIService:
    """LLM-powered intelligence layer on top of Developer Insights metrics."""

    def __init__(self, db: AsyncSession) -> None:
        self.db = db
        self._insights = DeveloperInsightsService(db)

    # ------------------------------------------------------------------
    # 1. Narrative Summaries (Task 80)
    # ------------------------------------------------------------------

    async def generate_team_narrative(
        self,
        workspace_id: str,
        developer_ids: list[str],
        start: datetime,
        end: datetime,
    ) -> dict[str, Any]:
        """Generate a human-readable narrative summary for a team's metrics."""
        gateway = _get_gateway()
        if not gateway:
            return {"narrative": "AI features are not available — no LLM provider configured.", "generated": False}

        distribution = await self._insights.compute_team_distribution(developer_ids, start, end)
        total_commits = sum(m.commits_count for m in distribution.member_metrics)
        total_prs = sum(m.prs_merged for m in distribution.member_metrics)
        total_reviews = sum(m.reviews_given for m in distribution.member_metrics)

        metrics_context = {
            "team_size": len(developer_ids),
            "period": f"{start.date()} to {end.date()}",
            "total_commits": total_commits,
            "total_prs_merged": total_prs,
            "total_reviews": total_reviews,
            "gini_coefficient": distribution.gini_coefficient,
            "top_contributor_share": distribution.top_contributor_share,
            "bottleneck_developers": distribution.bottleneck_developers,
            "members": [
                {
                    "id": m.developer_id[:8],
                    "commits": m.commits_count,
                    "prs": m.prs_merged,
                    "lines": m.lines_changed,
                    "reviews": m.reviews_given,
                }
                for m in distribution.member_metrics
            ],
        }

        system_prompt = (
            "You are an engineering analytics assistant. Generate a concise, actionable "
            "narrative summary (3-5 sentences) of the team's engineering metrics for the period. "
            "Highlight key trends, workload distribution (Gini close to 0 = equal, close to 1 = unequal), "
            "bottlenecks, and any concerns. Be specific with numbers. "
            "Output ONLY the narrative text, no JSON or markdown formatting."
        )

        user_prompt = f"Team metrics for analysis:\n{json.dumps(metrics_context, indent=2)}"

        try:
            response_text, total_tokens, input_tokens, output_tokens = await gateway.call_llm(
                system_prompt, user_prompt,
                tokens_estimate=1500,
                workspace_id=workspace_id,
            )
            return {
                "narrative": response_text.strip(),
                "generated": True,
                "tokens_used": total_tokens,
            }
        except Exception as e:
            logger.warning("Failed to generate team narrative: %s", e)
            return {"narrative": "Unable to generate narrative at this time", "generated": False}

    async def generate_developer_narrative(
        self,
        workspace_id: str,
        developer_id: str,
        start: datetime,
        end: datetime,
    ) -> dict[str, Any]:
        """Generate a narrative summary for an individual developer."""
        gateway = _get_gateway()
        if not gateway:
            return {"narrative": "AI features are not available — no LLM provider configured.", "generated": False}

        velocity = await self._insights.compute_velocity_metrics(developer_id, start, end)
        efficiency = await self._insights.compute_efficiency_metrics(developer_id, start, end)
        quality = await self._insights.compute_quality_metrics(developer_id, start, end)
        sustainability = await self._insights.compute_sustainability_metrics(developer_id, start, end, workspace_id=workspace_id)
        collaboration = await self._insights.compute_collaboration_metrics(developer_id, start, end)

        metrics_context = {
            "period": f"{start.date()} to {end.date()}",
            "velocity": velocity.to_dict(),
            "efficiency": efficiency.to_dict(),
            "quality": quality.to_dict(),
            "sustainability": sustainability.to_dict(),
            "collaboration": collaboration.to_dict(),
        }

        system_prompt = (
            "You are an engineering analytics assistant. Generate a concise narrative summary "
            "(3-4 sentences) of this developer's performance metrics. Highlight strengths, "
            "areas for improvement, and any sustainability concerns (weekend/late-night work). "
            "Be constructive and specific with numbers. "
            "Output ONLY the narrative text, no JSON or markdown."
        )

        user_prompt = f"Developer metrics:\n{json.dumps(metrics_context, indent=2, default=str)}"

        try:
            response_text, total_tokens, _, _ = await gateway.call_llm(
                system_prompt, user_prompt,
                tokens_estimate=1500,
                workspace_id=workspace_id,
            )
            return {
                "narrative": response_text.strip(),
                "generated": True,
                "tokens_used": total_tokens,
            }
        except Exception as e:
            logger.warning("Failed to generate developer narrative: %s", e)
            return {"narrative": "Unable to generate narrative at this time", "generated": False}

    # ------------------------------------------------------------------
    # 2. Anomaly Detection (Task 81)
    # ------------------------------------------------------------------

    async def detect_anomalies(
        self,
        workspace_id: str,
        developer_id: str,
        start: datetime,
        end: datetime,
        std_threshold: float = 2.0,
    ) -> dict[str, Any]:
        """Detect statistical anomalies and explain them using LLM."""
        from aexy.models.developer_insights import PeriodType

        # Get historical snapshots for baseline
        snapshots = await self._insights.get_developer_snapshots(
            developer_id, PeriodType.weekly, limit=12
        )

        # Compute current metrics
        velocity = await self._insights.compute_velocity_metrics(developer_id, start, end)
        efficiency = await self._insights.compute_efficiency_metrics(developer_id, start, end)

        current_metrics = {
            "commits": velocity.commits_count,
            "prs_merged": velocity.prs_merged,
            "lines_added": velocity.lines_added,
            "pr_cycle_time": efficiency.avg_pr_cycle_time_hours,
            "pr_merge_rate": efficiency.pr_merge_rate,
        }

        # Build historical baselines from snapshots
        historical: dict[str, list[float]] = {k: [] for k in current_metrics}
        for snap in snapshots:
            vm = snap.velocity_metrics or {}
            em = snap.efficiency_metrics or {}
            if vm.get("commits_count") is not None:
                historical["commits"].append(vm["commits_count"])
            if vm.get("prs_merged") is not None:
                historical["prs_merged"].append(vm["prs_merged"])
            if vm.get("lines_added") is not None:
                historical["lines_added"].append(vm["lines_added"])
            if em.get("avg_pr_cycle_time_hours") is not None:
                historical["pr_cycle_time"].append(em["avg_pr_cycle_time_hours"])
            if em.get("pr_merge_rate") is not None:
                historical["pr_merge_rate"].append(em["pr_merge_rate"])

        # Detect anomalies using z-score
        anomalies = []
        for metric_name, current_value in current_metrics.items():
            hist = historical.get(metric_name, [])
            if len(hist) < 3:
                continue
            mean = statistics.mean(hist)
            stdev = statistics.stdev(hist)
            if stdev == 0:
                continue
            z_score = (current_value - mean) / stdev
            if abs(z_score) >= std_threshold:
                direction = "spike" if z_score > 0 else "drop"
                anomalies.append({
                    "metric": metric_name,
                    "current_value": round(current_value, 2),
                    "historical_mean": round(mean, 2),
                    "historical_stdev": round(stdev, 2),
                    "z_score": round(z_score, 2),
                    "direction": direction,
                })

        if not anomalies:
            return {
                "anomalies": [],
                "explanation": "No significant anomalies detected for this period.",
                "generated": True,
            }

        # Use LLM to explain anomalies
        gateway = _get_gateway()
        if not gateway:
            return {
                "anomalies": anomalies,
                "explanation": "Anomalies detected but LLM not available for explanation.",
                "generated": False,
            }

        system_prompt = (
            "You are an engineering analytics assistant. Given detected anomalies in a developer's metrics, "
            "provide a brief, helpful explanation (2-4 sentences) of what might be causing them. "
            "Consider common causes: project rotation, sprint deadlines, vacation, on-call duty, "
            "large feature work, tech debt cleanup, team changes. Be constructive. "
            "Output ONLY the explanation text."
        )

        user_prompt = f"Detected anomalies:\n{json.dumps(anomalies, indent=2)}"

        try:
            response_text, total_tokens, _, _ = await gateway.call_llm(
                system_prompt, user_prompt,
                tokens_estimate=1000,
                workspace_id=workspace_id,
            )
            return {
                "anomalies": anomalies,
                "explanation": response_text.strip(),
                "generated": True,
                "tokens_used": total_tokens,
            }
        except Exception as e:
            logger.warning("Failed to generate anomaly explanation: %s", e)
            return {
                "anomalies": anomalies,
                "explanation": "Anomalies detected but explanation unavailable at this time",
                "generated": False,
            }

    # ------------------------------------------------------------------
    # 3. Root Cause Analysis (Task 82)
    # ------------------------------------------------------------------

    async def analyze_root_causes(
        self,
        workspace_id: str,
        developer_ids: list[str],
        start: datetime,
        end: datetime,
    ) -> dict[str, Any]:
        """Analyze root causes for metric changes across the team."""
        gateway = _get_gateway()
        if not gateway:
            return {"analysis": "AI features are not available.", "generated": False}

        # Gather current and previous period metrics
        delta = end - start
        prev_start = start - delta
        prev_end = start

        current_distribution = await self._insights.compute_team_distribution(developer_ids, start, end)
        previous_distribution = await self._insights.compute_team_distribution(developer_ids, prev_start, prev_end)

        current_total_commits = sum(m.commits_count for m in current_distribution.member_metrics)
        previous_total_commits = sum(m.commits_count for m in previous_distribution.member_metrics)
        current_total_prs = sum(m.prs_merged for m in current_distribution.member_metrics)
        previous_total_prs = sum(m.prs_merged for m in previous_distribution.member_metrics)

        # Per-developer changes
        changes = []
        prev_map = {m.developer_id: m for m in previous_distribution.member_metrics}
        for m in current_distribution.member_metrics:
            prev = prev_map.get(m.developer_id)
            if prev:
                commit_delta = m.commits_count - prev.commits_count
                pr_delta = m.prs_merged - prev.prs_merged
                if abs(commit_delta) > 5 or abs(pr_delta) > 2:
                    changes.append({
                        "developer": m.developer_id[:8],
                        "commit_change": commit_delta,
                        "pr_change": pr_delta,
                    })

        context = {
            "period": f"{start.date()} to {end.date()}",
            "previous_period": f"{prev_start.date()} to {prev_end.date()}",
            "current_commits": current_total_commits,
            "previous_commits": previous_total_commits,
            "commit_change_pct": round(((current_total_commits - previous_total_commits) / max(previous_total_commits, 1)) * 100, 1),
            "current_prs": current_total_prs,
            "previous_prs": previous_total_prs,
            "current_gini": current_distribution.gini_coefficient,
            "previous_gini": previous_distribution.gini_coefficient,
            "significant_individual_changes": changes,
        }

        system_prompt = (
            "You are an engineering analytics assistant. Analyze the team metric changes between "
            "two periods and provide root cause analysis. Consider: team rotations, project deadlines, "
            "holidays, new team members, departures, sprint planning changes, tech debt cleanup, "
            "tooling changes. Provide 2-4 potential root causes with brief explanations. "
            "Format as a numbered list. Output only the analysis."
        )

        user_prompt = f"Team metric changes:\n{json.dumps(context, indent=2)}"

        try:
            response_text, total_tokens, _, _ = await gateway.call_llm(
                system_prompt, user_prompt,
                tokens_estimate=1500,
                workspace_id=workspace_id,
            )
            return {
                "analysis": response_text.strip(),
                "metrics_summary": context,
                "generated": True,
                "tokens_used": total_tokens,
            }
        except Exception as e:
            logger.warning("Failed to generate root cause analysis: %s", e)
            return {"analysis": "Unable to generate analysis at this time", "generated": False}

    # ------------------------------------------------------------------
    # 4. 1:1 Preparation Notes (Task 83)
    # ------------------------------------------------------------------

    async def generate_one_on_one_prep(
        self,
        workspace_id: str,
        developer_id: str,
        start: datetime,
        end: datetime,
    ) -> dict[str, Any]:
        """Generate 1:1 preparation notes for a manager meeting with a developer."""
        gateway = _get_gateway()
        if not gateway:
            return {"notes": "AI features are not available.", "generated": False}

        velocity = await self._insights.compute_velocity_metrics(developer_id, start, end)
        efficiency = await self._insights.compute_efficiency_metrics(developer_id, start, end)
        quality = await self._insights.compute_quality_metrics(developer_id, start, end)
        sustainability = await self._insights.compute_sustainability_metrics(developer_id, start, end, workspace_id=workspace_id)
        collaboration = await self._insights.compute_collaboration_metrics(developer_id, start, end)
        health = await self._insights.compute_health_score(developer_id, start, end, workspace_id=workspace_id)

        # Try to get gaming flags
        try:
            gaming = await self._insights.detect_gaming_patterns(developer_id, start, end)
        except Exception:
            gaming = {"flags": [], "risk_level": "unknown"}

        context = {
            "period": f"{start.date()} to {end.date()}",
            "health_score": health.get("score", 0),
            "velocity": velocity.to_dict(),
            "efficiency": efficiency.to_dict(),
            "quality": quality.to_dict(),
            "sustainability": sustainability.to_dict(),
            "collaboration": collaboration.to_dict(),
            "gaming_flags": gaming.get("flags", []),
            "gaming_risk": gaming.get("risk_level", "none"),
        }

        system_prompt = (
            "You are an engineering manager's assistant. Generate concise 1:1 preparation notes "
            "for a manager meeting with a developer. Structure the output as:\n"
            "1. **Highlights** — 2-3 positive observations\n"
            "2. **Discussion Points** — 2-3 areas to discuss (improvement opportunities, not criticisms)\n"
            "3. **Sustainability Check** — any work-life balance concerns based on weekend/late-night metrics\n"
            "4. **Growth Suggestions** — 1-2 concrete suggestions for professional development\n"
            "5. **Talking Points** — 2-3 specific questions the manager could ask\n\n"
            "Be constructive, empathetic, and specific. Use the data to support points."
        )

        user_prompt = f"Developer metrics for 1:1 prep:\n{json.dumps(context, indent=2, default=str)}"

        try:
            response_text, total_tokens, _, _ = await gateway.call_llm(
                system_prompt, user_prompt,
                tokens_estimate=2000,
                workspace_id=workspace_id,
            )
            return {
                "notes": response_text.strip(),
                "health_score": health.get("score", 0),
                "generated": True,
                "tokens_used": total_tokens,
            }
        except Exception as e:
            logger.warning("Failed to generate 1:1 prep notes: %s", e)
            return {"notes": "Unable to generate notes at this time", "generated": False}

    # ------------------------------------------------------------------
    # 5. Sprint Retro Insights (Task 84)
    # ------------------------------------------------------------------

    async def generate_sprint_retro(
        self,
        workspace_id: str,
        developer_ids: list[str],
        start: datetime,
        end: datetime,
    ) -> dict[str, Any]:
        """Generate AI-powered sprint retrospective insights."""
        gateway = _get_gateway()
        if not gateway:
            return {"retro": "AI features are not available.", "generated": False}

        distribution = await self._insights.compute_team_distribution(developer_ids, start, end)

        # Gather sustainability info across the team
        sustainability_issues = []
        for dev_id in developer_ids[:10]:  # Limit to 10 for token efficiency
            sus = await self._insights.compute_sustainability_metrics(dev_id, start, end, workspace_id=workspace_id)
            if sus.weekend_commit_ratio > 0.1 or sus.late_night_commit_ratio > 0.15:
                sustainability_issues.append({
                    "developer": dev_id[:8],
                    "weekend_ratio": round(sus.weekend_commit_ratio, 2),
                    "late_night_ratio": round(sus.late_night_commit_ratio, 2),
                })

        total_commits = sum(m.commits_count for m in distribution.member_metrics)
        total_prs = sum(m.prs_merged for m in distribution.member_metrics)

        context = {
            "sprint_period": f"{start.date()} to {end.date()}",
            "team_size": len(developer_ids),
            "total_commits": total_commits,
            "total_prs_merged": total_prs,
            "gini_coefficient": distribution.gini_coefficient,
            "top_contributor_share": distribution.top_contributor_share,
            "bottleneck_developers": distribution.bottleneck_developers,
            "sustainability_concerns": sustainability_issues,
            "member_activity": [
                {
                    "id": m.developer_id[:8],
                    "commits": m.commits_count,
                    "prs": m.prs_merged,
                    "reviews": m.reviews_given,
                }
                for m in distribution.member_metrics
            ],
        }

        system_prompt = (
            "You are a sprint retrospective facilitator. Based on the team's engineering metrics, "
            "generate structured retrospective insights:\n"
            "1. **What Went Well** — 2-3 positive observations from the data\n"
            "2. **What Needs Improvement** — 2-3 areas where metrics indicate problems\n"
            "3. **Action Items** — 3-4 specific, actionable recommendations for next sprint\n"
            "4. **Team Health** — brief assessment of workload balance and sustainability\n\n"
            "Be data-driven and constructive. Reference specific metrics."
        )

        user_prompt = f"Sprint metrics for retro:\n{json.dumps(context, indent=2)}"

        try:
            response_text, total_tokens, _, _ = await gateway.call_llm(
                system_prompt, user_prompt,
                tokens_estimate=2000,
                workspace_id=workspace_id,
            )
            return {
                "retro": response_text.strip(),
                "metrics_summary": {
                    "total_commits": total_commits,
                    "total_prs": total_prs,
                    "gini": distribution.gini_coefficient,
                    "sustainability_flags": len(sustainability_issues),
                },
                "generated": True,
                "tokens_used": total_tokens,
            }
        except Exception as e:
            logger.warning("Failed to generate sprint retro: %s", e)
            return {"retro": "Unable to generate retro insights at this time", "generated": False}

    # ------------------------------------------------------------------
    # 6. Team Trajectory Forecasting (Task 86)
    # ------------------------------------------------------------------

    async def generate_team_trajectory(
        self,
        workspace_id: str,
        developer_ids: list[str],
        start: datetime,
        end: datetime,
    ) -> dict[str, Any]:
        """Generate LLM-enhanced team trajectory forecast with narrative."""
        gateway = _get_gateway()
        if not gateway:
            return {"trajectory": "AI features are not available.", "generated": False}

        # Current metrics
        distribution = await self._insights.compute_team_distribution(developer_ids, start, end)

        # Previous period for trend
        delta = end - start
        prev_start = start - delta
        prev_distribution = await self._insights.compute_team_distribution(developer_ids, prev_start, start)

        current_commits = sum(m.commits_count for m in distribution.member_metrics)
        prev_commits = sum(m.commits_count for m in prev_distribution.member_metrics)
        current_prs = sum(m.prs_merged for m in distribution.member_metrics)
        prev_prs = sum(m.prs_merged for m in prev_distribution.member_metrics)

        # Get sprint capacity forecast if available
        try:
            capacity = await self._insights.estimate_sprint_capacity(
                workspace_id, None, developer_ids, 14, 4
            )
        except Exception:
            capacity = {}

        context = {
            "team_size": len(developer_ids),
            "current_period": f"{start.date()} to {end.date()}",
            "current_commits": current_commits,
            "previous_commits": prev_commits,
            "commit_trend_pct": round(((current_commits - prev_commits) / max(prev_commits, 1)) * 100, 1),
            "current_prs": current_prs,
            "previous_prs": prev_prs,
            "current_gini": distribution.gini_coefficient,
            "previous_gini": prev_distribution.gini_coefficient,
            "bottleneck_developers": distribution.bottleneck_developers,
            "sprint_capacity_forecast": capacity.get("team_forecast", {}),
        }

        system_prompt = (
            "You are an engineering analytics advisor. Based on team metrics and trends, "
            "generate a team trajectory forecast:\n"
            "1. **Velocity Trend** — is the team accelerating, stable, or decelerating?\n"
            "2. **Risk Factors** — what could derail the team in the next 2-4 weeks?\n"
            "3. **Opportunities** — areas where the team could improve efficiency\n"
            "4. **Forecast** — predicted performance for the next sprint based on trends\n"
            "5. **Recommendations** — 2-3 specific actions to optimize performance\n\n"
            "Be data-driven and actionable."
        )

        user_prompt = f"Team trajectory data:\n{json.dumps(context, indent=2, default=str)}"

        try:
            response_text, total_tokens, _, _ = await gateway.call_llm(
                system_prompt, user_prompt,
                tokens_estimate=2000,
                workspace_id=workspace_id,
            )
            return {
                "trajectory": response_text.strip(),
                "trends": {
                    "commit_trend_pct": context["commit_trend_pct"],
                    "gini_change": round(distribution.gini_coefficient - prev_distribution.gini_coefficient, 3),
                },
                "generated": True,
                "tokens_used": total_tokens,
            }
        except Exception as e:
            logger.warning("Failed to generate trajectory: %s", e)
            return {"trajectory": "Unable to generate trajectory at this time", "generated": False}

    # ------------------------------------------------------------------
    # 7. Team Composition Recommendations (Task 87)
    # ------------------------------------------------------------------

    async def recommend_team_composition(
        self,
        workspace_id: str,
        developer_ids: list[str],
        start: datetime,
        end: datetime,
    ) -> dict[str, Any]:
        """Analyze team and recommend composition improvements."""
        gateway = _get_gateway()
        if not gateway:
            return {"recommendations": "AI features are not available.", "generated": False}

        distribution = await self._insights.compute_team_distribution(developer_ids, start, end)

        # Gather collaboration data
        collab_data = []
        for dev_id in developer_ids[:10]:
            collab = await self._insights.compute_collaboration_metrics(dev_id, start, end)
            quality = await self._insights.compute_quality_metrics(dev_id, start, end)
            collab_data.append({
                "developer": dev_id[:8],
                "unique_collaborators": collab.unique_collaborators,
                "review_given": collab.review_given_count,
                "review_received": collab.review_received_count,
                "knowledge_sharing": round(collab.knowledge_sharing_score, 2),
                "review_participation": round(quality.review_participation_rate, 2),
                "self_merge_rate": round(quality.self_merge_rate, 2),
            })

        # Try bus factor
        try:
            bus_factors = await self._insights.compute_bus_factor(developer_ids, start, end, 0.8)
        except Exception:
            bus_factors = []

        context = {
            "team_size": len(developer_ids),
            "gini_coefficient": distribution.gini_coefficient,
            "top_contributor_share": distribution.top_contributor_share,
            "bottleneck_developers": distribution.bottleneck_developers,
            "collaboration_profiles": collab_data,
            "bus_factors": bus_factors[:5] if bus_factors else [],
        }

        system_prompt = (
            "You are a team structure advisor. Analyze the team's composition based on collaboration, "
            "workload distribution, and knowledge sharing metrics. Provide:\n"
            "1. **Team Balance Assessment** — how well-balanced is the team?\n"
            "2. **Knowledge Silos** — identify any bus-factor risks or knowledge concentration\n"
            "3. **Collaboration Gaps** — who should collaborate more with whom?\n"
            "4. **Role Recommendations** — suggest any role adjustments or mentoring pairings\n"
            "5. **Scaling Advice** — if adding headcount, what profile should the new hire have?\n\n"
            "Be specific and actionable."
        )

        user_prompt = f"Team composition data:\n{json.dumps(context, indent=2, default=str)}"

        try:
            response_text, total_tokens, _, _ = await gateway.call_llm(
                system_prompt, user_prompt,
                tokens_estimate=2000,
                workspace_id=workspace_id,
            )
            return {
                "recommendations": response_text.strip(),
                "team_health": {
                    "gini": distribution.gini_coefficient,
                    "bottlenecks": len(distribution.bottleneck_developers),
                    "bus_factor_risks": len([b for b in bus_factors if isinstance(b, dict) and b.get("bus_factor", 99) <= 1]),
                },
                "generated": True,
                "tokens_used": total_tokens,
            }
        except Exception as e:
            logger.warning("Failed to generate composition recommendations: %s", e)
            return {"recommendations": "Unable to generate recommendations at this time", "generated": False}

    # ------------------------------------------------------------------
    # 8. Hiring Timeline Estimation (Task 88)
    # ------------------------------------------------------------------

    async def estimate_hiring_timeline(
        self,
        workspace_id: str,
        developer_ids: list[str],
        start: datetime,
        end: datetime,
    ) -> dict[str, Any]:
        """Estimate when the team will need additional headcount."""
        gateway = _get_gateway()
        if not gateway:
            return {"forecast": "AI features are not available.", "generated": False}

        # Current and previous metrics for trend
        delta = end - start
        prev_start = start - delta
        prev2_start = prev_start - delta

        current_dist = await self._insights.compute_team_distribution(developer_ids, start, end)
        prev_dist = await self._insights.compute_team_distribution(developer_ids, prev_start, start)

        # Try a third period for better trend
        try:
            prev2_dist = await self._insights.compute_team_distribution(developer_ids, prev2_start, prev_start)
            prev2_commits = sum(m.commits_count for m in prev2_dist.member_metrics)
        except Exception:
            prev2_commits = None

        current_commits = sum(m.commits_count for m in current_dist.member_metrics)
        prev_commits = sum(m.commits_count for m in prev_dist.member_metrics)

        # Sustainability load
        overworked = 0
        for dev_id in developer_ids[:10]:
            sus = await self._insights.compute_sustainability_metrics(dev_id, start, end, workspace_id=workspace_id)
            if sus.weekend_commit_ratio > 0.15 or sus.late_night_commit_ratio > 0.2:
                overworked += 1

        context = {
            "team_size": len(developer_ids),
            "period": f"{start.date()} to {end.date()}",
            "current_commits": current_commits,
            "previous_commits": prev_commits,
            "two_periods_ago_commits": prev2_commits,
            "gini_coefficient": current_dist.gini_coefficient,
            "bottleneck_count": len(current_dist.bottleneck_developers),
            "overworked_developers": overworked,
            "top_contributor_share": current_dist.top_contributor_share,
            "commits_per_developer": round(current_commits / max(len(developer_ids), 1), 1),
        }

        system_prompt = (
            "You are a workforce planning advisor. Based on team metrics and trends, estimate "
            "when the team will need additional headcount. Consider:\n"
            "- Workload growth trends across periods\n"
            "- Current overwork indicators (weekend/late-night work)\n"
            "- Bottleneck concentration (high Gini = uneven load)\n"
            "- Bus factor risks\n\n"
            "Provide:\n"
            "1. **Current Capacity Assessment** — is the team at/over/under capacity?\n"
            "2. **Trend Analysis** — is workload growing, stable, or shrinking?\n"
            "3. **Hiring Timeline** — estimated weeks until a new hire is needed (or \"not needed\")\n"
            "4. **Ideal Hire Profile** — what skills/role would best complement the team?\n"
            "5. **Alternative Actions** — things that could delay the need for hiring\n\n"
            "Be data-driven and realistic."
        )

        user_prompt = f"Workforce planning data:\n{json.dumps(context, indent=2, default=str)}"

        try:
            response_text, total_tokens, _, _ = await gateway.call_llm(
                system_prompt, user_prompt,
                tokens_estimate=2000,
                workspace_id=workspace_id,
            )
            return {
                "forecast": response_text.strip(),
                "indicators": {
                    "team_size": len(developer_ids),
                    "overworked_ratio": round(overworked / max(len(developer_ids), 1), 2),
                    "bottleneck_ratio": round(len(current_dist.bottleneck_developers) / max(len(developer_ids), 1), 2),
                    "gini": current_dist.gini_coefficient,
                },
                "generated": True,
                "tokens_used": total_tokens,
            }
        except Exception as e:
            logger.warning("Failed to generate hiring forecast: %s", e)
            return {"forecast": "Unable to generate forecast at this time", "generated": False}
