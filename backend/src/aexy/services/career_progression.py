"""Career progression service for role management and gap analysis."""

import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.career import CareerRole
from aexy.models.developer import Developer

logger = logging.getLogger(__name__)


# Predefined career ladder
PREDEFINED_ROLES = [
    {
        "name": "Junior Engineer",
        "level": 1,
        "track": "engineering",
        "description": "Entry-level engineer learning foundational skills and best practices.",
        "responsibilities": [
            "Write clean, maintainable code with guidance",
            "Participate in code reviews",
            "Learn team processes and tools",
            "Fix bugs and implement small features",
        ],
        "required_skills": {
            "primary_language": 40,
            "git": 50,
            "testing": 30,
            "debugging": 40,
        },
        "preferred_skills": {
            "ci_cd": 20,
            "documentation": 30,
        },
        "soft_skill_requirements": {
            "communication": 0.3,
            "collaboration": 0.4,
        },
    },
    {
        "name": "Mid-Level Engineer",
        "level": 2,
        "track": "engineering",
        "description": "Capable engineer who can independently deliver features and mentor juniors.",
        "responsibilities": [
            "Design and implement medium-complexity features",
            "Mentor junior engineers",
            "Contribute to technical discussions",
            "Improve code quality and test coverage",
            "Participate in on-call rotations",
        ],
        "required_skills": {
            "primary_language": 60,
            "secondary_language": 40,
            "system_design": 40,
            "testing": 50,
            "debugging": 60,
        },
        "preferred_skills": {
            "databases": 50,
            "ci_cd": 40,
            "monitoring": 30,
        },
        "soft_skill_requirements": {
            "communication": 0.5,
            "collaboration": 0.5,
            "mentorship": 0.3,
        },
    },
    {
        "name": "Senior Engineer",
        "level": 3,
        "track": "engineering",
        "description": "Technical leader who drives projects and influences team direction.",
        "responsibilities": [
            "Lead design and implementation of complex features",
            "Own subsystems or services",
            "Drive technical decisions",
            "Mentor mid-level and junior engineers",
            "Improve team processes",
            "Handle production incidents",
        ],
        "required_skills": {
            "primary_language": 75,
            "secondary_language": 55,
            "system_design": 60,
            "domain_expertise": 60,
            "testing": 65,
            "debugging": 75,
        },
        "preferred_skills": {
            "architecture": 50,
            "performance": 50,
            "security": 40,
        },
        "soft_skill_requirements": {
            "communication": 0.6,
            "collaboration": 0.6,
            "mentorship": 0.5,
            "leadership": 0.4,
        },
    },
    {
        "name": "Staff Engineer",
        "level": 4,
        "track": "engineering",
        "description": "Cross-team technical leader driving organization-wide impact.",
        "responsibilities": [
            "Define technical strategy for multiple teams",
            "Lead cross-team initiatives",
            "Resolve complex technical challenges",
            "Set engineering standards and best practices",
            "Mentor senior engineers",
            "Influence product direction through technical insights",
        ],
        "required_skills": {
            "primary_language": 85,
            "system_design": 75,
            "architecture": 70,
            "cross_team_impact": 60,
            "technical_strategy": 50,
        },
        "preferred_skills": {
            "multiple_domains": 60,
            "organizational_skills": 50,
        },
        "soft_skill_requirements": {
            "communication": 0.7,
            "mentorship": 0.7,
            "leadership": 0.6,
            "collaboration": 0.7,
        },
    },
    {
        "name": "Principal Engineer",
        "level": 5,
        "track": "engineering",
        "description": "Organization-wide technical leader shaping engineering direction.",
        "responsibilities": [
            "Define organization-wide technical vision",
            "Drive multi-year technical strategy",
            "Solve the hardest technical problems",
            "Represent engineering externally",
            "Influence hiring and team structure",
            "Mentor staff engineers",
        ],
        "required_skills": {
            "system_design": 85,
            "architecture": 80,
            "technical_strategy": 75,
            "org_wide_impact": 70,
        },
        "preferred_skills": {
            "industry_expertise": 70,
            "public_speaking": 50,
        },
        "soft_skill_requirements": {
            "communication": 0.8,
            "mentorship": 0.8,
            "leadership": 0.8,
        },
    },
    {
        "name": "Engineering Manager",
        "level": 3,
        "track": "management",
        "description": "People manager responsible for team health and delivery.",
        "responsibilities": [
            "Manage team of 5-10 engineers",
            "Conduct 1:1s and performance reviews",
            "Hire and grow team members",
            "Ensure team delivers on commitments",
            "Shield team from distractions",
            "Partner with product on roadmap",
        ],
        "required_skills": {
            "primary_language": 60,
            "system_design": 50,
            "project_management": 60,
        },
        "preferred_skills": {
            "people_management": 70,
            "hiring": 50,
        },
        "soft_skill_requirements": {
            "communication": 0.7,
            "leadership": 0.7,
            "mentorship": 0.6,
            "collaboration": 0.7,
        },
    },
    {
        "name": "Senior Engineering Manager",
        "level": 4,
        "track": "management",
        "description": "Manages managers and drives department-level initiatives.",
        "responsibilities": [
            "Manage team of managers",
            "Drive department strategy",
            "Own significant business outcomes",
            "Build and maintain organizational culture",
            "Develop management talent",
            "Partner with leadership on company direction",
        ],
        "required_skills": {
            "strategic_thinking": 70,
            "organizational_design": 60,
            "project_management": 70,
        },
        "preferred_skills": {
            "system_design": 50,
            "cross_functional": 70,
        },
        "soft_skill_requirements": {
            "communication": 0.8,
            "leadership": 0.8,
            "mentorship": 0.7,
        },
    },
]


