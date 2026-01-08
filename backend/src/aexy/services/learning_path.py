"""Learning path service for personalized career development."""

import json
import logging
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.llm.base import AnalysisType
from aexy.llm.gateway import LLMGateway
from aexy.llm.prompts import (
    LEARNING_PATH_PROMPT,
    LEARNING_PATH_SYSTEM_PROMPT,
    MILESTONE_EVALUATION_PROMPT,
    STRETCH_ASSIGNMENT_PROMPT,
)
from aexy.models.career import CareerRole, LearningMilestone, LearningPath
from aexy.models.developer import Developer
from aexy.services.career_progression import CareerProgressionService

logger = logging.getLogger(__name__)


@dataclass
class LearningActivity:
    """Learning activity recommendation."""

    type: str  # "task", "pairing", "review", "course", "book", "project"
    description: str
    source: str  # "internal", "coursera", "udemy", etc.
    url: str | None = None
    estimated_hours: int | None = None


@dataclass
class LearningPhaseResult:
    """Learning path phase."""

    name: str
    duration_weeks: int
    skills: list[str]
    activities: list[LearningActivity]


@dataclass
class MilestoneResult:
    """Milestone with evaluation."""

    skill_name: str
    target_score: int
    current_score: int
    status: str
    target_date: date | None
    recommended_activities: list[LearningActivity]


@dataclass
class ProgressUpdate:
    """Learning path progress update."""

    path_id: str
    previous_progress: int
    new_progress: int
    milestones_completed: list[str]
    skills_improved: dict[str, int]
    trajectory_status: str


@dataclass
class StretchAssignmentResult:
    """Stretch assignment recommendation."""

    task_id: str
    task_title: str
    source: str
    skill_growth: list[str]
    alignment_score: float
    challenge_level: str
    reasoning: str


