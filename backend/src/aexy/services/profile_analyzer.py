"""Profile analyzer service for skill extraction and analysis."""

import logging
import re
from collections import Counter
from typing import Any

from aexy.schemas.developer import (
    DomainExpertise,
    FrameworkSkill,
    GrowthTrajectory,
    LanguageSkill,
    SkillFingerprint,
    WorkPatterns,
)

logger = logging.getLogger(__name__)


# Language detection by file extension
LANGUAGE_EXTENSIONS: dict[str, str] = {
    ".py": "Python",
    ".js": "JavaScript",
    ".ts": "TypeScript",
    ".tsx": "TypeScript",
    ".jsx": "JavaScript",
    ".go": "Go",
    ".rs": "Rust",
    ".java": "Java",
    ".kt": "Kotlin",
    ".swift": "Swift",
    ".rb": "Ruby",
    ".php": "PHP",
    ".cs": "C#",
    ".cpp": "C++",
    ".c": "C",
    ".scala": "Scala",
    ".clj": "Clojure",
    ".ex": "Elixir",
    ".erl": "Erlang",
    ".hs": "Haskell",
    ".r": "R",
    ".sql": "SQL",
    ".sh": "Shell",
    ".bash": "Shell",
    ".zsh": "Shell",
    ".vue": "Vue",
    ".svelte": "Svelte",
}

# Framework detection patterns
FRAMEWORK_PATTERNS: dict[str, dict[str, Any]] = {
    # Python
    "FastAPI": {"files": ["requirements.txt", "pyproject.toml"], "patterns": [r"fastapi"], "category": "web"},
    "Django": {"files": ["requirements.txt", "pyproject.toml"], "patterns": [r"django"], "category": "web"},
    "Flask": {"files": ["requirements.txt", "pyproject.toml"], "patterns": [r"flask"], "category": "web"},
    "SQLAlchemy": {"files": ["requirements.txt", "pyproject.toml"], "patterns": [r"sqlalchemy"], "category": "database"},
    "Pandas": {"files": ["requirements.txt", "pyproject.toml"], "patterns": [r"pandas"], "category": "data"},
    "PyTorch": {"files": ["requirements.txt", "pyproject.toml"], "patterns": [r"torch", r"pytorch"], "category": "ml"},
    "TensorFlow": {"files": ["requirements.txt", "pyproject.toml"], "patterns": [r"tensorflow"], "category": "ml"},
    # JavaScript/TypeScript
    "React": {"files": ["package.json"], "patterns": [r'"react"'], "category": "web"},
    "Next.js": {"files": ["package.json"], "patterns": [r'"next"'], "category": "web"},
    "Vue": {"files": ["package.json"], "patterns": [r'"vue"'], "category": "web"},
    "Express": {"files": ["package.json"], "patterns": [r'"express"'], "category": "web"},
    "NestJS": {"files": ["package.json"], "patterns": [r'"@nestjs/core"'], "category": "web"},
    # Go
    "Gin": {"files": ["go.mod"], "patterns": [r"github.com/gin-gonic/gin"], "category": "web"},
    "Echo": {"files": ["go.mod"], "patterns": [r"github.com/labstack/echo"], "category": "web"},
    # Database
    "PostgreSQL": {"files": ["*"], "patterns": [r"postgresql", r"postgres", r"psycopg"], "category": "database"},
    "MongoDB": {"files": ["*"], "patterns": [r"mongodb", r"mongoose", r"pymongo"], "category": "database"},
    "Redis": {"files": ["*"], "patterns": [r"redis"], "category": "database"},
}

# Domain keywords for classification
DOMAIN_KEYWORDS: dict[str, list[str]] = {
    "payments": ["stripe", "payment", "billing", "invoice", "checkout", "subscription"],
    "authentication": ["auth", "oauth", "jwt", "login", "session", "passport", "keycloak"],
    "data_pipeline": ["etl", "pipeline", "airflow", "kafka", "spark", "dbt", "warehouse"],
    "ml_infrastructure": ["model", "training", "inference", "mlflow", "kubeflow", "sagemaker"],
    "mobile": ["react-native", "flutter", "ios", "android", "swift", "kotlin"],
    "devops": ["docker", "kubernetes", "terraform", "ansible", "jenkins", "cicd"],
    "security": ["encryption", "vulnerability", "firewall", "security", "oauth", "sso"],
    "frontend": ["ui", "ux", "component", "css", "styled", "tailwind", "material"],
    "backend": ["api", "rest", "graphql", "grpc", "microservice", "server"],
    "testing": ["test", "jest", "pytest", "cypress", "playwright", "selenium"],
}