@dataclass
class SkillGapDetail:
    """Detailed skill gap information."""

    skill: str
    current: float
    target: float
    gap: float


@dataclass
class RoleGapResult:
    """Result of comparing developer to role."""

    developer_id: str
    role_id: str
    role_name: str
    overall_readiness: float
    skill_gaps: list[SkillGapDetail]
    met_requirements: list[str]
    soft_skill_gaps: dict[str, float]
    estimated_time_to_ready_months: int | None


@dataclass
class RoleSuggestionResult:
    """Role suggestion for career progression."""

    role_id: str
    role_name: str
    level: int
    track: str
    readiness_score: float
    progression_type: str  # "promotion", "lateral", "specialization"
    key_gaps: list[str]
    estimated_preparation_months: int


@dataclass
class PromotionReadinessResult:
    """Promotion readiness assessment."""

    developer_id: str
    target_role_id: str
    target_role_name: str
    overall_readiness: float
    met_criteria: list[str]
    missing_criteria: list[str]
    recommendations: list[str]
    timeline_estimate: str | None


class CareerProgressionService:
    """Service for managing career roles and progression analysis."""

    def __init__(self, db: AsyncSession | None = None) -> None:
        """Initialize the career progression service."""
        self.db = db

    async def get_predefined_roles(self) -> list[dict[str, Any]]:
        """Get all predefined system roles."""
        return PREDEFINED_ROLES.copy()

    async def get_custom_roles(
        self,
        organization_id: str,
    ) -> list[CareerRole]:
        """Get custom roles for an organization.

        Args:
            organization_id: Organization UUID.

        Returns:
            List of custom CareerRole objects.
        """
        if not self.db:
            return []

        result = await self.db.execute(
            select(CareerRole).where(
                CareerRole.organization_id == organization_id,
                CareerRole.is_active == True,  # noqa: E712
            )
        )
        return list(result.scalars().all())

    async def get_all_roles(
        self,
        organization_id: str | None = None,
    ) -> list[dict[str, Any]]:
        """Get all available roles (predefined + custom).

        Args:
            organization_id: Optional organization UUID for custom roles.

        Returns:
            List of role dictionaries.
        """
        roles = await self.get_predefined_roles()

        if organization_id and self.db:
            custom_roles = await self.get_custom_roles(organization_id)
            for role in custom_roles:
                roles.append({
                    "id": str(role.id),
                    "name": role.name,
                    "level": role.level,
                    "track": role.track,
                    "description": role.description,
                    "responsibilities": role.responsibilities,
                    "required_skills": role.required_skills,
                    "preferred_skills": role.preferred_skills,
                    "soft_skill_requirements": role.soft_skill_requirements,
                    "is_custom": True,
                })

        return roles

    async def create_custom_role(
        self,
        organization_id: str,
        name: str,
        level: int,
        track: str,
        description: str | None = None,
        responsibilities: list[str] | None = None,
        required_skills: dict[str, int] | None = None,
        preferred_skills: dict[str, int] | None = None,
        soft_skill_requirements: dict[str, float] | None = None,
    ) -> CareerRole:
        """Create a custom role for an organization.

        Args:
            organization_id: Organization UUID.
            name: Role name.
            level: Career level (1-5).
            track: Career track.
            description: Role description.
            responsibilities: List of responsibilities.
            required_skills: Required skills with minimum scores.
            preferred_skills: Preferred skills with scores.
            soft_skill_requirements: Soft skill requirements.

        Returns:
            Created CareerRole.
        """
        if not self.db:
            raise ValueError("Database session required for creating roles")

        role = CareerRole(
            id=str(uuid4()),
            organization_id=organization_id,
            name=name,
            level=level,
            track=track,
            description=description,
            responsibilities=responsibilities or [],
            required_skills=required_skills or {},
            preferred_skills=preferred_skills or {},
            soft_skill_requirements=soft_skill_requirements or {},
        )

        self.db.add(role)
        await self.db.commit()
        await self.db.refresh(role)

        return role

    async def get_role_by_id(self, role_id: str) -> CareerRole | None:
        """Get a role by ID."""
        if not self.db:
            return None

        result = await self.db.execute(
            select(CareerRole).where(CareerRole.id == role_id)
        )
        return result.scalar_one_or_none()

    async def get_role_requirements(
        self,
        role_id: str | None = None,
        role_name: str | None = None,
    ) -> dict[str, Any] | None:
        """Get detailed requirements for a role.

        Args:
            role_id: Role UUID (for custom roles).
            role_name: Role name (for predefined roles).

        Returns:
            Role requirements dictionary.
        """
        if role_id and self.db:
            role = await self.get_role_by_id(role_id)
            if role:
                return {
                    "role_id": str(role.id),
                    "role_name": role.name,
                    "level": role.level,
                    "track": role.track,
                    "description": role.description,
                    "responsibilities": role.responsibilities,
                    "required_skills": [
                        {"skill": k, "level": v, "reasoning": None}
                        for k, v in role.required_skills.items()
                    ],
                    "preferred_skills": [
                        {"skill": k, "level": v, "reasoning": None}
                        for k, v in role.preferred_skills.items()
                    ],
                    "soft_skills": [
                        {"skill": k, "weight": v}
                        for k, v in role.soft_skill_requirements.items()
                    ],
                }

        if role_name:
            for role_def in PREDEFINED_ROLES:
                if role_def["name"] == role_name:
                    return {
                        "role_id": None,
                        "role_name": role_def["name"],
                        "level": role_def["level"],
                        "track": role_def["track"],
                        "description": role_def["description"],
                        "responsibilities": role_def["responsibilities"],
                        "required_skills": [
                            {"skill": k, "level": v, "reasoning": None}
                            for k, v in role_def["required_skills"].items()
                        ],
                        "preferred_skills": [
                            {"skill": k, "level": v, "reasoning": None}
                            for k, v in role_def.get("preferred_skills", {}).items()
                        ],
                        "soft_skills": [
                            {"skill": k, "weight": v}
                            for k, v in role_def["soft_skill_requirements"].items()
                        ],
                    }

        return None

    def compare_developer_to_role(
        self,
        developer: Developer,
        role: dict[str, Any],
    ) -> RoleGapResult:
        """Compare a developer's skills to role requirements.

        Args:
            developer: Developer to compare.
            role: Role definition dictionary.

        Returns:
            RoleGapResult with detailed gap analysis.
        """
        fingerprint = developer.skill_fingerprint or {}

        # Build developer skill map
        dev_skills: dict[str, float] = {}
        for lang in fingerprint.get("languages") or []:
            dev_skills[lang.get("name", "")] = lang.get("proficiency_score", 0)
        for fw in fingerprint.get("frameworks") or []:
            dev_skills[fw.get("name", "")] = fw.get("proficiency_score", 0)
        for domain in fingerprint.get("domains") or []:
            dev_skills[domain.get("name", "")] = domain.get("confidence_score", 0)

        # Calculate skill gaps
        skill_gaps: list[SkillGapDetail] = []
        met_requirements: list[str] = []
        required_skills_raw = role.get("required_skills", [])

        # Handle both list and dict formats for required_skills
        if isinstance(required_skills_raw, list):
            required_skills = {item["skill"]: item["level"] for item in required_skills_raw}
        else:
            required_skills = required_skills_raw

        for skill, target in required_skills.items():
            current = dev_skills.get(skill, 0)
            if current >= target:
                met_requirements.append(skill)
            else:
                skill_gaps.append(SkillGapDetail(
                    skill=skill,
                    current=current,
                    target=target,
                    gap=target - current,
                ))

        # Check soft skills
        soft_skill_gaps: dict[str, float] = {}
        soft_skill_reqs_raw = role.get("soft_skill_requirements", role.get("soft_skills", []))

        # Handle both list and dict formats for soft skills
        if isinstance(soft_skill_reqs_raw, list):
            soft_skill_reqs = {item["skill"]: item["weight"] for item in soft_skill_reqs_raw}
        else:
            soft_skill_reqs = soft_skill_reqs_raw

        # TODO: Integrate with SoftSkillsAnalyzer for actual scores
        # For now, assume 0.5 baseline
        for skill, target in soft_skill_reqs.items():
            current = 0.5  # Placeholder
            if current < target:
                soft_skill_gaps[skill] = target - current

        # Calculate overall readiness
        total_requirements = len(required_skills)
        met_count = len(met_requirements)
        overall_readiness = met_count / total_requirements if total_requirements > 0 else 1.0

        # Estimate time to ready
        max_gap = max((g.gap for g in skill_gaps), default=0)
        estimated_months = None
        if max_gap > 0:
            # Rough estimate: 1 month per 10 points of gap
            estimated_months = int(max_gap / 10) + 3

        return RoleGapResult(
            developer_id=str(developer.id),
            role_id=role.get("id") or "",
            role_name=role.get("name", ""),
            overall_readiness=round(overall_readiness, 2),
            skill_gaps=sorted(skill_gaps, key=lambda x: x.gap, reverse=True),
            met_requirements=met_requirements,
            soft_skill_gaps=soft_skill_gaps,
            estimated_time_to_ready_months=estimated_months,
        )

    def suggest_next_roles(
        self,
        developer: Developer,
        available_roles: list[dict[str, Any]],
    ) -> list[RoleSuggestionResult]:
        """Suggest next career steps for a developer.

        Args:
            developer: Developer to analyze.
            available_roles: List of available role definitions.

        Returns:
            List of RoleSuggestionResult sorted by readiness.
        """
        fingerprint = developer.skill_fingerprint or {}
        current_level = self._estimate_developer_level(fingerprint)

        suggestions: list[RoleSuggestionResult] = []

        for role in available_roles:
            role_level = role.get("level", 1)

            # Skip roles that are too far below current level
            if role_level < current_level - 1:
                continue

            # Compare developer to role
            gap_result = self.compare_developer_to_role(developer, role)

            # Determine progression type
            if role_level > current_level:
                progression_type = "promotion"
            elif role_level == current_level and role.get("track") != "engineering":
                progression_type = "lateral"
            else:
                progression_type = "specialization"

            # Key gaps (top 3)
            key_gaps = [g.skill for g in gap_result.skill_gaps[:3]]

            suggestions.append(RoleSuggestionResult(
                role_id=role.get("id") or "",
                role_name=role.get("name", ""),
                level=role_level,
                track=role.get("track", "engineering"),
                readiness_score=gap_result.overall_readiness,
                progression_type=progression_type,
                key_gaps=key_gaps,
                estimated_preparation_months=gap_result.estimated_time_to_ready_months or 0,
            ))

        # Sort by readiness (highest first)
        suggestions.sort(key=lambda x: x.readiness_score, reverse=True)

        return suggestions[:5]  # Top 5 suggestions

    def get_promotion_readiness(
        self,
        developer: Developer,
        target_role: dict[str, Any],
    ) -> PromotionReadinessResult:
        """Assess readiness for promotion to a target role.

        Args:
            developer: Developer to assess.
            target_role: Target role definition.

        Returns:
            PromotionReadinessResult with detailed assessment.
        """
        gap_result = self.compare_developer_to_role(developer, target_role)

        # Build criteria lists
        met_criteria = [f"Meets {skill} requirement" for skill in gap_result.met_requirements]
        missing_criteria = [
            f"Need {gap.skill} at {gap.target}% (currently {gap.current}%)"
            for gap in gap_result.skill_gaps[:5]
        ]

        # Add soft skill criteria
        for skill, gap in gap_result.soft_skill_gaps.items():
            missing_criteria.append(f"Improve {skill} by {gap:.0%}")

        # Generate recommendations
        recommendations = self._generate_promotion_recommendations(
            gap_result.skill_gaps,
            gap_result.soft_skill_gaps,
            target_role,
        )

        # Timeline estimate
        timeline = None
        if gap_result.estimated_time_to_ready_months:
            months = gap_result.estimated_time_to_ready_months
            if months <= 3:
                timeline = "Ready in 1-3 months"
            elif months <= 6:
                timeline = "Ready in 3-6 months"
            elif months <= 12:
                timeline = "Ready in 6-12 months"
            else:
                timeline = "More than 12 months needed"

        return PromotionReadinessResult(
            developer_id=str(developer.id),
            target_role_id=target_role.get("id") or "",
            target_role_name=target_role.get("name", ""),
            overall_readiness=gap_result.overall_readiness,
            met_criteria=met_criteria,
            missing_criteria=missing_criteria,
            recommendations=recommendations,
            timeline_estimate=timeline,
        )

    def _estimate_developer_level(self, fingerprint: dict[str, Any]) -> int:
        """Estimate current developer level based on skill fingerprint."""
        languages = fingerprint.get("languages") or []

        if not languages:
            return 1

        # Get highest proficiency
        max_proficiency = max(
            (l.get("proficiency_score", 0) for l in languages),
            default=0,
        )

        if max_proficiency >= 85:
            return 4  # Staff level
        elif max_proficiency >= 70:
            return 3  # Senior level
        elif max_proficiency >= 50:
            return 2  # Mid level
        else:
            return 1  # Junior level

    def _generate_promotion_recommendations(
        self,
        skill_gaps: list[SkillGapDetail],
        soft_skill_gaps: dict[str, float],
        target_role: dict[str, Any],
    ) -> list[str]:
        """Generate recommendations for promotion preparation."""
        recommendations: list[str] = []

        # Technical skill recommendations
        if skill_gaps:
            top_gap = skill_gaps[0]
            recommendations.append(
                f"Focus on improving {top_gap.skill} - "
                f"aim to reach {top_gap.target}% proficiency."
            )

        # Soft skill recommendations
        if soft_skill_gaps:
            soft_skill = list(soft_skill_gaps.keys())[0]
            recommendations.append(
                f"Develop {soft_skill} through mentoring, "
                "leading projects, or cross-team collaboration."
            )

        # Responsibility-based recommendations
        responsibilities = target_role.get("responsibilities", [])
        if responsibilities:
            recommendations.append(
                f"Seek opportunities to: {responsibilities[0]}"
            )

        # Default recommendations
        if len(recommendations) < 3:
            recommendations.extend([
                "Document your impact and contributions for visibility.",
                "Build relationships across teams to demonstrate leadership.",
            ])

        return recommendations[:3]

    async def seed_predefined_roles(self) -> list[CareerRole]:
        """Seed predefined roles into the database.

        Returns:
            List of created CareerRole objects.
        """
        if not self.db:
            raise ValueError("Database session required for seeding roles")

        created_roles: list[CareerRole] = []

        for role_def in PREDEFINED_ROLES:
            # Check if role already exists
            result = await self.db.execute(
                select(CareerRole).where(
                    CareerRole.organization_id.is_(None),
                    CareerRole.name == role_def["name"],
                )
            )
            existing = result.scalar_one_or_none()

            if not existing:
                role = CareerRole(
                    id=str(uuid4()),
                    organization_id=None,  # System role
                    name=role_def["name"],
                    level=role_def["level"],
                    track=role_def["track"],
                    description=role_def["description"],
                    responsibilities=role_def["responsibilities"],
                    required_skills=role_def["required_skills"],
                    preferred_skills=role_def.get("preferred_skills", {}),
                    soft_skill_requirements=role_def["soft_skill_requirements"],
                )
                self.db.add(role)
                created_roles.append(role)

        if created_roles:
            await self.db.commit()

        return created_roles
