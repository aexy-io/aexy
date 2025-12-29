"""Soft Skills Analyzer service for extracting communication and collaboration patterns."""

import logging
from typing import Any

from pydantic import BaseModel, Field

from gitraki.llm.base import AnalysisRequest, AnalysisType, SoftSkillAnalysis
from gitraki.llm.gateway import LLMGateway

logger = logging.getLogger(__name__)


class SoftSkillsProfile(BaseModel):
    """Aggregated soft skills profile for a developer."""

    communication_score: float = Field(default=0.0, ge=0.0, le=1.0)
    mentorship_score: float = Field(default=0.0, ge=0.0, le=1.0)
    collaboration_score: float = Field(default=0.0, ge=0.0, le=1.0)
    leadership_score: float = Field(default=0.0, ge=0.0, le=1.0)

    # Detailed indicators
    communication_indicators: list[str] = Field(default_factory=list)
    mentorship_indicators: list[str] = Field(default_factory=list)
    collaboration_indicators: list[str] = Field(default_factory=list)
    leadership_indicators: list[str] = Field(default_factory=list)

    # Metadata
    samples_analyzed: int = Field(default=0)
    tokens_used: int = Field(default=0)

    def overall_score(self) -> float:
        """Calculate overall soft skills score.

        Returns:
            Weighted average of all scores.
        """
        weights = {
            "communication": 0.3,
            "collaboration": 0.3,
            "mentorship": 0.2,
            "leadership": 0.2,
        }
        return (
            self.communication_score * weights["communication"]
            + self.collaboration_score * weights["collaboration"]
            + self.mentorship_score * weights["mentorship"]
            + self.leadership_score * weights["leadership"]
        )


