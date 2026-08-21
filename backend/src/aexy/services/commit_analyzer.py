"""Semantic commit message analyzer.

Analyzes commit messages using LLM and pattern matching to extract:
- Commit type (feat, fix, refactor, chore, docs, test, style, perf)
- Scope (component affected)
- Breaking change detection
- Quality scoring
- Semantic tags
"""

import logging
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.activity import Commit

logger = logging.getLogger(__name__)


class CommitType(str, Enum):
    """Conventional commit types."""
    FEATURE = "feat"
    FIX = "fix"
    REFACTOR = "refactor"
    CHORE = "chore"
    DOCS = "docs"
    TEST = "test"
    STYLE = "style"
    PERF = "perf"
    BUILD = "build"
    CI = "ci"
    REVERT = "revert"
    UNKNOWN = "unknown"


# Patterns for conventional commits: type(scope): message
CONVENTIONAL_COMMIT_PATTERN = re.compile(
    r"^(?P<type>feat|fix|refactor|chore|docs|test|style|perf|build|ci|revert)"
    r"(?:\((?P<scope>[^)]+)\))?"
    r"(?P<breaking>!)?"
    r":\s*(?P<subject>.+)$",
    re.IGNORECASE | re.MULTILINE,
)

# Keywords for detecting commit types when not using conventional commits
TYPE_KEYWORDS = {
    CommitType.FEATURE: ["add", "new", "implement", "create", "introduce", "support"],
    CommitType.FIX: ["fix", "bug", "issue", "resolve", "correct", "patch", "repair"],
    CommitType.REFACTOR: ["refactor", "restructure", "reorganize", "simplify", "clean"],
    CommitType.CHORE: ["update", "upgrade", "bump", "dependencies", "maintenance"],
    CommitType.DOCS: ["doc", "readme", "comment", "documentation", "typo"],
    CommitType.TEST: ["test", "spec", "coverage", "mock", "stub"],
    CommitType.STYLE: ["format", "style", "lint", "whitespace", "indent"],
    CommitType.PERF: ["perf", "performance", "optimize", "speed", "faster", "cache"],
    CommitType.BUILD: ["build", "compile", "bundle", "webpack", "rollup"],
    CommitType.CI: ["ci", "pipeline", "workflow", "github action", "travis", "jenkins"],
    CommitType.REVERT: ["revert", "undo", "rollback"],
}

# Breaking change indicators
BREAKING_INDICATORS = [
    "breaking change",
    "breaking:",
    "BREAKING:",
    "BREAKING CHANGE",
    "incompatible",
    "migration required",
    "deprecated",
]

# Domain keywords for semantic tagging
DOMAIN_KEYWORDS = {
    "authentication": ["auth", "login", "logout", "oauth", "jwt", "token", "session", "password"],
    "security": ["security", "vulnerability", "cve", "xss", "csrf", "injection", "encrypt"],
    "database": ["database", "db", "sql", "query", "migration", "schema", "model"],
    "api": ["api", "endpoint", "rest", "graphql", "grpc", "route", "controller"],
    "frontend": ["ui", "component", "css", "style", "layout", "responsive", "react", "vue"],
    "backend": ["server", "service", "handler", "middleware", "worker"],
    "testing": ["test", "spec", "coverage", "mock", "fixture", "e2e", "integration"],
    "devops": ["deploy", "docker", "kubernetes", "k8s", "ci", "cd", "pipeline", "terraform"],
    "performance": ["performance", "cache", "optimize", "speed", "memory", "cpu"],
    "documentation": ["docs", "readme", "changelog", "comment", "guide"],
    "payments": ["payment", "stripe", "billing", "invoice", "subscription", "checkout"],
    "notifications": ["notification", "email", "sms", "push", "alert", "webhook"],
}


@dataclass
class SemanticAnalysis:
    """Result of semantic commit analysis."""
    type: str
    scope: str | None
    breaking: bool
    quality_score: int
    semantic_tags: list[str]
    analyzed_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))

    def to_dict(self) -> dict:
        """Convert to dictionary for JSONB storage."""
        return {
            "type": self.type,
            "scope": self.scope,
            "breaking": self.breaking,
            "quality_score": self.quality_score,
            "semantic_tags": self.semantic_tags,
            "analyzed_at": self.analyzed_at.isoformat(),
        }


