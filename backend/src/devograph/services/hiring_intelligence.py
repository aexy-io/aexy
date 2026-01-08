"""Hiring intelligence service for team gap analysis and JD generation."""

import json
import logging
from dataclasses import dataclass
from datetime import datetime
from typing import Any
from uuid import uuid4

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.llm.base import AnalysisType
from aexy.llm.gateway import LLMGateway
from aexy.llm.prompts import (
    INTERVIEW_RUBRIC_PROMPT,
    INTERVIEW_RUBRIC_SYSTEM_PROMPT,
    JOB_DESCRIPTION_PROMPT,
    JOB_DESCRIPTION_SYSTEM_PROMPT,
    ROADMAP_SKILL_EXTRACTION_PROMPT,
)
from aexy.models.career import HiringRequirement
from aexy.models.developer import Developer
from aexy.services.peer_benchmarking import PeerBenchmarkingService

logger = logging.getLogger(__name__)


@dataclass
class TeamSkillGapDetail:
    """Detailed team skill gap."""

    skill: str
    current_coverage: float  # % of team with skill
    average_proficiency: float
    gap_severity: str  # "critical", "moderate", "low"
    developers_with_skill: list[str]


@dataclass
class BusFactorRisk:
    """Bus factor risk identification."""

    skill_or_area: str
    risk_level: str  # "critical", "high", "medium"
    single_developer_id: str | None
    developer_name: str | None
    impact_description: str
    mitigation_suggestion: str


@dataclass
class TeamGapAnalysisResult:
    """Complete team skill gap analysis."""

    team_id: str | None
    organization_id: str
    total_developers: int
    skill_gaps: list[TeamSkillGapDetail]
    bus_factor_risks: list[BusFactorRisk]
    critical_missing_skills: list[str]
    analysis_date: datetime


@dataclass
class RoadmapSkillRequirement:
    """Skill requirement extracted from roadmap."""

    skill: str
    priority: str  # "critical", "high", "medium", "low"
    source_items: list[str]
    estimated_demand: int


@dataclass
class GeneratedJDResult:
    """LLM-generated job description."""

    role_title: str
    level: str
    summary: str
    must_have_skills: list[dict[str, Any]]
    nice_to_have_skills: list[dict[str, Any]]
    responsibilities: list[str]
    qualifications: list[str]
    cultural_indicators: list[str]
    full_text: str


@dataclass
class InterviewQuestion:
    """Interview question with evaluation criteria."""

    question: str
    skill_assessed: str
    difficulty: str
    evaluation_criteria: list[str]
    red_flags: list[str]
    bonus_indicators: list[str]


@dataclass
class InterviewRubricResult:
    """Complete interview rubric."""

    role_title: str
    technical_questions: list[InterviewQuestion]
    behavioral_questions: list[InterviewQuestion]
    system_design_prompt: str | None
    culture_fit_criteria: list[str]


@dataclass
class CandidateSkillAssessment:
    """Individual candidate skill assessment."""

    skill: str
    candidate_level: int
    required_level: int
    meets_requirement: bool
    gap: int


@dataclass
class CandidateScorecardResult:
    """Candidate comparison scorecard."""

    requirement_id: str
    role_title: str
    candidate_name: str | None
    overall_score: float
    must_have_met: int
    must_have_total: int
    nice_to_have_met: int
    nice_to_have_total: int
    skill_assessments: list[CandidateSkillAssessment]
    strengths: list[str]
    concerns: list[str]
    recommendation: str  # "strong_yes", "yes", "maybe", "no"