class ProfileAnalyzer:
    """Analyzes GitHub activity to build developer profiles."""

    def extract_languages_from_files(self, file_paths: list[str]) -> dict[str, int]:
        """Extract language distribution from file paths."""
        language_counts: Counter[str] = Counter()

        for path in file_paths:
            for ext, language in LANGUAGE_EXTENSIONS.items():
                if path.endswith(ext):
                    language_counts[language] += 1
                    break

        return dict(language_counts)

    def detect_language_from_extension(self, filename: str) -> str | None:
        """Detect programming language from file extension."""
        for ext, language in LANGUAGE_EXTENSIONS.items():
            if filename.endswith(ext):
                return language
        return None

    def analyze_commits(
        self,
        commits: list[dict[str, Any]],
    ) -> tuple[dict[str, int], dict[str, int]]:
        """Analyze commits to extract language usage and line counts.

        Returns:
            Tuple of (language_commits, language_lines)
        """
        language_commits: Counter[str] = Counter()
        language_lines: Counter[str] = Counter()

        for commit in commits:
            files = commit.get("files", [])
            for file_info in files:
                filename = file_info.get("filename", "")
                language = self.detect_language_from_extension(filename)

                if language:
                    language_commits[language] += 1
                    additions = file_info.get("additions", 0)
                    deletions = file_info.get("deletions", 0)
                    language_lines[language] += additions + deletions

        return dict(language_commits), dict(language_lines)

    def calculate_proficiency_score(
        self,
        commits_count: int,
        lines_of_code: int,
        total_commits: int,
        total_lines: int,
    ) -> float:
        """Calculate proficiency score based on activity metrics.

        Score is 0-100 based on:
        - Proportion of commits in this language
        - Proportion of lines in this language
        - Absolute activity level (with diminishing returns)
        """
        if total_commits == 0 or total_lines == 0:
            return 0.0

        commit_ratio = commits_count / total_commits
        lines_ratio = lines_of_code / total_lines

        # Weighted average: commits matter more than raw lines
        ratio_score = (commit_ratio * 0.6 + lines_ratio * 0.4) * 100

        # Apply activity bonus with diminishing returns
        activity_bonus = min(10, (commits_count / 100) * 10)

        score = min(100, ratio_score + activity_bonus)
        return round(score, 1)

    def build_language_skills(
        self,
        language_commits: dict[str, int],
        language_lines: dict[str, int],
    ) -> list[LanguageSkill]:
        """Build language skill profiles from commit analysis."""
        total_commits = sum(language_commits.values())
        total_lines = sum(language_lines.values())

        skills = []
        for language, commits_count in language_commits.items():
            lines = language_lines.get(language, 0)
            score = self.calculate_proficiency_score(
                commits_count=commits_count,
                lines_of_code=lines,
                total_commits=total_commits,
                total_lines=total_lines,
            )

            # Determine trend (placeholder - would need historical data)
            trend = "stable"
            if commits_count > total_commits * 0.3:
                trend = "growing"
            elif commits_count < total_commits * 0.05:
                trend = "declining"

            skills.append(
                LanguageSkill(
                    name=language,
                    proficiency_score=score,
                    lines_of_code=lines,
                    commits_count=commits_count,
                    trend=trend,
                )
            )

        # Sort by proficiency score
        skills.sort(key=lambda x: x.proficiency_score, reverse=True)
        return skills

    def detect_frameworks(
        self,
        file_contents: dict[str, str],
    ) -> list[FrameworkSkill]:
        """Detect frameworks from dependency files and code."""
        detected: list[FrameworkSkill] = []

        for framework_name, config in FRAMEWORK_PATTERNS.items():
            for filename, content in file_contents.items():
                # Check if file matches
                patterns = config.get("patterns", [])
                for pattern in patterns:
                    if re.search(pattern, content, re.IGNORECASE):
                        detected.append(
                            FrameworkSkill(
                                name=framework_name,
                                category=config.get("category", "other"),
                                proficiency_score=50.0,  # Base score, refined with usage data
                                usage_count=1,
                            )
                        )
                        break

        # Deduplicate
        seen = set()
        unique: list[FrameworkSkill] = []
        for fw in detected:
            if fw.name not in seen:
                seen.add(fw.name)
                unique.append(fw)

        return unique

    def detect_domains(
        self,
        pr_titles: list[str],
        pr_descriptions: list[str],
        commit_messages: list[str],
    ) -> list[DomainExpertise]:
        """Detect domain expertise from PR and commit content."""
        all_text = " ".join(pr_titles + pr_descriptions + commit_messages).lower()

        domain_scores: dict[str, int] = {}

        for domain, keywords in DOMAIN_KEYWORDS.items():
            score = 0
            for keyword in keywords:
                count = len(re.findall(rf"\b{keyword}\b", all_text))
                score += count

            if score > 0:
                domain_scores[domain] = score

        # Convert to confidence scores (0-100)
        total_score = sum(domain_scores.values()) if domain_scores else 1
        domains = []

        for domain, score in domain_scores.items():
            confidence = min(100, (score / total_score) * 100 + score * 2)
            domains.append(
                DomainExpertise(
                    name=domain,
                    confidence_score=round(confidence, 1),
                )
            )

        domains.sort(key=lambda x: x.confidence_score, reverse=True)
        return domains[:5]  # Top 5 domains

    def analyze_work_patterns(
        self,
        commits: list[dict[str, Any]],
        pull_requests: list[dict[str, Any]],
    ) -> WorkPatterns:
        """Analyze work patterns from commits and PRs."""
        # Analyze commit hours
        hours: list[int] = []
        for commit in commits:
            timestamp = commit.get("commit", {}).get("author", {}).get("date", "")
            if timestamp:
                try:
                    # Extract hour from ISO format
                    hour = int(timestamp[11:13])
                    hours.append(hour)
                except (ValueError, IndexError):
                    pass

        # Find peak hours (top 3 most active)
        hour_counts = Counter(hours)
        peak_hours = [h for h, _ in hour_counts.most_common(3)]

        # Analyze PR sizes
        pr_sizes = []
        for pr in pull_requests:
            additions = pr.get("additions", 0)
            deletions = pr.get("deletions", 0)
            pr_sizes.append(additions + deletions)

        avg_pr_size = int(sum(pr_sizes) / len(pr_sizes)) if pr_sizes else 0

        # Determine complexity preference
        if avg_pr_size > 500:
            complexity = "complex"
        elif avg_pr_size > 100:
            complexity = "medium"
        else:
            complexity = "simple"

        return WorkPatterns(
            preferred_complexity=complexity,
            collaboration_style="balanced",  # Would need co-author data
            peak_productivity_hours=peak_hours,
            average_pr_size=avg_pr_size,
            average_review_turnaround_hours=0.0,  # Would need review timestamps
        )

    def build_skill_fingerprint(
        self,
        commits: list[dict[str, Any]],
        pull_requests: list[dict[str, Any]],
        file_contents: dict[str, str] | None = None,
    ) -> SkillFingerprint:
        """Build complete skill fingerprint from GitHub activity."""
        # Analyze commits for languages
        language_commits, language_lines = self.analyze_commits(commits)
        languages = self.build_language_skills(language_commits, language_lines)

        # Detect frameworks
        frameworks = []
        if file_contents:
            frameworks = self.detect_frameworks(file_contents)

        # Detect domains
        pr_titles = [pr.get("title", "") for pr in pull_requests]
        pr_descriptions = [pr.get("body", "") or "" for pr in pull_requests]
        commit_messages = [
            c.get("commit", {}).get("message", "") for c in commits
        ]
        domains = self.detect_domains(pr_titles, pr_descriptions, commit_messages)

        return SkillFingerprint(
            languages=languages,
            frameworks=frameworks,
            domains=domains,
            tools=[],  # Would need additional analysis
        )

    def build_growth_trajectory(
        self,
        recent_languages: list[LanguageSkill],
        historical_languages: list[LanguageSkill],
    ) -> GrowthTrajectory:
        """Build growth trajectory comparing recent vs historical skills."""
        recent_names = {lang.name for lang in recent_languages}
        historical_names = {lang.name for lang in historical_languages}

        acquired = list(recent_names - historical_names)
        declining = list(historical_names - recent_names)

        # Calculate learning velocity (new skills per period)
        velocity = len(acquired) / 6  # Assuming 6-month period

        return GrowthTrajectory(
            skills_acquired_6m=acquired,
            skills_acquired_12m=acquired,  # Would need 12-month data
            skills_declining=declining,
            learning_velocity=round(velocity, 2),
        )