class SoftSkillsAnalyzer:
    """Service for analyzing soft skills from PR descriptions, reviews, and comments."""

    def __init__(self, llm_gateway: LLMGateway) -> None:
        """Initialize the analyzer.

        Args:
            llm_gateway: The LLM gateway for analysis.
        """
        self.llm = llm_gateway

    async def analyze_pr_communication(
        self,
        title: str,
        description: str,
        files_changed: int = 0,
        additions: int = 0,
        deletions: int = 0,
    ) -> list[SoftSkillAnalysis]:
        """Analyze a PR for communication quality.

        Args:
            title: PR title.
            description: PR description.
            files_changed: Number of files changed.
            additions: Lines added.
            deletions: Lines deleted.

        Returns:
            List of soft skill analyses.
        """
        if not description or len(description) < 50:
            return []

        request = AnalysisRequest(
            content=description,
            analysis_type=AnalysisType.PR_DESCRIPTION,
            context={
                "title": title,
                "files_changed": files_changed,
                "additions": additions,
                "deletions": deletions,
            },
        )

        try:
            result = await self.llm.analyze(request)
            return result.soft_skills
        except Exception as e:
            logger.warning(f"Failed to analyze PR communication: {e}")
            return []

    async def analyze_review_style(
        self,
        comment: str,
        state: str = "commented",
    ) -> list[SoftSkillAnalysis]:
        """Analyze a code review for mentorship and collaboration patterns.

        Args:
            comment: The review comment.
            state: Review state.

        Returns:
            List of soft skill analyses.
        """
        if not comment or len(comment) < 30:
            return []

        request = AnalysisRequest(
            content=comment,
            analysis_type=AnalysisType.REVIEW_COMMENT,
            context={"state": state},
        )

        try:
            result = await self.llm.analyze(request)
            return result.soft_skills
        except Exception as e:
            logger.warning(f"Failed to analyze review style: {e}")
            return []

    async def build_profile(
        self,
        pull_requests: list[dict[str, Any]],
        reviews: list[dict[str, Any]],
    ) -> SoftSkillsProfile:
        """Build a complete soft skills profile from activity data.

        Args:
            pull_requests: List of PR data with title, description, etc.
            reviews: List of code review data with body, state, etc.

        Returns:
            Aggregated soft skills profile.
        """
        profile = SoftSkillsProfile()
        all_skills: list[SoftSkillAnalysis] = []

        # Analyze PRs
        for pr in pull_requests[:15]:  # Limit to recent PRs
            description = pr.get("description") or pr.get("body", "")
            title = pr.get("title", "")

            if description and len(description) > 100:
                skills = await self.analyze_pr_communication(
                    title=title,
                    description=description,
                    files_changed=pr.get("files_changed", 0),
                    additions=pr.get("additions", 0),
                    deletions=pr.get("deletions", 0),
                )
                all_skills.extend(skills)
                profile.samples_analyzed += 1

        # Analyze reviews
        for review in reviews[:20]:  # Limit to recent reviews
            body = review.get("body", "")
            state = review.get("state", "commented")

            if body and len(body) > 50:
                skills = await self.analyze_review_style(
                    comment=body,
                    state=state,
                )
                all_skills.extend(skills)
                profile.samples_analyzed += 1

        # Aggregate skills
        self._aggregate_skills(profile, all_skills)

        return profile

    def _aggregate_skills(
        self,
        profile: SoftSkillsProfile,
        skills: list[SoftSkillAnalysis],
    ) -> None:
        """Aggregate individual skill analyses into profile.

        Args:
            profile: The profile to update.
            skills: List of skill analyses.
        """
        skill_scores: dict[str, list[float]] = {
            "communication": [],
            "mentorship": [],
            "collaboration": [],
            "leadership": [],
        }
        skill_indicators: dict[str, list[str]] = {
            "communication": [],
            "mentorship": [],
            "collaboration": [],
            "leadership": [],
        }

        for skill in skills:
            skill_name = skill.skill.lower()
            if skill_name in skill_scores:
                skill_scores[skill_name].append(skill.score)
                skill_indicators[skill_name].extend(skill.indicators)

        # Calculate averages
        for skill_name, scores in skill_scores.items():
            if scores:
                avg_score = sum(scores) / len(scores)
                setattr(profile, f"{skill_name}_score", avg_score)

                # Deduplicate and limit indicators
                unique_indicators = list(set(skill_indicators[skill_name]))[:10]
                setattr(profile, f"{skill_name}_indicators", unique_indicators)

    async def compare_developers(
        self,
        profiles: list[tuple[str, SoftSkillsProfile]],
    ) -> dict[str, Any]:
        """Compare soft skills profiles across developers.

        Args:
            profiles: List of (developer_id, profile) tuples.

        Returns:
            Comparison data with rankings and insights.
        """
        if not profiles:
            return {"rankings": [], "insights": []}

        # Calculate rankings for each skill
        rankings = {
            "overall": sorted(
                [(dev_id, p.overall_score()) for dev_id, p in profiles],
                key=lambda x: x[1],
                reverse=True,
            ),
            "communication": sorted(
                [(dev_id, p.communication_score) for dev_id, p in profiles],
                key=lambda x: x[1],
                reverse=True,
            ),
            "mentorship": sorted(
                [(dev_id, p.mentorship_score) for dev_id, p in profiles],
                key=lambda x: x[1],
                reverse=True,
            ),
            "collaboration": sorted(
                [(dev_id, p.collaboration_score) for dev_id, p in profiles],
                key=lambda x: x[1],
                reverse=True,
            ),
            "leadership": sorted(
                [(dev_id, p.leadership_score) for dev_id, p in profiles],
                key=lambda x: x[1],
                reverse=True,
            ),
        }

        # Generate insights
        insights = []

        # Top communicator
        if rankings["communication"]:
            top_comm = rankings["communication"][0]
            insights.append({
                "type": "top_performer",
                "skill": "communication",
                "developer_id": top_comm[0],
                "score": top_comm[1],
            })

        # Top mentor
        if rankings["mentorship"]:
            top_mentor = rankings["mentorship"][0]
            insights.append({
                "type": "top_performer",
                "skill": "mentorship",
                "developer_id": top_mentor[0],
                "score": top_mentor[1],
            })

        return {
            "rankings": rankings,
            "insights": insights,
        }

    async def identify_growth_areas(
        self,
        profile: SoftSkillsProfile,
    ) -> list[dict[str, Any]]:
        """Identify areas for soft skill improvement.

        Args:
            profile: The developer's soft skills profile.

        Returns:
            List of growth recommendations.
        """
        recommendations = []
        threshold = 0.5  # Below this is considered an area for growth

        skills = [
            ("communication", profile.communication_score, "PR descriptions and documentation"),
            ("mentorship", profile.mentorship_score, "code reviews with explanations"),
            ("collaboration", profile.collaboration_score, "cross-team contributions"),
            ("leadership", profile.leadership_score, "leading features and initiatives"),
        ]

        for skill_name, score, suggestion in skills:
            if score < threshold:
                recommendations.append({
                    "skill": skill_name,
                    "current_score": score,
                    "target_score": threshold + 0.2,
                    "suggestion": f"Consider focusing on {suggestion} to improve {skill_name}",
                    "priority": "high" if score < 0.3 else "medium",
                })

        # Sort by priority
        priority_order = {"high": 0, "medium": 1, "low": 2}
        recommendations.sort(key=lambda x: priority_order.get(x["priority"], 2))

        return recommendations