class HiringIntelligenceService:
    """Service for team hiring recommendations and JD generation."""

    def __init__(
        self,
        db: AsyncSession | None = None,
        llm_gateway: LLMGateway | None = None,
        peer_benchmarking: PeerBenchmarkingService | None = None,
    ) -> None:
        """Initialize the hiring intelligence service.

        Args:
            db: Database session.
            llm_gateway: LLM gateway for JD/rubric generation.
            peer_benchmarking: Peer benchmarking service for gap analysis.
        """
        self.db = db
        self.llm_gateway = llm_gateway
        self.peer_benchmarking = peer_benchmarking or PeerBenchmarkingService()

    def analyze_team_gaps(
        self,
        team_developers: list[Developer],
        target_skills: list[str] | None = None,
    ) -> TeamGapAnalysisResult:
        """Analyze team-wide skill gaps.

        Args:
            team_developers: List of team developers.
            target_skills: Optional list of target skills to check.

        Returns:
            TeamGapAnalysisResult with detailed gap analysis.
        """
        if not team_developers:
            return TeamGapAnalysisResult(
                team_id=None,
                organization_id="",
                total_developers=0,
                skill_gaps=[],
                bus_factor_risks=[],
                critical_missing_skills=[],
                analysis_date=datetime.utcnow(),
            )

        # Collect all skills across team
        all_skills: dict[str, list[tuple[str, str | None, float]]] = {}  # skill -> [(dev_id, name, score)]

        for dev in team_developers:
            fingerprint = dev.skill_fingerprint or {}

            for lang in fingerprint.get("languages") or []:
                skill_name = lang.get("name", "")
                score = lang.get("proficiency_score", 0)
                if skill_name:
                    if skill_name not in all_skills:
                        all_skills[skill_name] = []
                    all_skills[skill_name].append((str(dev.id), dev.name, score))

            for fw in fingerprint.get("frameworks") or []:
                skill_name = fw.get("name", "")
                score = fw.get("proficiency_score", 0)
                if skill_name:
                    if skill_name not in all_skills:
                        all_skills[skill_name] = []
                    all_skills[skill_name].append((str(dev.id), dev.name, score))

            for domain in fingerprint.get("domains") or []:
                skill_name = domain.get("name", "")
                score = domain.get("confidence_score", 0)
                if skill_name:
                    if skill_name not in all_skills:
                        all_skills[skill_name] = []
                    all_skills[skill_name].append((str(dev.id), dev.name, score))

        # If target skills provided, check those specifically
        if target_skills:
            for skill in target_skills:
                if skill not in all_skills:
                    all_skills[skill] = []

        # Analyze each skill
        skill_gaps: list[TeamSkillGapDetail] = []
        bus_factor_risks: list[BusFactorRisk] = []
        critical_missing: list[str] = []

        team_size = len(team_developers)

        for skill_name, dev_scores in all_skills.items():
            # Filter to meaningful scores (> 30)
            meaningful_scores = [(d_id, d_name, s) for d_id, d_name, s in dev_scores if s > 30]
            expert_scores = [(d_id, d_name, s) for d_id, d_name, s in dev_scores if s >= 70]

            # Count unique developers for coverage (a dev may appear multiple times if skill is in multiple categories)
            unique_devs_with_skill = len(set(d_id for d_id, _, _ in meaningful_scores))
            coverage = unique_devs_with_skill / team_size if team_size > 0 else 0
            avg_proficiency = (
                sum(s for _, _, s in dev_scores) / len(dev_scores)
                if dev_scores else 0
            )

            # Determine gap severity
            if coverage < 0.1 or avg_proficiency < 20:
                severity = "critical"
                critical_missing.append(skill_name)
            elif coverage < 0.3 or avg_proficiency < 40:
                severity = "moderate"
            else:
                severity = "low"

            # Check bus factor
            if len(expert_scores) == 1:
                dev_id, dev_name, _ = expert_scores[0]
                bus_factor_risks.append(BusFactorRisk(
                    skill_or_area=skill_name,
                    risk_level="high" if avg_proficiency > 50 else "medium",
                    single_developer_id=dev_id,
                    developer_name=dev_name,
                    impact_description=f"Only one expert in {skill_name}",
                    mitigation_suggestion=f"Cross-train team members on {skill_name}",
                ))

            if severity in ("critical", "moderate"):
                # Deduplicate developers (keep first occurrence with name preference)
                seen_devs: dict[str, str] = {}
                for d_id, d_name, _ in meaningful_scores:
                    if d_id not in seen_devs:
                        seen_devs[d_id] = d_name or d_id
                skill_gaps.append(TeamSkillGapDetail(
                    skill=skill_name,
                    current_coverage=round(coverage, 2),
                    average_proficiency=round(avg_proficiency, 1),
                    gap_severity=severity,
                    developers_with_skill=list(seen_devs.values()),
                ))

        # Sort gaps by severity
        severity_order = {"critical": 0, "moderate": 1, "low": 2}
        skill_gaps.sort(key=lambda x: severity_order.get(x.gap_severity, 2))

        return TeamGapAnalysisResult(
            team_id=None,
            organization_id="",  # Set by caller
            total_developers=team_size,
            skill_gaps=skill_gaps,
            bus_factor_risks=bus_factor_risks,
            critical_missing_skills=critical_missing[:10],
            analysis_date=datetime.utcnow(),
        )

    def get_bus_factor_risks(
        self,
        team_developers: list[Developer],
    ) -> list[BusFactorRisk]:
        """Get bus factor risks for a team.

        Args:
            team_developers: List of team developers.

        Returns:
            List of BusFactorRisk.
        """
        analysis = self.analyze_team_gaps(team_developers)
        return analysis.bus_factor_risks

    async def extract_roadmap_skills(
        self,
        roadmap_items: list[dict[str, Any]],
    ) -> list[RoadmapSkillRequirement]:
        """Extract skill requirements from roadmap items.

        Args:
            roadmap_items: List of roadmap items (epics, stories).

        Returns:
            List of RoadmapSkillRequirement.
        """
        if not roadmap_items:
            return []

        if not self.llm_gateway:
            # Simple keyword extraction without LLM
            return self._simple_roadmap_extraction(roadmap_items)

        # Use LLM for better extraction
        items_text = json.dumps(roadmap_items[:20], default=str)

        prompt = ROADMAP_SKILL_EXTRACTION_PROMPT.format(
            roadmap_items=items_text,
        )

        try:
            from aexy.llm.base import AnalysisRequest

            request = AnalysisRequest(
                content=prompt,
                analysis_type=AnalysisType.ROADMAP_SKILLS,
                context={},
            )

            result = await self.llm_gateway.analyze(request, use_cache=True)

            if result.raw_response:
                try:
                    data = json.loads(result.raw_response)
                    return [
                        RoadmapSkillRequirement(
                            skill=req.get("skill", ""),
                            priority=req.get("priority", "medium"),
                            source_items=req.get("source_items", []),
                            estimated_demand=req.get("estimated_demand", 1),
                        )
                        for req in data.get("skill_requirements", [])
                    ]
                except json.JSONDecodeError:
                    pass

        except Exception as e:
            logger.error(f"Roadmap skill extraction failed: {e}")

        return self._simple_roadmap_extraction(roadmap_items)

    def _simple_roadmap_extraction(
        self,
        roadmap_items: list[dict[str, Any]],
    ) -> list[RoadmapSkillRequirement]:
        """Simple skill extraction without LLM."""
        skill_counts: dict[str, list[str]] = {}

        # Common technology keywords
        tech_keywords = {
            "python", "javascript", "typescript", "react", "node", "go", "rust",
            "java", "kotlin", "swift", "kubernetes", "docker", "aws", "gcp",
            "azure", "postgresql", "mysql", "mongodb", "redis", "graphql",
            "rest", "api", "ml", "ai", "machine learning", "data pipeline",
        }

        for item in roadmap_items:
            item_id = item.get("id", "")
            text = f"{item.get('title', '')} {item.get('description', '')}".lower()

            for keyword in tech_keywords:
                if keyword in text:
                    if keyword not in skill_counts:
                        skill_counts[keyword] = []
                    skill_counts[keyword].append(item_id)

        # Convert to requirements
        requirements = [
            RoadmapSkillRequirement(
                skill=skill.title(),
                priority="high" if len(items) > 3 else "medium",
                source_items=items[:5],
                estimated_demand=min(len(items), 3),
            )
            for skill, items in skill_counts.items()
        ]

        # Sort by demand
        requirements.sort(key=lambda x: x.estimated_demand, reverse=True)
        return requirements[:15]

    async def generate_job_description(
        self,
        gap_analysis: TeamGapAnalysisResult,
        role_title: str,
        level: str = "Senior",
        priority: str = "high",
        roadmap_context: str | None = None,
        role_template: dict[str, Any] | None = None,
    ) -> GeneratedJDResult:
        """Generate a job description based on team gaps.

        Args:
            gap_analysis: Team gap analysis result.
            role_title: Proposed role title.
            level: Role level (Junior, Mid, Senior, Staff, Principal).
            priority: Hiring priority.
            roadmap_context: Optional roadmap context.
            role_template: Optional role template for requirements.

        Returns:
            GeneratedJDResult with JD content.
        """
        if not self.llm_gateway:
            return self._generate_default_jd(gap_analysis, role_title, level)

        # Prepare prompt data
        critical_skills = [g.skill for g in gap_analysis.skill_gaps if g.gap_severity == "critical"]
        bus_risks = [f"{r.skill_or_area} (only {r.developer_name})" for r in gap_analysis.bus_factor_risks[:3]]

        prompt = JOB_DESCRIPTION_PROMPT.format(
            team_size=gap_analysis.total_developers,
            critical_skills=", ".join(critical_skills) or "None identified",
            bus_factor_risks=", ".join(bus_risks) or "None identified",
            role_title=role_title,
            level=level,
            priority=priority,
            roadmap_context=roadmap_context or "Not provided",
            role_template=json.dumps(role_template, default=str) if role_template else "None",
        )

        try:
            from aexy.llm.base import AnalysisRequest

            request = AnalysisRequest(
                content=prompt,
                analysis_type=AnalysisType.JOB_DESCRIPTION,
                context={"system_prompt": JOB_DESCRIPTION_SYSTEM_PROMPT},
            )

            result = await self.llm_gateway.analyze(request, use_cache=False)

            if result.raw_response:
                try:
                    data = json.loads(result.raw_response)
                    return GeneratedJDResult(
                        role_title=data.get("role_title", role_title),
                        level=data.get("level", level),
                        summary=data.get("summary", ""),
                        must_have_skills=data.get("must_have_skills", []),
                        nice_to_have_skills=data.get("nice_to_have_skills", []),
                        responsibilities=data.get("responsibilities", []),
                        qualifications=data.get("qualifications", []),
                        cultural_indicators=data.get("cultural_indicators", []),
                        full_text=data.get("full_text", ""),
                    )
                except json.JSONDecodeError:
                    pass

        except Exception as e:
            logger.error(f"JD generation failed: {e}")

        return self._generate_default_jd(gap_analysis, role_title, level)

    def _generate_default_jd(
        self,
        gap_analysis: TeamGapAnalysisResult,
        role_title: str,
        level: str,
    ) -> GeneratedJDResult:
        """Generate a comprehensive default JD without LLM."""
        critical_skills = [g.skill for g in gap_analysis.skill_gaps if g.gap_severity == "critical"]
        moderate_skills = [g.skill for g in gap_analysis.skill_gaps if g.gap_severity == "moderate"]

        # Default skills based on common role patterns
        default_skills_map = {
            "sde": ["Python", "JavaScript", "SQL", "Git", "REST APIs"],
            "frontend": ["React", "TypeScript", "CSS", "HTML", "JavaScript"],
            "backend": ["Python", "Node.js", "PostgreSQL", "REST APIs", "Docker"],
            "fullstack": ["React", "Node.js", "TypeScript", "PostgreSQL", "Docker"],
            "devops": ["Docker", "Kubernetes", "AWS", "CI/CD", "Terraform"],
            "data": ["Python", "SQL", "Pandas", "Data Modeling", "ETL"],
            "ml": ["Python", "TensorFlow", "PyTorch", "ML Algorithms", "Data Analysis"],
        }

        # Determine role category from title
        role_lower = role_title.lower()
        default_skills = default_skills_map.get("sde", [])  # Default to SDE
        for key in default_skills_map:
            if key in role_lower:
                default_skills = default_skills_map[key]
                break

        # Combine team gaps with defaults
        must_have_skills = critical_skills[:3] if critical_skills else default_skills[:5]
        nice_to_have_skills = moderate_skills[:3] if moderate_skills else ["Cloud Platforms", "System Design", "Agile Methodologies"]

        must_have = [{"skill": s, "level": 70, "reasoning": "Essential for the role"} for s in must_have_skills]
        nice_to_have = [{"skill": s, "level": 50, "reasoning": "Would enhance contribution"} for s in nice_to_have_skills]

        # Level-specific experience requirements
        experience_map = {
            "Junior": "0-2 years",
            "Mid": "2-4 years",
            "Senior": "4-7 years",
            "Staff": "7-10 years",
            "Principal": "10+ years",
        }
        experience = experience_map.get(level, "3+ years")

        responsibilities = [
            f"Design, develop, and maintain high-quality software solutions",
            f"Collaborate with cross-functional teams to define and implement features",
            f"Write clean, testable, and well-documented code",
            f"Participate in code reviews and provide constructive feedback",
            f"Troubleshoot, debug, and resolve technical issues",
            f"Contribute to architectural decisions and technical planning",
        ]

        if level in ["Senior", "Staff", "Principal"]:
            responsibilities.extend([
                "Mentor junior engineers and foster team growth",
                "Lead technical initiatives and drive best practices",
                "Contribute to system architecture and design decisions",
            ])

        qualifications = [
            f"{experience} of professional software development experience",
            f"Strong proficiency in {', '.join(must_have_skills[:3])}",
            "Solid understanding of software engineering principles",
            "Experience with version control systems (Git)",
            "Strong problem-solving and analytical skills",
            "Excellent communication and collaboration abilities",
        ]

        if level in ["Senior", "Staff", "Principal"]:
            qualifications.append("Track record of technical leadership and mentorship")

        full_text = f"""# {level} {role_title}

## About the Role
We are seeking a talented {level} {role_title} to join our engineering team. In this role, you will play a key part in building and scaling our platform, working alongside a collaborative team of engineers who are passionate about delivering exceptional software.

## What You'll Do
{chr(10).join(f"- {r}" for r in responsibilities)}

## What We're Looking For
{chr(10).join(f"- {q}" for q in qualifications)}

## Nice to Have
{chr(10).join(f"- Experience with {s}" for s in nice_to_have_skills)}

## Why Join Us
- Work on challenging technical problems at scale
- Collaborative and inclusive engineering culture
- Opportunities for growth and professional development
- Competitive compensation and benefits
"""

        return GeneratedJDResult(
            role_title=f"{level} {role_title}",
            level=level,
            summary=f"We are seeking a talented {level} {role_title} to join our engineering team and help build scalable, high-quality software solutions.",
            must_have_skills=must_have,
            nice_to_have_skills=nice_to_have,
            responsibilities=responsibilities,
            qualifications=qualifications,
            cultural_indicators=[
                "Collaborative and team-oriented",
                "Growth mindset and continuous learner",
                "Strong ownership and accountability",
                "Open to feedback and iteration",
            ],
            full_text=full_text,
        )

    async def generate_interview_rubric(
        self,
        jd: GeneratedJDResult,
        team_context: TeamGapAnalysisResult | None = None,
    ) -> InterviewRubricResult:
        """Generate an interview rubric for a role.

        Args:
            jd: Generated job description.
            team_context: Optional team context for tailored questions.

        Returns:
            InterviewRubricResult with questions and criteria.
        """
        if not self.llm_gateway:
            return self._generate_default_rubric(jd)

        # Prepare prompt data
        required_skills = ", ".join([s.get("skill", "") for s in jd.must_have_skills])
        nice_to_have_skills = ", ".join([s.get("skill", "") for s in jd.nice_to_have_skills])

        tech_stack = required_skills
        team_domains = []
        work_style = "Collaborative"

        if team_context:
            team_domains = [g.skill for g in team_context.skill_gaps[:3]]

        prompt = INTERVIEW_RUBRIC_PROMPT.format(
            role_title=jd.role_title,
            level=jd.level,
            required_skills=required_skills,
            nice_to_have_skills=nice_to_have_skills,
            tech_stack=tech_stack,
            team_domains=", ".join(team_domains) or "General engineering",
            work_style=work_style,
        )

        try:
            from aexy.llm.base import AnalysisRequest

            request = AnalysisRequest(
                content=prompt,
                analysis_type=AnalysisType.INTERVIEW_RUBRIC,
                context={"system_prompt": INTERVIEW_RUBRIC_SYSTEM_PROMPT},
            )

            result = await self.llm_gateway.analyze(request, use_cache=False)

            if result.raw_response:
                try:
                    data = json.loads(result.raw_response)
                    return InterviewRubricResult(
                        role_title=data.get("role_title", jd.role_title),
                        technical_questions=[
                            InterviewQuestion(
                                question=q.get("question", ""),
                                skill_assessed=q.get("skill_assessed", ""),
                                difficulty=q.get("difficulty", "medium"),
                                evaluation_criteria=q.get("evaluation_criteria", []),
                                red_flags=q.get("red_flags", []),
                                bonus_indicators=q.get("bonus_indicators", []),
                            )
                            for q in data.get("technical_questions", [])
                        ],
                        behavioral_questions=[
                            InterviewQuestion(
                                question=q.get("question", ""),
                                skill_assessed=q.get("skill_assessed", ""),
                                difficulty=q.get("difficulty", "medium"),
                                evaluation_criteria=q.get("evaluation_criteria", []),
                                red_flags=q.get("red_flags", []),
                                bonus_indicators=q.get("bonus_indicators", []),
                            )
                            for q in data.get("behavioral_questions", [])
                        ],
                        system_design_prompt=data.get("system_design_prompt"),
                        culture_fit_criteria=data.get("culture_fit_criteria", []),
                    )
                except json.JSONDecodeError:
                    pass

        except Exception as e:
            logger.error(f"Rubric generation failed: {e}")

        return self._generate_default_rubric(jd)

    def _generate_default_rubric(
        self,
        jd: GeneratedJDResult,
    ) -> InterviewRubricResult:
        """Generate a comprehensive default interview rubric."""
        technical_questions = []

        # Generate questions for each must-have skill
        for skill_data in jd.must_have_skills[:5]:
            skill = skill_data.get("skill", "General")
            technical_questions.append(InterviewQuestion(
                question=f"Can you describe a project where you used {skill}? What challenges did you face and how did you overcome them?",
                skill_assessed=skill,
                difficulty="medium",
                evaluation_criteria=[
                    f"Demonstrates practical experience with {skill}",
                    "Explains technical decisions clearly",
                    "Shows problem-solving approach",
                    "Discusses trade-offs considered",
                ],
                red_flags=[
                    "Cannot provide specific examples",
                    "Lacks depth in technical explanation",
                    "Unable to discuss trade-offs",
                ],
                bonus_indicators=[
                    "Mentions performance optimizations",
                    "Discusses scalability considerations",
                    "Shows awareness of best practices",
                ],
            ))

        # Add problem-solving questions
        technical_questions.append(InterviewQuestion(
            question="Walk me through how you would debug a performance issue in a production system.",
            skill_assessed="debugging",
            difficulty="hard",
            evaluation_criteria=[
                "Systematic debugging approach",
                "Uses appropriate tools and metrics",
                "Considers multiple potential causes",
                "Prioritizes based on impact",
            ],
            red_flags=[
                "Random trial-and-error approach",
                "Doesn't consider monitoring/logging",
                "Cannot articulate a systematic process",
            ],
            bonus_indicators=[
                "Mentions profiling tools",
                "Discusses preventive measures",
                "Has experience with production debugging",
            ],
        ))

        # Add architecture/design question
        technical_questions.append(InterviewQuestion(
            question="How do you decide when to refactor code versus working around existing implementations?",
            skill_assessed="software design",
            difficulty="medium",
            evaluation_criteria=[
                "Considers time/effort trade-offs",
                "Thinks about long-term maintainability",
                "Evaluates risk appropriately",
                "Makes data-driven decisions",
            ],
            red_flags=[
                "Always rewrites without considering cost",
                "Never refactors, only patches",
                "Doesn't consider team impact",
            ],
            bonus_indicators=[
                "Discusses technical debt strategically",
                "Mentions incremental refactoring",
                "Considers business priorities",
            ],
        ))

        behavioral_questions = [
            InterviewQuestion(
                question="Tell me about a time when you had to work with incomplete or ambiguous requirements. How did you handle it?",
                skill_assessed="problem_solving",
                difficulty="medium",
                evaluation_criteria=[
                    "Proactively seeks clarification",
                    "Makes reasonable assumptions when needed",
                    "Documents decisions and rationale",
                    "Communicates effectively with stakeholders",
                ],
                red_flags=[
                    "Waits passively for complete requirements",
                    "Makes assumptions without validation",
                    "Blames others for ambiguity",
                ],
                bonus_indicators=[
                    "Creates prototypes to validate assumptions",
                    "Establishes feedback loops",
                    "Turns ambiguity into a learning opportunity",
                ],
            ),
            InterviewQuestion(
                question="Describe a situation where you disagreed with a technical decision. How did you handle it?",
                skill_assessed="collaboration",
                difficulty="medium",
                evaluation_criteria=[
                    "Expresses disagreement constructively",
                    "Backs up opinions with data/evidence",
                    "Commits to decisions once made",
                    "Focuses on the problem, not personalities",
                ],
                red_flags=[
                    "Passive-aggressive behavior",
                    "Unable to commit after decision",
                    "Makes it personal",
                ],
                bonus_indicators=[
                    "Changed their mind based on new information",
                    "Found a compromise or third option",
                    "Built stronger relationships through the process",
                ],
            ),
            InterviewQuestion(
                question="How do you approach learning new technologies or skills?",
                skill_assessed="growth_mindset",
                difficulty="easy",
                evaluation_criteria=[
                    "Has a structured learning approach",
                    "Balances depth and breadth",
                    "Applies learning to practical projects",
                    "Shares knowledge with others",
                ],
                red_flags=[
                    "Only learns when required by job",
                    "Cannot name recent learning",
                    "Dismissive of new technologies",
                ],
                bonus_indicators=[
                    "Contributes to open source",
                    "Teaches or mentors others",
                    "Builds side projects",
                ],
            ),
            InterviewQuestion(
                question="Tell me about a time you received critical feedback. How did you respond?",
                skill_assessed="communication",
                difficulty="medium",
                evaluation_criteria=[
                    "Receives feedback openly",
                    "Asks clarifying questions",
                    "Takes action on feedback",
                    "Shows self-awareness",
                ],
                red_flags=[
                    "Becomes defensive",
                    "Dismisses feedback",
                    "Cannot recall receiving feedback",
                ],
                bonus_indicators=[
                    "Sought out feedback proactively",
                    "Made significant improvements",
                    "Now helps others grow",
                ],
            ),
        ]

        # Add leadership question for senior roles
        if jd.level in ["Senior", "Staff", "Principal"]:
            behavioral_questions.append(InterviewQuestion(
                question="Tell me about a time you mentored or helped develop another engineer. What was your approach?",
                skill_assessed="leadership",
                difficulty="medium",
                evaluation_criteria=[
                    "Takes active interest in others' growth",
                    "Adapts mentoring style to individual",
                    "Provides both support and challenge",
                    "Celebrates mentee successes",
                ],
                red_flags=[
                    "Has never mentored anyone",
                    "Focuses only on technical not personal development",
                    "Takes credit for mentee's work",
                ],
                bonus_indicators=[
                    "Mentee went on to mentor others",
                    "Created sustainable learning resources",
                    "Influenced team culture positively",
                ],
            ))

        # Generate system design prompt based on role
        role_lower = jd.role_title.lower()
        if "frontend" in role_lower:
            system_design_prompt = "Design a frontend architecture for a real-time collaborative document editor (like Google Docs). Consider state management, real-time sync, offline support, and performance optimization. Walk through your component structure, data flow, and key technical decisions."
        elif "backend" in role_lower:
            system_design_prompt = "Design a scalable URL shortening service that handles millions of requests per day. Consider the database schema, caching strategy, analytics tracking, and API design. Walk through your architecture and key technical decisions."
        elif "data" in role_lower:
            system_design_prompt = "Design a data pipeline that ingests, processes, and analyzes user activity events at scale. Consider data storage, processing frameworks, data quality, and serving for analytics. Walk through your architecture and key technical decisions."
        else:
            system_design_prompt = "Design a notification system that can deliver messages across multiple channels (email, push, SMS, in-app) with user preferences and rate limiting. Consider scalability, reliability, and extensibility. Walk through your architecture and key technical decisions."

        return InterviewRubricResult(
            role_title=jd.role_title,
            technical_questions=technical_questions,
            behavioral_questions=behavioral_questions,
            system_design_prompt=system_design_prompt,
            culture_fit_criteria=jd.cultural_indicators or [
                "Collaborative and team-oriented",
                "Takes ownership and accountability",
                "Open to feedback and continuous improvement",
                "Communicates proactively and clearly",
            ],
        )

    def create_candidate_scorecard(
        self,
        requirement: HiringRequirement,
        candidate_skills: dict[str, int],
        candidate_name: str | None = None,
    ) -> CandidateScorecardResult:
        """Create a candidate scorecard.

        Args:
            requirement: Hiring requirement with skills.
            candidate_skills: Candidate's skill scores.
            candidate_name: Optional candidate name.

        Returns:
            CandidateScorecardResult.
        """
        assessments: list[CandidateSkillAssessment] = []
        must_have_met = 0
        nice_to_have_met = 0

        # Assess must-have skills
        for skill_data in requirement.must_have_skills:
            skill = skill_data.get("skill", "")
            required_level = skill_data.get("level", 60)
            candidate_level = candidate_skills.get(skill, 0)
            meets = candidate_level >= required_level

            if meets:
                must_have_met += 1

            assessments.append(CandidateSkillAssessment(
                skill=skill,
                candidate_level=candidate_level,
                required_level=required_level,
                meets_requirement=meets,
                gap=required_level - candidate_level if not meets else 0,
            ))

        # Assess nice-to-have skills
        for skill_data in requirement.nice_to_have_skills:
            skill = skill_data.get("skill", "")
            required_level = skill_data.get("level", 40)
            candidate_level = candidate_skills.get(skill, 0)
            meets = candidate_level >= required_level

            if meets:
                nice_to_have_met += 1

            assessments.append(CandidateSkillAssessment(
                skill=skill,
                candidate_level=candidate_level,
                required_level=required_level,
                meets_requirement=meets,
                gap=required_level - candidate_level if not meets else 0,
            ))

        must_have_total = len(requirement.must_have_skills)
        nice_to_have_total = len(requirement.nice_to_have_skills)

        # Calculate overall score
        must_have_score = (must_have_met / must_have_total * 70) if must_have_total > 0 else 35
        nice_to_have_score = (nice_to_have_met / nice_to_have_total * 30) if nice_to_have_total > 0 else 15
        overall_score = must_have_score + nice_to_have_score

        # Identify strengths and concerns
        strengths = [a.skill for a in assessments if a.meets_requirement and a.candidate_level > 70]
        concerns = [a.skill for a in assessments if not a.meets_requirement and a.required_level >= 60]

        # Determine recommendation
        if must_have_met == must_have_total and overall_score >= 80:
            recommendation = "strong_yes"
        elif must_have_met >= must_have_total * 0.8 and overall_score >= 60:
            recommendation = "yes"
        elif must_have_met >= must_have_total * 0.5:
            recommendation = "maybe"
        else:
            recommendation = "no"

        return CandidateScorecardResult(
            requirement_id=str(requirement.id),
            role_title=requirement.role_title,
            candidate_name=candidate_name,
            overall_score=round(overall_score, 1),
            must_have_met=must_have_met,
            must_have_total=must_have_total,
            nice_to_have_met=nice_to_have_met,
            nice_to_have_total=nice_to_have_total,
            skill_assessments=assessments,
            strengths=strengths[:5],
            concerns=concerns[:5],
            recommendation=recommendation,
        )

    async def create_hiring_requirement(
        self,
        organization_id: str,
        role_title: str,
        team_developers: list[Developer] | None = None,
        team_id: str | None = None,
        target_role_id: str | None = None,
        priority: str = "medium",
        timeline: str | None = None,
        roadmap_items: list[str] | None = None,
    ) -> HiringRequirement:
        """Create a hiring requirement from team analysis.

        Args:
            organization_id: Organization UUID.
            role_title: Role title.
            team_developers: Optional team for gap analysis.
            team_id: Optional team ID.
            target_role_id: Optional target role ID.
            priority: Hiring priority.
            timeline: Target timeline.
            roadmap_items: Related roadmap items.

        Returns:
            Created HiringRequirement.
        """
        if not self.db:
            raise ValueError("Database session required")

        # Perform gap analysis if team provided
        gap_analysis = None
        if team_developers:
            gap_analysis = self.analyze_team_gaps(team_developers)

        # Generate JD
        level = "Senior"  # Default
        jd = await self.generate_job_description(
            gap_analysis or TeamGapAnalysisResult(
                team_id=team_id,
                organization_id=organization_id,
                total_developers=0,
                skill_gaps=[],
                bus_factor_risks=[],
                critical_missing_skills=[],
                analysis_date=datetime.utcnow(),
            ),
            role_title=role_title,
            level=level,
            priority=priority,
        )

        # Generate interview rubric
        rubric = await self.generate_interview_rubric(jd, gap_analysis)
        rubric_dict = {
            "role_title": rubric.role_title,
            "technical_questions": [
                {
                    "question": q.question,
                    "skill_assessed": q.skill_assessed,
                    "difficulty": q.difficulty,
                    "evaluation_criteria": q.evaluation_criteria,
                    "red_flags": q.red_flags,
                    "bonus_indicators": q.bonus_indicators,
                }
                for q in rubric.technical_questions
            ],
            "behavioral_questions": [
                {
                    "question": q.question,
                    "skill_assessed": q.skill_assessed,
                    "difficulty": q.difficulty,
                    "evaluation_criteria": q.evaluation_criteria,
                    "red_flags": q.red_flags,
                    "bonus_indicators": q.bonus_indicators,
                }
                for q in rubric.behavioral_questions
            ],
            "system_design_prompt": rubric.system_design_prompt,
            "culture_fit_criteria": rubric.culture_fit_criteria,
        }

        # Create requirement
        requirement = HiringRequirement(
            id=str(uuid4()),
            organization_id=organization_id,
            team_id=team_id,
            target_role_id=target_role_id,
            role_title=jd.role_title,
            priority=priority,
            timeline=timeline,
            must_have_skills=jd.must_have_skills,
            nice_to_have_skills=jd.nice_to_have_skills,
            soft_skill_requirements={},
            gap_analysis={
                "total_developers": gap_analysis.total_developers if gap_analysis else 0,
                "critical_skills": gap_analysis.critical_missing_skills if gap_analysis else [],
            },
            roadmap_items=roadmap_items or [],
            job_description=jd.full_text,
            interview_rubric=rubric_dict,
            status="draft",
            generated_by_model=self.llm_gateway.model_name if self.llm_gateway else "manual",
        )

        self.db.add(requirement)
        await self.db.commit()
        await self.db.refresh(requirement)

        return requirement

    async def get_hiring_requirement(self, requirement_id: str) -> HiringRequirement | None:
        """Get a hiring requirement by ID."""
        if not self.db:
            return None

        result = await self.db.execute(
            select(HiringRequirement).where(HiringRequirement.id == requirement_id)
        )
        return result.scalar_one_or_none()

    async def get_organization_requirements(
        self,
        organization_id: str,
        status: str | None = None,
        team_id: str | None = None,
    ) -> list[HiringRequirement]:
        """Get hiring requirements for an organization.

        Args:
            organization_id: Organization UUID.
            status: Optional status filter.
            team_id: Optional team filter.

        Returns:
            List of hiring requirements.
        """
        if not self.db:
            return []

        query = select(HiringRequirement).where(
            HiringRequirement.organization_id == organization_id
        )

        if status:
            query = query.where(HiringRequirement.status == status)

        if team_id:
            query = query.where(HiringRequirement.team_id == team_id)

        query = query.order_by(HiringRequirement.created_at.desc())

        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def update_requirement_status(
        self,
        requirement_id: str,
        status: str,
    ) -> bool:
        """Update hiring requirement status."""
        requirement = await self.get_hiring_requirement(requirement_id)
        if not requirement:
            return False

        requirement.status = status
        await self.db.commit()
        return True