class LLMEnhancedProfileAnalyzer(ProfileAnalyzer):
    """Profile analyzer with LLM-powered skill extraction.

    Extends the base ProfileAnalyzer with LLM capabilities for:
    - Deep code analysis
    - Semantic skill extraction
    - Soft skills assessment
    - Enhanced domain detection
    """

    def __init__(self, llm_gateway: Any = None) -> None:
        """Initialize the enhanced analyzer.

        Args:
            llm_gateway: Optional LLM gateway for enhanced analysis.
        """
        super().__init__()
        self._llm = llm_gateway

    @property
    def llm_enabled(self) -> bool:
        """Check if LLM is available."""
        return self._llm is not None

    def set_llm_gateway(self, gateway: Any) -> None:
        """Set the LLM gateway.

        Args:
            gateway: LLM gateway instance.
        """
        self._llm = gateway

    async def build_skill_fingerprint_enhanced(
        self,
        commits: list[dict[str, Any]],
        pull_requests: list[dict[str, Any]],
        file_contents: dict[str, str] | None = None,
        code_samples: list[str] | None = None,
        use_llm: bool = True,
    ) -> SkillFingerprint:
        """Build enhanced skill fingerprint using LLM.

        Args:
            commits: List of commit data.
            pull_requests: List of PR data.
            file_contents: Optional dependency file contents.
            code_samples: Optional code samples for deep analysis.
            use_llm: Whether to use LLM enhancement.

        Returns:
            Enhanced skill fingerprint.
        """
        # Start with base analysis
        base_fingerprint = self.build_skill_fingerprint(
            commits=commits,
            pull_requests=pull_requests,
            file_contents=file_contents,
        )

        if not use_llm or not self._llm:
            return base_fingerprint

        # Enhance with LLM analysis
        try:
            from aexy.services.code_analyzer import CodeAnalyzer

            code_analyzer = CodeAnalyzer(llm_gateway=self._llm)

            # Prepare data for analysis
            commits_data = [
                {
                    "message": c.get("commit", {}).get("message", c.get("message", "")),
                    "files_changed": len(c.get("files", [])),
                    "additions": sum(f.get("additions", 0) for f in c.get("files", [])),
                    "deletions": sum(f.get("deletions", 0) for f in c.get("files", [])),
                }
                for c in commits[:20]
            ]

            prs_data = [
                {
                    "title": pr.get("title", ""),
                    "description": pr.get("body", "") or pr.get("description", ""),
                    "files_changed": pr.get("changed_files", 0),
                    "additions": pr.get("additions", 0),
                    "deletions": pr.get("deletions", 0),
                }
                for pr in pull_requests[:10]
            ]

            # Run LLM analysis
            llm_result = await code_analyzer.analyze_developer_activity(
                commits=commits_data,
                pull_requests=prs_data,
            )

            # Merge results
            return self._merge_fingerprints(base_fingerprint, llm_result)

        except Exception as e:
            logger.warning(f"LLM enhancement failed, using base analysis: {e}")
            return base_fingerprint

    def _merge_fingerprints(
        self,
        base: SkillFingerprint,
        llm_result: Any,
    ) -> SkillFingerprint:
        """Merge base fingerprint with LLM results.

        Args:
            base: Base skill fingerprint.
            llm_result: LLM analysis result.

        Returns:
            Merged skill fingerprint.
        """
        # Create dicts for easy lookup
        languages_dict = {lang.name: lang for lang in base.languages}
        frameworks_dict = {fw.name: fw for fw in base.frameworks}
        domains_dict = {dom.name: dom for dom in base.domains}

        # Merge LLM languages
        for lang_name, llm_lang in llm_result.languages.items():
            if lang_name in languages_dict:
                # Boost confidence based on LLM
                existing = languages_dict[lang_name]
                # Average the scores, giving slight preference to activity-based
                new_score = (existing.proficiency_score * 0.6 + llm_lang.confidence * 100 * 0.4)
                languages_dict[lang_name] = LanguageSkill(
                    name=lang_name,
                    proficiency_score=min(100, new_score),
                    lines_of_code=existing.lines_of_code,
                    commits_count=existing.commits_count,
                    trend=existing.trend,
                )
            else:
                # New language detected by LLM
                languages_dict[lang_name] = LanguageSkill(
                    name=lang_name,
                    proficiency_score=llm_lang.confidence * 100,
                    lines_of_code=0,
                    commits_count=0,
                    trend="stable",
                )

        # Merge LLM frameworks
        for fw_name, llm_fw in llm_result.frameworks.items():
            if fw_name not in frameworks_dict:
                frameworks_dict[fw_name] = FrameworkSkill(
                    name=fw_name,
                    category=llm_fw.category,
                    proficiency_score=llm_fw.confidence * 100,
                    usage_count=1,
                )
            else:
                # Boost existing framework confidence
                existing = frameworks_dict[fw_name]
                new_score = (existing.proficiency_score + llm_fw.confidence * 100) / 2
                frameworks_dict[fw_name] = FrameworkSkill(
                    name=fw_name,
                    category=existing.category,
                    proficiency_score=min(100, new_score),
                    usage_count=existing.usage_count + 1,
                )

        # Merge LLM domains
        for domain_name, llm_domain in llm_result.domains.items():
            if domain_name not in domains_dict:
                domains_dict[domain_name] = DomainExpertise(
                    name=domain_name,
                    confidence_score=llm_domain.confidence * 100,
                )
            else:
                existing = domains_dict[domain_name]
                new_score = (existing.confidence_score + llm_domain.confidence * 100) / 2
                domains_dict[domain_name] = DomainExpertise(
                    name=domain_name,
                    confidence_score=min(100, new_score),
                )

        # Rebuild sorted lists
        languages = sorted(
            languages_dict.values(),
            key=lambda x: x.proficiency_score,
            reverse=True,
        )
        frameworks = sorted(
            frameworks_dict.values(),
            key=lambda x: x.proficiency_score,
            reverse=True,
        )
        domains = sorted(
            domains_dict.values(),
            key=lambda x: x.confidence_score,
            reverse=True,
        )[:5]

        return SkillFingerprint(
            languages=languages,
            frameworks=frameworks,
            domains=domains,
            tools=base.tools,
        )

    async def analyze_soft_skills(
        self,
        pull_requests: list[dict[str, Any]],
        reviews: list[dict[str, Any]],
    ) -> dict[str, Any]:
        """Analyze soft skills from PRs and reviews.

        Args:
            pull_requests: List of PR data.
            reviews: List of review data.

        Returns:
            Soft skills analysis dict.
        """
        if not self._llm:
            return {
                "communication_score": 0,
                "mentorship_score": 0,
                "collaboration_score": 0,
                "leadership_score": 0,
            }

        try:
            from aexy.services.soft_skills_analyzer import SoftSkillsAnalyzer

            analyzer = SoftSkillsAnalyzer(llm_gateway=self._llm)

            prs_data = [
                {
                    "title": pr.get("title", ""),
                    "description": pr.get("body", "") or pr.get("description", ""),
                    "files_changed": pr.get("changed_files", 0),
                    "additions": pr.get("additions", 0),
                    "deletions": pr.get("deletions", 0),
                }
                for pr in pull_requests
            ]

            reviews_data = [
                {
                    "body": r.get("body", ""),
                    "state": r.get("state", "commented"),
                }
                for r in reviews
            ]

            profile = await analyzer.build_profile(
                pull_requests=prs_data,
                reviews=reviews_data,
            )

            return profile.model_dump()

        except Exception as e:
            logger.warning(f"Soft skills analysis failed: {e}")
            return {
                "communication_score": 0,
                "mentorship_score": 0,
                "collaboration_score": 0,
                "leadership_score": 0,
            }