class CommitAnalyzer:
    """Analyzes commit messages for semantic meaning and quality."""

    def __init__(self, db: AsyncSession):
        self.db = db

    async def analyze_commit(
        self,
        commit: Commit,
        use_llm: bool = False,
    ) -> SemanticAnalysis:
        """Analyze a single commit message.

        Args:
            commit: Commit model instance.
            use_llm: Whether to use LLM for deeper analysis (more expensive).

        Returns:
            SemanticAnalysis with extracted information.
        """
        message = commit.message or ""

        # Try conventional commit pattern first
        match = CONVENTIONAL_COMMIT_PATTERN.match(message)

        if match:
            commit_type = match.group("type").lower()
            scope = match.group("scope")
            breaking = bool(match.group("breaking"))
            subject = match.group("subject")
        else:
            # Fall back to keyword detection
            commit_type = self._detect_type_from_keywords(message)
            scope = self._extract_scope_heuristic(message, commit.languages or [])
            breaking = self._detect_breaking_change(message)
            subject = message.split("\n")[0][:100]  # First line, max 100 chars

        # Calculate quality score
        quality_score = self._calculate_quality_score(message, bool(match))

        # Extract semantic tags
        semantic_tags = self._extract_semantic_tags(message)

        # Add language-based tags
        if commit.languages:
            for lang in commit.languages[:3]:  # Limit to top 3 languages
                if lang.lower() not in [t.lower() for t in semantic_tags]:
                    semantic_tags.append(lang.lower())

        # Optional: Use LLM for deeper analysis
        if use_llm:
            llm_analysis = await self._analyze_with_llm(commit)
            if llm_analysis:
                # Merge LLM insights
                semantic_tags = list(set(semantic_tags + llm_analysis.get("tags", [])))
                if llm_analysis.get("scope") and not scope:
                    scope = llm_analysis["scope"]
                if llm_analysis.get("breaking"):
                    breaking = True

        return SemanticAnalysis(
            type=commit_type,
            scope=scope,
            breaking=breaking,
            quality_score=quality_score,
            semantic_tags=semantic_tags[:10],  # Limit to 10 tags
        )

    async def analyze_commits_batch(
        self,
        developer_id: str,
        limit: int = 100,
        use_llm: bool = False,
    ) -> dict:
        """Analyze recent commits for a developer.

        Args:
            developer_id: Developer UUID.
            limit: Maximum commits to analyze.
            use_llm: Whether to use LLM for analysis.

        Returns:
            Summary statistics and list of analyses.
        """
        # Fetch commits that haven't been analyzed
        stmt = (
            select(Commit)
            .where(
                Commit.developer_id == developer_id,
                Commit.semantic_analysis.is_(None),
            )
            .order_by(Commit.committed_at.desc())
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        commits = result.scalars().all()

        analyses = []
        type_counts: dict[str, int] = {}
        tag_counts: dict[str, int] = {}
        total_quality = 0
        breaking_count = 0

        for commit in commits:
            analysis = await self.analyze_commit(commit, use_llm=use_llm)

            # Store analysis in the commit
            commit.semantic_analysis = analysis.to_dict()
            analyses.append(analysis)

            # Aggregate stats
            type_counts[analysis.type] = type_counts.get(analysis.type, 0) + 1
            for tag in analysis.semantic_tags:
                tag_counts[tag] = tag_counts.get(tag, 0) + 1
            total_quality += analysis.quality_score
            if analysis.breaking:
                breaking_count += 1

        # Flush changes to database
        if commits:
            await self.db.flush()

        return {
            "commits_analyzed": len(analyses),
            "type_distribution": type_counts,
            "top_tags": sorted(tag_counts.items(), key=lambda x: -x[1])[:10],
            "average_quality_score": total_quality / len(analyses) if analyses else 0,
            "breaking_changes_count": breaking_count,
            "analyses": [a.to_dict() for a in analyses],
        }

    def _detect_type_from_keywords(self, message: str) -> str:
        """Detect commit type from keywords in message."""
        message_lower = message.lower()

        for commit_type, keywords in TYPE_KEYWORDS.items():
            for keyword in keywords:
                if keyword in message_lower:
                    return commit_type.value

        return CommitType.UNKNOWN.value

    def _extract_scope_heuristic(
        self,
        message: str,
        languages: list[str],
    ) -> str | None:
        """Extract scope from message using heuristics."""
        # Look for common scope patterns
        patterns = [
            r"\[([^\]]+)\]",  # [scope]
            r"\(([^)]+)\):",  # (scope):
            r"^(\w+):",  # scope:
        ]

        for pattern in patterns:
            match = re.search(pattern, message)
            if match:
                scope = match.group(1).lower()
                # Filter out common non-scope patterns
                if scope not in ["wip", "todo", "fixme", "hack"]:
                    return scope

        # Try to infer from file paths if mentioned
        file_patterns = [
            r"(?:in|at|from|to)\s+([a-z_]+(?:/[a-z_]+)*)",
            r"([a-z_]+)\.(?:py|ts|js|go|rs|java)",
        ]

        for pattern in file_patterns:
            match = re.search(pattern, message.lower())
            if match:
                path_part = match.group(1).split("/")[0]
                if len(path_part) > 2:
                    return path_part

        return None

    def _detect_breaking_change(self, message: str) -> bool:
        """Detect if commit introduces breaking changes."""
        message_lower = message.lower()
        return any(indicator.lower() in message_lower for indicator in BREAKING_INDICATORS)

    def _calculate_quality_score(self, message: str, is_conventional: bool) -> int:
        """Calculate commit message quality score (0-100)."""
        score = 0

        # Base score for having a message
        if message:
            score += 20

        # Conventional commit format bonus
        if is_conventional:
            score += 20

        # Length checks
        first_line = message.split("\n")[0] if message else ""
        if 10 <= len(first_line) <= 72:  # Ideal length
            score += 15
        elif len(first_line) > 0:
            score += 5

        # Has body (multi-line)
        if "\n\n" in message:
            score += 10

        # Starts with capital letter
        if first_line and first_line[0].isupper():
            score += 5

        # No trailing period (conventional style)
        if first_line and not first_line.endswith("."):
            score += 5

        # Uses imperative mood indicators
        imperative_starts = ["add", "fix", "update", "remove", "refactor", "implement", "create"]
        if any(first_line.lower().startswith(word) for word in imperative_starts):
            score += 10

        # References issue/ticket
        if re.search(r"#\d+|[A-Z]+-\d+", message):
            score += 10

        # Not a merge commit or WIP
        wip_patterns = ["wip", "work in progress", "merge branch", "merge pull request"]
        if any(pattern in message.lower() for pattern in wip_patterns):
            score = max(score - 20, 10)

        return min(100, score)

    def _extract_semantic_tags(self, message: str) -> list[str]:
        """Extract semantic domain tags from commit message."""
        tags = []
        message_lower = message.lower()

        for domain, keywords in DOMAIN_KEYWORDS.items():
            for keyword in keywords:
                if keyword in message_lower:
                    if domain not in tags:
                        tags.append(domain)
                    break

        return tags

    async def _analyze_with_llm(self, commit: Commit) -> dict | None:
        """Use LLM for deeper semantic analysis."""
        try:
            from aexy.llm.gateway import AIFeatureDormant, get_llm_gateway
            from aexy.llm.base import AnalysisType

            gateway = get_llm_gateway()

            prompt = f"""Analyze this commit message for semantic meaning.

Commit message:
```
{commit.message}
```

Files changed: {commit.files_changed}
Additions: {commit.additions}
Deletions: {commit.deletions}
Languages: {', '.join(commit.languages or [])}

Extract:
1. The component/scope this commit affects
2. Any breaking changes
3. Semantic domain tags (authentication, api, database, etc.)

Respond with JSON:
{{
  "scope": "component name or null",
  "breaking": true/false,
  "tags": ["tag1", "tag2"]
}}"""

            # This call used to pass `prompt=` and `provider=` and read
            # `result["content"]`. `call_llm` has never had either parameter and
            # has always returned a tuple, so it raised TypeError every time —
            # swallowed by the `except Exception` below, which meant commit LLM
            # analysis silently never ran. Corrected to the real signature.
            #
            # Because of that history the feature ships *dormant*: repairing the
            # call is not the same decision as starting to bill for a model call
            # on every commit. See DORMANT_FEATURES in aexy/llm/features.py.
            content, *_ = await gateway.call_llm(
                system_prompt=(
                    "You are an expert at analyzing git commits. "
                    "Respond only with valid JSON."
                ),
                user_prompt=prompt,
                feature="code.commit_message",
            )

            if content:
                import json
                try:
                    return json.loads(content)
                except json.JSONDecodeError:
                    logger.warning("Failed to parse LLM response as JSON")

        except AIFeatureDormant as dormant:
            # Named explicitly, above the blanket handler below. Falling through
            # to that would put this back where it started: not running, and
            # nothing in the logs to say why. Info rather than warning — this is
            # the configured state, not a fault.
            logger.info(
                "Commit LLM analysis is switched off; using the non-AI path. %s",
                dormant,
            )
            return None

        except Exception as e:
            logger.warning(f"LLM analysis failed for commit {commit.sha}: {e}")

        return None


async def get_commit_type_distribution(
    db: AsyncSession,
    developer_id: str,
    days: int = 90,
) -> dict:
    """Get commit type distribution for a developer.

    Args:
        db: Database session.
        developer_id: Developer UUID.
        days: Number of days to analyze.

    Returns:
        Distribution of commit types.
    """
    from datetime import timedelta

    cutoff = datetime.now(timezone.utc) - timedelta(days=days)

    stmt = (
        select(Commit)
        .where(
            Commit.developer_id == developer_id,
            Commit.committed_at >= cutoff,
            Commit.semantic_analysis.isnot(None),
        )
    )
    result = await db.execute(stmt)
    commits = result.scalars().all()

    type_counts: dict[str, int] = {}
    for commit in commits:
        if commit.semantic_analysis:
            commit_type = commit.semantic_analysis.get("type", "unknown")
            type_counts[commit_type] = type_counts.get(commit_type, 0) + 1

    total = sum(type_counts.values())
    return {
        "total_commits": total,
        "distribution": type_counts,
        "percentages": {
            k: round(v / total * 100, 1) if total > 0 else 0
            for k, v in type_counts.items()
        },
    }