class LearningPathService:
    """Service for generating and tracking personalized learning paths."""

    def __init__(
        self,
        db: AsyncSession | None = None,
        llm_gateway: LLMGateway | None = None,
        career_service: CareerProgressionService | None = None,
    ) -> None:
        """Initialize the learning path service.

        Args:
            db: Database session.
            llm_gateway: LLM gateway for path generation.
            career_service: Career progression service.
        """
        self.db = db
        self.llm_gateway = llm_gateway
        self.career_service = career_service or CareerProgressionService(db)

    async def generate_learning_path(
        self,
        developer: Developer,
        target_role_id: str | None = None,
        target_role_name: str | None = None,
        timeline_months: int = 12,
        include_external_resources: bool = False,
    ) -> LearningPath:
        """Generate a personalized learning path for a developer.

        Args:
            developer: The developer to create a path for.
            target_role_id: Target role UUID (for custom roles).
            target_role_name: Target role name (for predefined roles).
            timeline_months: Timeline in months (1-36).
            include_external_resources: Whether to include external courses.

        Returns:
            Generated LearningPath.
        """
        if not self.db:
            raise ValueError("Database session required")

        # Get role requirements
        role_requirements = await self.career_service.get_role_requirements(
            role_id=target_role_id,
            role_name=target_role_name,
        )

        if not role_requirements:
            raise ValueError("Target role not found")

        # Calculate skill gaps
        gap_result = self.career_service.compare_developer_to_role(
            developer,
            role_requirements,
        )

        # Prepare skill gaps for LLM
        skill_gaps_text = "\n".join([
            f"- {g.skill}: Current {g.current}%, Target {g.target}%, Gap {g.gap}%"
            for g in gap_result.skill_gaps
        ])

        # Prepare current skills
        fingerprint = developer.skill_fingerprint or {}
        current_skills = self._format_skills_for_llm(fingerprint)

        # Generate path using LLM
        path_data = await self._generate_path_with_llm(
            current_skills=current_skills,
            target_role=role_requirements.get("role_name", ""),
            role_requirements=json.dumps(role_requirements, default=str),
            skill_gaps=skill_gaps_text,
            timeline_months=timeline_months,
            include_external=include_external_resources,
        )

        # Calculate target completion date
        target_completion = date.today() + timedelta(days=timeline_months * 30)

        # Create learning path
        learning_path = LearningPath(
            id=str(uuid4()),
            developer_id=str(developer.id),
            target_role_id=target_role_id,
            skill_gaps={
                g.skill: {"current": g.current, "target": g.target, "gap": g.gap}
                for g in gap_result.skill_gaps
            },
            phases=path_data.get("phases", []),
            milestones_data=path_data.get("milestones", []),
            estimated_success_probability=path_data.get("estimated_success_probability"),
            risk_factors=path_data.get("risk_factors", []),
            recommendations=path_data.get("recommendations", []),
            status="active",
            progress_percentage=0,
            trajectory_status="on_track",
            target_completion=target_completion,
            generated_by_model=self.llm_gateway.model_name if self.llm_gateway else "manual",
            last_regenerated_at=datetime.utcnow(),
        )

        self.db.add(learning_path)

        # Create milestone records
        await self._create_milestones_from_path(learning_path, path_data.get("milestones", []))

        await self.db.commit()
        await self.db.refresh(learning_path)

        return learning_path

    async def _generate_path_with_llm(
        self,
        current_skills: str,
        target_role: str,
        role_requirements: str,
        skill_gaps: str,
        timeline_months: int,
        include_external: bool,
    ) -> dict[str, Any]:
        """Generate learning path using LLM."""
        if not self.llm_gateway:
            # Return a default structure if no LLM
            return self._generate_default_path(timeline_months)

        prompt = LEARNING_PATH_PROMPT.format(
            current_skills=current_skills,
            target_role=target_role,
            role_requirements=role_requirements,
            skill_gaps=skill_gaps,
            timeline_months=timeline_months,
            include_external="yes" if include_external else "no",
        )

        try:
            from aexy.llm.base import AnalysisRequest

            request = AnalysisRequest(
                content=prompt,
                analysis_type=AnalysisType.LEARNING_PATH,
                context={"system_prompt": LEARNING_PATH_SYSTEM_PROMPT},
            )

            result = await self.llm_gateway.analyze(request, use_cache=False)

            # Parse JSON from response
            if result.raw_response:
                try:
                    return json.loads(result.raw_response)
                except json.JSONDecodeError:
                    logger.warning("Failed to parse LLM response as JSON")

            return self._generate_default_path(timeline_months)

        except Exception as e:
            logger.error(f"LLM path generation failed: {e}")
            return self._generate_default_path(timeline_months)

    def _generate_default_path(self, timeline_months: int) -> dict[str, Any]:
        """Generate a default learning path structure."""
        weeks = timeline_months * 4
        phase_weeks = weeks // 3

        return {
            "phases": [
                {
                    "name": "Foundation",
                    "duration_weeks": phase_weeks,
                    "skills": ["core_fundamentals"],
                    "activities": [
                        {
                            "type": "task",
                            "description": "Work on foundational tasks",
                            "source": "internal",
                            "estimated_hours": 40,
                        }
                    ],
                },
                {
                    "name": "Application",
                    "duration_weeks": phase_weeks,
                    "skills": ["practical_application"],
                    "activities": [
                        {
                            "type": "project",
                            "description": "Apply skills in projects",
                            "source": "internal",
                            "estimated_hours": 60,
                        }
                    ],
                },
                {
                    "name": "Demonstration",
                    "duration_weeks": phase_weeks,
                    "skills": ["leadership"],
                    "activities": [
                        {
                            "type": "pairing",
                            "description": "Lead and mentor others",
                            "source": "internal",
                            "estimated_hours": 40,
                        }
                    ],
                },
            ],
            "milestones": [],
            "estimated_success_probability": 0.7,
            "risk_factors": ["Requires consistent effort"],
            "recommendations": ["Set aside dedicated learning time each week"],
        }

    async def _create_milestones_from_path(
        self,
        learning_path: LearningPath,
        milestones_data: list[dict[str, Any]],
    ) -> list[LearningMilestone]:
        """Create milestone records from path data."""
        if not self.db:
            return []

        milestones: list[LearningMilestone] = []

        for idx, ms_data in enumerate(milestones_data):
            # Calculate target date based on week
            week = ms_data.get("week", (idx + 1) * 4)
            target_date = date.today() + timedelta(weeks=week)

            milestone = LearningMilestone(
                id=str(uuid4()),
                learning_path_id=learning_path.id,
                skill_name=ms_data.get("skill_name", f"Milestone {idx + 1}"),
                target_score=ms_data.get("target_score", 60),
                current_score=0,
                status="not_started",
                target_date=target_date,
                recommended_activities=ms_data.get("activities", []),
                completed_activities=[],
                sequence=idx,
            )

            self.db.add(milestone)
            milestones.append(milestone)

        return milestones

    def _format_skills_for_llm(self, fingerprint: dict[str, Any]) -> str:
        """Format skill fingerprint for LLM prompt."""
        lines = []

        for lang in fingerprint.get("languages") or []:
            lines.append(f"- {lang.get('name')}: {lang.get('proficiency_score', 0)}%")

        for fw in fingerprint.get("frameworks") or []:
            lines.append(f"- {fw.get('name')}: {fw.get('proficiency_score', 0)}%")

        for domain in fingerprint.get("domains") or []:
            lines.append(f"- {domain.get('name')}: {domain.get('confidence_score', 0)}%")

        return "\n".join(lines) if lines else "No skills data available"

    async def get_learning_path(self, path_id: str) -> LearningPath | None:
        """Get a learning path by ID."""
        if not self.db:
            return None

        result = await self.db.execute(
            select(LearningPath).where(LearningPath.id == path_id)
        )
        return result.scalar_one_or_none()

    async def get_developer_paths(self, developer_id: str) -> list[LearningPath]:
        """Get all learning paths for a developer."""
        if not self.db:
            return []

        result = await self.db.execute(
            select(LearningPath)
            .where(LearningPath.developer_id == developer_id)
            .order_by(LearningPath.created_at.desc())
        )
        return list(result.scalars().all())

    async def get_active_path(self, developer_id: str) -> LearningPath | None:
        """Get the active learning path for a developer."""
        if not self.db:
            return None

        result = await self.db.execute(
            select(LearningPath).where(
                LearningPath.developer_id == developer_id,
                LearningPath.status == "active",
            )
        )
        return result.scalar_one_or_none()

    async def update_progress(
        self,
        path_id: str,
        developer: Developer,
    ) -> ProgressUpdate | None:
        """Update progress for a learning path based on recent activity.

        Args:
            path_id: Learning path UUID.
            developer: Developer with updated skill fingerprint.

        Returns:
            ProgressUpdate with changes, or None if path not found.
        """
        learning_path = await self.get_learning_path(path_id)
        if not learning_path:
            return None

        previous_progress = learning_path.progress_percentage
        fingerprint = developer.skill_fingerprint or {}

        # Check milestones
        result = await self.db.execute(
            select(LearningMilestone).where(
                LearningMilestone.learning_path_id == path_id
            ).order_by(LearningMilestone.sequence)
        )
        milestones = list(result.scalars().all())

        milestones_completed: list[str] = []
        skills_improved: dict[str, int] = {}
        total_progress = 0
        milestone_count = len(milestones) if milestones else 1

        for milestone in milestones:
            # Get current skill score
            current_score = self._get_skill_score(fingerprint, milestone.skill_name)

            if current_score > milestone.current_score:
                skills_improved[milestone.skill_name] = current_score - milestone.current_score
                milestone.current_score = current_score

            # Update status
            if current_score >= milestone.target_score:
                if milestone.status != "completed":
                    milestone.status = "completed"
                    milestone.completed_date = date.today()
                    milestones_completed.append(milestone.skill_name)
                total_progress += 100
            else:
                # Progress toward this milestone
                progress = (current_score / milestone.target_score) * 100 if milestone.target_score > 0 else 0
                total_progress += progress

                # Check if behind
                if milestone.target_date and date.today() > milestone.target_date:
                    milestone.status = "behind"
                elif current_score > 0:
                    milestone.status = "in_progress"

        # Calculate overall progress
        new_progress = int(total_progress / milestone_count) if milestone_count > 0 else 0
        learning_path.progress_percentage = new_progress

        # Determine trajectory
        trajectory_status = self._determine_trajectory(learning_path, milestones)
        learning_path.trajectory_status = trajectory_status

        # Check completion
        if new_progress >= 100:
            learning_path.status = "completed"
            learning_path.actual_completion = date.today()

        await self.db.commit()

        return ProgressUpdate(
            path_id=path_id,
            previous_progress=previous_progress,
            new_progress=new_progress,
            milestones_completed=milestones_completed,
            skills_improved=skills_improved,
            trajectory_status=trajectory_status,
        )

    def _get_skill_score(self, fingerprint: dict[str, Any], skill_name: str) -> int:
        """Get current skill score from fingerprint."""
        # Check languages
        for lang in fingerprint.get("languages") or []:
            if lang.get("name", "").lower() == skill_name.lower():
                return int(lang.get("proficiency_score", 0))

        # Check frameworks
        for fw in fingerprint.get("frameworks") or []:
            if fw.get("name", "").lower() == skill_name.lower():
                return int(fw.get("proficiency_score", 0))

        # Check domains
        for domain in fingerprint.get("domains") or []:
            if domain.get("name", "").lower() == skill_name.lower():
                return int(domain.get("confidence_score", 0))

        return 0

    def _determine_trajectory(
        self,
        learning_path: LearningPath,
        milestones: list[LearningMilestone],
    ) -> str:
        """Determine if path is on track, ahead, behind, or at risk."""
        if not milestones:
            return "on_track"

        behind_count = sum(1 for m in milestones if m.status == "behind")
        completed_count = sum(1 for m in milestones if m.status == "completed")
        total = len(milestones)

        # Calculate expected progress based on time
        if learning_path.target_completion:
            days_total = (learning_path.target_completion - learning_path.started_at.date()).days
            days_elapsed = (date.today() - learning_path.started_at.date()).days
            expected_progress = (days_elapsed / days_total) * 100 if days_total > 0 else 0
        else:
            expected_progress = 50

        actual_progress = learning_path.progress_percentage

        if behind_count > total * 0.5:
            return "at_risk"
        elif behind_count > 0:
            return "behind"
        elif actual_progress > expected_progress + 10:
            return "ahead"
        else:
            return "on_track"

    async def get_milestones(self, path_id: str) -> list[LearningMilestone]:
        """Get milestones for a learning path."""
        if not self.db:
            return []

        result = await self.db.execute(
            select(LearningMilestone)
            .where(LearningMilestone.learning_path_id == path_id)
            .order_by(LearningMilestone.sequence)
        )
        return list(result.scalars().all())

    async def get_recommended_activities(
        self,
        path_id: str,
    ) -> list[LearningActivity]:
        """Get recommended activities for a learning path."""
        learning_path = await self.get_learning_path(path_id)
        if not learning_path:
            return []

        activities: list[LearningActivity] = []

        # Get activities from current phase
        phases = learning_path.phases or []
        current_phase_idx = min(
            learning_path.progress_percentage // 33,
            len(phases) - 1
        ) if phases else 0

        if phases and current_phase_idx < len(phases):
            current_phase = phases[current_phase_idx]
            for act_data in current_phase.get("activities", []):
                activities.append(LearningActivity(
                    type=act_data.get("type", "task"),
                    description=act_data.get("description", ""),
                    source=act_data.get("source", "internal"),
                    url=act_data.get("url"),
                    estimated_hours=act_data.get("estimated_hours"),
                ))

        # Get activities from in-progress milestones
        milestones = await self.get_milestones(path_id)
        for milestone in milestones:
            if milestone.status in ("not_started", "in_progress"):
                for act_data in milestone.recommended_activities or []:
                    activities.append(LearningActivity(
                        type=act_data.get("type", "task"),
                        description=act_data.get("description", ""),
                        source=act_data.get("source", "internal"),
                        url=act_data.get("url"),
                        estimated_hours=act_data.get("estimated_hours"),
                    ))

        # Remove duplicates by description
        seen = set()
        unique_activities = []
        for act in activities:
            if act.description not in seen:
                seen.add(act.description)
                unique_activities.append(act)

        return unique_activities[:10]  # Top 10 activities

    async def get_stretch_assignments(
        self,
        developer: Developer,
        available_tasks: list[dict[str, Any]],
    ) -> list[StretchAssignmentResult]:
        """Get stretch assignment recommendations for a developer.

        Args:
            developer: Developer with active learning path.
            available_tasks: List of available tasks from task sources.

        Returns:
            List of stretch assignment recommendations.
        """
        # Get active learning path
        active_path = await self.get_active_path(str(developer.id))
        if not active_path:
            return []

        fingerprint = developer.skill_fingerprint or {}
        current_skills = self._format_skills_for_llm(fingerprint)

        # Get learning goals from path
        learning_goals = []
        for gap_skill, gap_data in (active_path.skill_gaps or {}).items():
            learning_goals.append(f"{gap_skill}: {gap_data.get('gap', 0)}% to improve")

        target_skills = list((active_path.skill_gaps or {}).keys())

        if not self.llm_gateway:
            # Simple matching without LLM
            return self._simple_stretch_matching(developer, available_tasks, target_skills)

        # Use LLM for better matching
        prompt = STRETCH_ASSIGNMENT_PROMPT.format(
            current_skills=current_skills,
            learning_goals="\n".join(learning_goals),
            target_skills=", ".join(target_skills),
            available_tasks=json.dumps(available_tasks[:20], default=str),  # Limit for context
        )

        try:
            from aexy.llm.base import AnalysisRequest

            request = AnalysisRequest(
                content=prompt,
                analysis_type=AnalysisType.STRETCH_ASSIGNMENT,
                context={},
            )

            result = await self.llm_gateway.analyze(request, use_cache=True)

            if result.raw_response:
                try:
                    data = json.loads(result.raw_response)
                    recommendations = data.get("recommendations", [])
                    return [
                        StretchAssignmentResult(
                            task_id=r.get("task_id", ""),
                            task_title=r.get("task_title", ""),
                            source=r.get("source", "unknown"),
                            skill_growth=r.get("skill_growth", []),
                            alignment_score=r.get("alignment_score", 0.5),
                            challenge_level=r.get("challenge_level", "moderate"),
                            reasoning=r.get("reasoning", ""),
                        )
                        for r in recommendations[:5]
                    ]
                except json.JSONDecodeError:
                    pass

        except Exception as e:
            logger.error(f"Stretch assignment LLM failed: {e}")

        return self._simple_stretch_matching(developer, available_tasks, target_skills)

    def _simple_stretch_matching(
        self,
        developer: Developer,
        available_tasks: list[dict[str, Any]],
        target_skills: list[str],
    ) -> list[StretchAssignmentResult]:
        """Simple stretch assignment matching without LLM."""
        results: list[StretchAssignmentResult] = []
        fingerprint = developer.skill_fingerprint or {}

        # Build current skill set
        current_skills = set()
        for lang in fingerprint.get("languages") or []:
            if lang.get("proficiency_score", 0) > 30:
                current_skills.add(lang.get("name", "").lower())
        for fw in fingerprint.get("frameworks") or []:
            if fw.get("proficiency_score", 0) > 30:
                current_skills.add(fw.get("name", "").lower())

        target_skills_lower = {s.lower() for s in target_skills}

        for task in available_tasks[:20]:
            task_skills = set(s.lower() for s in task.get("skills", []))

            # Check if task has skills developer is learning
            learning_overlap = task_skills & target_skills_lower
            if not learning_overlap:
                continue

            # Check if developer has some baseline
            has_baseline = bool(task_skills & current_skills)

            if learning_overlap and has_baseline:
                alignment = len(learning_overlap) / len(target_skills_lower) if target_skills_lower else 0

                results.append(StretchAssignmentResult(
                    task_id=task.get("id", ""),
                    task_title=task.get("title", ""),
                    source=task.get("source", "unknown"),
                    skill_growth=list(learning_overlap),
                    alignment_score=min(alignment, 1.0),
                    challenge_level="moderate" if alignment < 0.5 else "stretch",
                    reasoning=f"Aligns with learning goals: {', '.join(learning_overlap)}",
                ))

        # Sort by alignment score
        results.sort(key=lambda x: x.alignment_score, reverse=True)
        return results[:5]

    async def regenerate_path(
        self,
        path_id: str,
        developer: Developer,
        reason: str = "manual_refresh",
    ) -> LearningPath | None:
        """Regenerate a learning path with updated data.

        Args:
            path_id: Learning path UUID.
            developer: Developer with current skills.
            reason: Reason for regeneration.

        Returns:
            Updated LearningPath, or None if not found.
        """
        existing_path = await self.get_learning_path(path_id)
        if not existing_path:
            return None

        # Get role info
        role_requirements = await self.career_service.get_role_requirements(
            role_id=existing_path.target_role_id,
        )

        if not role_requirements:
            return existing_path

        # Recalculate gaps
        gap_result = self.career_service.compare_developer_to_role(
            developer,
            role_requirements,
        )

        # Calculate remaining timeline
        if existing_path.target_completion:
            remaining_days = (existing_path.target_completion - date.today()).days
            remaining_months = max(1, remaining_days // 30)
        else:
            remaining_months = 6

        fingerprint = developer.skill_fingerprint or {}
        current_skills = self._format_skills_for_llm(fingerprint)
        skill_gaps_text = "\n".join([
            f"- {g.skill}: Current {g.current}%, Target {g.target}%, Gap {g.gap}%"
            for g in gap_result.skill_gaps
        ])

        # Regenerate with LLM
        path_data = await self._generate_path_with_llm(
            current_skills=current_skills,
            target_role=role_requirements.get("role_name", ""),
            role_requirements=json.dumps(role_requirements, default=str),
            skill_gaps=skill_gaps_text,
            timeline_months=remaining_months,
            include_external=False,
        )

        # Update path
        existing_path.skill_gaps = {
            g.skill: {"current": g.current, "target": g.target, "gap": g.gap}
            for g in gap_result.skill_gaps
        }
        existing_path.phases = path_data.get("phases", existing_path.phases)
        existing_path.milestones_data = path_data.get("milestones", existing_path.milestones_data)
        existing_path.risk_factors = path_data.get("risk_factors", existing_path.risk_factors)
        existing_path.recommendations = path_data.get("recommendations", existing_path.recommendations)
        existing_path.last_regenerated_at = datetime.utcnow()

        await self.db.commit()
        await self.db.refresh(existing_path)

        return existing_path

    async def pause_path(self, path_id: str) -> bool:
        """Pause a learning path."""
        learning_path = await self.get_learning_path(path_id)
        if not learning_path:
            return False

        learning_path.status = "paused"
        await self.db.commit()
        return True

    async def resume_path(self, path_id: str) -> bool:
        """Resume a paused learning path."""
        learning_path = await self.get_learning_path(path_id)
        if not learning_path:
            return False

        learning_path.status = "active"
        await self.db.commit()
        return True

    async def abandon_path(self, path_id: str) -> bool:
        """Abandon a learning path."""
        learning_path = await self.get_learning_path(path_id)
        if not learning_path:
            return False

        learning_path.status = "abandoned"
        await self.db.commit()
        return True
