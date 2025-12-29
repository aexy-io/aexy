"""Peer benchmarking service for comparing developer skills."""

import logging
from dataclasses import dataclass
from typing import Any

from gitraki.models.developer import Developer
from gitraki.services.profile_analyzer import SkillFingerprint

logger = logging.getLogger(__name__)


@dataclass
class SkillComparison:
    """Comparison of a single skill between developer and peers."""

    skill_name: str
    developer_score: float
    peer_average: float
    peer_median: float
    peer_min: float
    peer_max: float
    percentile: float  # Where developer stands among peers (0-100)
    delta: float  # developer_score - peer_average


@dataclass
class BenchmarkResult:
    """Full benchmark result for a developer."""

    developer_id: str
    developer_name: str | None
    peer_group_size: int
    language_comparisons: list[SkillComparison]
    framework_comparisons: list[SkillComparison]
    domain_comparisons: list[SkillComparison]
    strengths: list[str]  # Skills where developer is above 75th percentile
    growth_opportunities: list[str]  # Skills where developer is below 25th percentile
    overall_percentile: float
    recommendations: list[str]


class PeerBenchmarkingService:
    """Service for benchmarking developers against their peers."""

    def __init__(self) -> None:
        """Initialize the benchmarking service."""
        pass

    def benchmark_developer(
        self,
        developer: Developer,
        peer_developers: list[Developer],
        filter_by_domain: str | None = None,
    ) -> BenchmarkResult:
        """Benchmark a developer against a group of peers.

        Args:
            developer: The developer to benchmark.
            peer_developers: List of peer developers to compare against.
            filter_by_domain: Optional domain filter for more relevant comparison.

        Returns:
            BenchmarkResult with detailed comparisons.
        """
        # Filter peers by domain if specified
        if filter_by_domain:
            peer_developers = [
                p for p in peer_developers
                if p.skill_fingerprint
                and any(
                    d.get("name") == filter_by_domain
                    for d in (p.skill_fingerprint.get("domains") or [])
                )
            ]

        # Exclude the developer from peers
        peer_developers = [p for p in peer_developers if p.id != developer.id]

        if not peer_developers:
            return BenchmarkResult(
                developer_id=str(developer.id),
                developer_name=developer.name,
                peer_group_size=0,
                language_comparisons=[],
                framework_comparisons=[],
                domain_comparisons=[],
                strengths=[],
                growth_opportunities=[],
                overall_percentile=50.0,
                recommendations=["Not enough peers for comparison."],
            )

        # Extract skill fingerprints
        dev_fingerprint = developer.skill_fingerprint or {}
        peer_fingerprints = [
            p.skill_fingerprint or {} for p in peer_developers
        ]

        # Compare languages
        language_comparisons = self._compare_skills(
            dev_fingerprint.get("languages") or [],
            [pf.get("languages") or [] for pf in peer_fingerprints],
            "proficiency_score",
        )

        # Compare frameworks
        framework_comparisons = self._compare_skills(
            dev_fingerprint.get("frameworks") or [],
            [pf.get("frameworks") or [] for pf in peer_fingerprints],
            "proficiency_score",
        )

        # Compare domains
        domain_comparisons = self._compare_skills(
            dev_fingerprint.get("domains") or [],
            [pf.get("domains") or [] for pf in peer_fingerprints],
            "confidence_score",
        )

        # Identify strengths and growth opportunities
        all_comparisons = language_comparisons + framework_comparisons + domain_comparisons
        strengths = [
            c.skill_name for c in all_comparisons
            if c.percentile >= 75 and c.developer_score > 0
        ]
        growth_opportunities = [
            c.skill_name for c in all_comparisons
            if c.percentile <= 25 and c.peer_average > 30
        ]

        # Calculate overall percentile
        if all_comparisons:
            overall_percentile = sum(c.percentile for c in all_comparisons) / len(all_comparisons)
        else:
            overall_percentile = 50.0

        # Generate recommendations
        recommendations = self._generate_recommendations(
            strengths, growth_opportunities, all_comparisons
        )

        return BenchmarkResult(
            developer_id=str(developer.id),
            developer_name=developer.name,
            peer_group_size=len(peer_developers),
            language_comparisons=language_comparisons,
            framework_comparisons=framework_comparisons,
            domain_comparisons=domain_comparisons,
            strengths=strengths[:5],  # Top 5 strengths
            growth_opportunities=growth_opportunities[:5],  # Top 5 opportunities
            overall_percentile=round(overall_percentile, 1),
            recommendations=recommendations[:3],
        )

    def _compare_skills(
        self,
        developer_skills: list[dict[str, Any]],
        peer_skills_list: list[list[dict[str, Any]]],
        score_field: str,
    ) -> list[SkillComparison]:
        """Compare developer skills against peer skills.

        Args:
            developer_skills: Developer's skill list.
            peer_skills_list: List of peer skill lists.
            score_field: Field name for the score (e.g., proficiency_score).

        Returns:
            List of SkillComparison objects.
        """
        comparisons = []

        # Build developer skill map
        dev_skill_map = {
            skill.get("name", ""): skill.get(score_field, 0)
            for skill in developer_skills
        }

        # Collect all unique skill names
        all_skill_names = set(dev_skill_map.keys())
        for peer_skills in peer_skills_list:
            for skill in peer_skills:
                all_skill_names.add(skill.get("name", ""))

        # Compare each skill
        for skill_name in all_skill_names:
            if not skill_name:
                continue

            developer_score = dev_skill_map.get(skill_name, 0)

            # Collect peer scores
            peer_scores = []
            for peer_skills in peer_skills_list:
                for skill in peer_skills:
                    if skill.get("name") == skill_name:
                        peer_scores.append(skill.get(score_field, 0))
                        break
                else:
                    peer_scores.append(0)

            if not peer_scores:
                continue

            # Calculate statistics
            peer_average = sum(peer_scores) / len(peer_scores)
            sorted_scores = sorted(peer_scores)
            peer_median = sorted_scores[len(sorted_scores) // 2]
            peer_min = min(peer_scores)
            peer_max = max(peer_scores)

            # Calculate percentile
            scores_below = sum(1 for s in peer_scores if s < developer_score)
            percentile = (scores_below / len(peer_scores)) * 100 if peer_scores else 50.0

            comparisons.append(SkillComparison(
                skill_name=skill_name,
                developer_score=round(developer_score, 1),
                peer_average=round(peer_average, 1),
                peer_median=round(peer_median, 1),
                peer_min=round(peer_min, 1),
                peer_max=round(peer_max, 1),
                percentile=round(percentile, 1),
                delta=round(developer_score - peer_average, 1),
            ))

        # Sort by delta (strengths first)
        comparisons.sort(key=lambda c: c.delta, reverse=True)
        return comparisons

    def _generate_recommendations(
        self,
        strengths: list[str],
        growth_opportunities: list[str],
        all_comparisons: list[SkillComparison],
    ) -> list[str]:
        """Generate personalized recommendations."""
        recommendations = []

        # Leverage strengths
        if strengths:
            recommendations.append(
                f"Leverage your expertise in {', '.join(strengths[:2])} "
                "for mentoring or leading projects."
            )

        # Address growth areas
        if growth_opportunities:
            recommendations.append(
                f"Consider upskilling in {', '.join(growth_opportunities[:2])} "
                "to expand your capabilities."
            )

        # Look for emerging skills
        low_peer_skills = [
            c.skill_name for c in all_comparisons
            if c.peer_average < 20 and c.developer_score > 30
        ]
        if low_peer_skills:
            recommendations.append(
                f"Your {', '.join(low_peer_skills[:2])} skills are rare in the team - "
                "consider knowledge sharing sessions."
            )

        # Default recommendation
        if not recommendations:
            recommendations.append(
                "Continue developing your current skill set and seek "
                "stretch assignments to grow."
            )

        return recommendations

    def get_team_skill_gaps(
        self,
        developers: list[Developer],
        target_skills: list[str],
    ) -> dict[str, Any]:
        """Identify team-wide skill gaps.

        Args:
            developers: List of team developers.
            target_skills: Skills that the team should have.

        Returns:
            Dictionary with gap analysis.
        """
        skill_coverage: dict[str, list[float]] = {skill: [] for skill in target_skills}

        for developer in developers:
            fingerprint = developer.skill_fingerprint or {}
            all_skills = (
                (fingerprint.get("languages") or []) +
                (fingerprint.get("frameworks") or []) +
                (fingerprint.get("domains") or [])
            )

            skill_map = {
                s.get("name", ""): s.get("proficiency_score", s.get("confidence_score", 0))
                for s in all_skills
            }

            for skill in target_skills:
                score = skill_map.get(skill, 0)
                skill_coverage[skill].append(score)

        # Analyze gaps
        gaps = []
        well_covered = []
        at_risk = []  # Only one person knows it well

        for skill, scores in skill_coverage.items():
            avg_score = sum(scores) / len(scores) if scores else 0
            experts = sum(1 for s in scores if s >= 70)

            if avg_score < 20:
                gaps.append({"skill": skill, "average_score": round(avg_score, 1), "experts": experts})
            elif experts == 1:
                at_risk.append({"skill": skill, "average_score": round(avg_score, 1), "experts": experts})
            else:
                well_covered.append({"skill": skill, "average_score": round(avg_score, 1), "experts": experts})

        return {
            "team_size": len(developers),
            "gaps": gaps,
            "at_risk": at_risk,
            "well_covered": well_covered,
            "recommendations": self._generate_team_recommendations(gaps, at_risk),
        }

    def _generate_team_recommendations(
        self,
        gaps: list[dict[str, Any]],
        at_risk: list[dict[str, Any]],
    ) -> list[str]:
        """Generate team-level recommendations."""
        recommendations = []

        if gaps:
            gap_skills = [g["skill"] for g in gaps[:3]]
            recommendations.append(
                f"Critical skill gaps: {', '.join(gap_skills)}. "
                "Consider hiring or training."
            )

        if at_risk:
            risk_skills = [r["skill"] for r in at_risk[:3]]
            recommendations.append(
                f"Bus factor risk: {', '.join(risk_skills)} have only one expert. "
                "Plan knowledge transfer."
            )

        return recommendations
