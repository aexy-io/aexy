"""GitHub PR Agent for AI-powered analysis, auto-tagging, and issue creation.

Follows the EmailAgent architecture patterns with:
- AgentDecision confidence scoring
- LangGraph-based execution flow
- Integration with GitHubService for PR data fetching
- Specialized tools for PR operations

Author: Claude Sonnet 4.6
Date: 2026-04-23
"""

import logging
from typing import TYPE_CHECKING
from datetime import datetime, timezone

from mailagent.agents.base import EmailAgent, AgentDecision, AgentAction, AgentContext
from aexy.services.github_service import GitHubService
from aexy.models.activity import PullRequest
from aexy.models.sprint import SprintTask

if TYPE_CHECKING:
    from aexy.core.database import AsyncSession

logger = logging.getLogger(__name__)


class GitHubPRAgent(EmailAgent):
    """AI agent for analyzing GitHub PRs, auto-tagging, and creating issues.

    Capabilities:
    - Full PR analysis (title, description, code, files, reviewers, comments)
    - Intelligent tag suggestions based on content and patterns
    - Smart issue creation decisions based on PR content
    - Confidence-based decision making with approval requirements
    """

    AGENT_TYPE = "github_pr"

    async def process_message(self, context: AgentContext) -> AgentDecision:
        """Process PR webhook events and trigger analysis.

        Args:
            context: Agent context containing PR data and workspace info

        Returns:
            AgentDecision with action, confidence, reasoning, and optional draft response
        """
        pr_data = context.get("pr_data")
        if not pr_data:
            return AgentDecision(
                action=AgentAction.NO_ACTION,
                confidence=0.0,
                reasoning="No PR data provided in context"
            )

        # Get full PR details from database
        pr_id = pr_data.get("pr_id")
        pr = await self._fetch_pr_by_id(pr_id, context.get("db"))
        if not pr:
            return AgentDecision(
                action=AgentAction.NO_ACTION,
                confidence=0.0,
                reasoning=f"PR {pr_id} not found in database"
            )

        # Analyze PR content
        analysis = await self._analyze_pr_content(pr, context)

        # Decision: Create issue or just tag?
        if analysis.get("needs_issue"):
            return AgentDecision(
                action=AgentAction.CREATE_TASK,
                confidence=analysis.get("confidence", 0.7),
                reasoning=analysis.get("reasoning", "PR content suggests creating new issue"),
                draft_response=self._format_issue_draft(analysis, pr),
                metadata={"pr_id": pr_id, "suggested_title": analysis.get("suggested_title")}
            )
        elif analysis.get("needs_tagging"):
            return AgentDecision(
                action="tag_pr",
                confidence=analysis.get("confidence", 0.8),
                reasoning=analysis.get("reasoning", "PR needs intelligent tags based on analysis"),
                metadata={"pr_id": pr_id, "suggested_tags": analysis.get("suggested_tags")}
            )
        else:
            return AgentDecision(
                action=AgentAction.NO_ACTION,
                confidence=1.0,
                reasoning="PR already properly tagged and linked"
            )

    async def _fetch_pr_by_id(self, pr_id: str, db: AsyncSession) -> PullRequest | None:
        """Fetch PR from database by ID."""
        try:
            result = await db.execute(
                select(PullRequest).where(PullRequest.id == pr_id)
            )
            return result.scalar_one_or_none()
        except Exception as e:
            logger.error(f"Error fetching PR {pr_id}: {e}")
            return None

    async def _analyze_pr_content(self, pr: PullRequest, context: AgentContext) -> dict:
        """Analyze PR content for issues and tags.

        Performs comprehensive analysis:
        - Title and description patterns
        - Code changes and complexity
        - File types and languages
        - Reviewer feedback and comments
        - Common bug/architectural patterns

        Returns:
            dict with analysis results, confidence, needs_issue, needs_tagging
        """
        analysis = {
            "confidence": 0.5,
            "needs_issue": False,
            "needs_tagging": False,
            "reasoning": "Basic analysis complete",
            "suggested_tags": [],
            "suggested_title": None,
        }

        # 1. Analyze title for patterns
        title_analysis = self._analyze_title(pr.title)
        analysis.update(title_analysis)

        # 2. Analyze description for technical indicators
        if pr.description:
            desc_analysis = self._analyze_description(pr.description)
            analysis.update(desc_analysis)

        # 3. Analyze for code complexity (simple proxy to implementation changes)
        if pr.additions > 500 or pr.deletions > 500:
            analysis["code_complexity"] = "high"
            analysis["confidence"] += 0.2
            analysis["reasoning"] += "Large code changes detected"
        elif pr.additions > 100 or pr.deletions > 100:
            analysis["code_complexity"] = "medium"
            analysis["confidence"] += 0.1
            analysis["reasoning"] += "Moderate code changes detected"
        else:
            analysis["code_complexity"] = "low"
            analysis["reasoning"] += "Small code changes detected"

        # 4. Check for common patterns that suggest need for issues
        needs_issue, issue_reason = self._check_for_issue_patterns(pr)
        if needs_issue:
            analysis["needs_issue"] = True
            analysis["confidence"] += 0.3
            analysis["reasoning"] += f"Detected issue-related patterns: {issue_reason}"
            analysis["suggested_title"] = self._suggest_issue_title(pr.title, issue_reason)

        # 5. Suggest tags based on content analysis
        suggested_tags = self._suggest_tags(pr)
        if suggested_tags:
            analysis["needs_tagging"] = True
            analysis["confidence"] += 0.2
            analysis["reasoning"] += "Generated intelligent tags based on PR content"
            analysis["suggested_tags"] = suggested_tags

        # 6. Check existing tags (avoid duplicates)
        existing_tags = pr.ai_tags or []
        new_tags = [tag for tag in suggested_tags if tag not in existing_tags]
        analysis["new_tags"] = new_tags

        # 7. Analyze reviewer feedback (from comments if available)
        if pr.review_comments_count > 0:
            analysis["has_feedback"] = True
            analysis["reasoning"] += "PR has review comments that may contain feedback"
            analysis["confidence"] += 0.1

        # 8. Build comprehensive summary
        analysis["ai_summary"] = self._build_summary(pr, analysis)
        analysis["ai_analysis"] = {
            "title_analysis": title_analysis,
            "description_analysis": desc_analysis,
            "code_complexity": analysis.get("code_complexity"),
            "patterns_detected": issue_reason if needs_issue else "None",
            "has_feedback": analysis.get("has_feedback"),
        }

        return analysis

    def _analyze_title(self, title: str) -> dict:
        """Analyze PR title for indicators."""
        indicators = []

        # Bug-related keywords
        bug_keywords = ["fix", "bug", "error", "crash", "exception", "patch", "hotfix"]
        if any(keyword in title.lower() for keyword in bug_keywords):
            indicators.append("bug_fix")

        # Feature-related keywords
        feature_keywords = ["feat", "feature", "add", "implement", "new", "enhance"]
        if any(keyword in title.lower() for keyword in feature_keywords):
            indicators.append("feature_addition")

        # Refactoring keywords
        refactor_keywords = ["refactor", "cleanup", "optimize", "simplify"]
        if any(keyword in title.lower() for keyword in refactor_keywords):
            indicators.append("refactoring")

        # Documentation keywords
        doc_keywords = ["docs", "readme", "changelog"]
        if any(keyword in title.lower() for keyword in doc_keywords):
            indicators.append("documentation")

        return {"indicators": indicators, "needs_issue": len(indicators) > 0}

    def _analyze_description(self, description: str) -> dict:
        """Analyze PR description for technical indicators."""
        indicators = []

        # Check for issue references
        if "#" in description or "ISSUE-" in description:
            indicators.append("issue_reference")

        # Check for TODO/FIXME comments
        if "TODO:" in description or "FIXME:" in description:
            indicators.append("incomplete_work")

        # Check for complexity indicators
        if len(description) > 2000:  # Long description
            indicators.append("complex_description")

        return {"indicators": indicators}

    def _check_for_issue_patterns(self, pr: PullRequest) -> tuple[bool, str]:
        """Check if PR content suggests need for separate issue."""
        reasons = []

        # Large PRs might need to be split
        if pr.additions > 1000 or pr.deletions > 1000:
            reasons.append("Large PR size - consider splitting into smaller issues")

        # PR title contains multiple concerns
        words = pr.title.lower().split()
        if len(words) > 10 and any(w in ["and", "or", "plus", "also", "another"]) for w in words):
            reasons.append("Multiple concerns in title")

        # No description provided
        if not pr.description or pr.description.strip() == "":
            reasons.append("Missing or empty description")

        return (len(reasons) > 0, " & ".join(reasons))

    def _suggest_issue_title(self, pr_title: str, reason: str) -> str:
        """Suggest appropriate issue title based on PR content."""
        base_title = pr_title.replace("PR", "Pull Request").strip()

        if reason == "Large PR size":
            return f"Refactor: {base_title} - Split into smaller issues"
        elif reason == "Multiple concerns in title":
            return f"Split {base_title} into separate issues"
        elif reason == "Missing or empty description":
            return f"Define scope for: {base_title}"
        else:
            return base_title

    def _suggest_tags(self, pr: PullRequest) -> list[str]:
        """Suggest tags based on PR content analysis."""
        tags = []

        title_lower = pr.title.lower()
        desc_lower = (pr.description or "").lower()

        # Language detection (simple heuristic from title/description)
        if "python" in title_lower or "python" in desc_lower:
            tags.append("python")
        if "javascript" in title_lower or "js" in desc_lower:
            tags.append("javascript")
        if "typescript" in title_lower or "ts" in desc_lower:
            tags.append("typescript")
        if "go" in title_lower or "golang" in desc_lower:
            tags.append("go")
        if "rust" in title_lower:
            tags.append("rust")
        if "java" in title_lower:
            tags.append("java")
        if "c++" in title_lower or "cpp" in desc_lower:
            tags.append("c++")
        if "c#" in title_lower:
            tags.append("csharp")
        if "sql" in title_lower or "database" in desc_lower:
            tags.append("sql")
        if "api" in title_lower or "rest" in desc_lower:
            tags.append("api")
        if "ui" in title_lower or "frontend" in desc_lower:
            tags.append("ui")
        if "test" in title_lower or "testing" in desc_lower:
            tags.append("test")

        # Type indicators
        if "bug" in title_lower or "fix" in title_lower:
            tags.append("bug")
        if "feature" in title_lower or "feat" in title_lower:
            tags.append("feature")
        if "refactor" in title_lower:
            tags.append("refactoring")
        if "docs" in title_lower or "readme" in desc_lower:
            tags.append("documentation")
        if "chore" in title_lower or "maintenance":
            tags.append("maintenance")
        if "ci/cd" in title_lower or "pipeline" in desc_lower:
            tags.append("ci-cd")
        if "dependencies" in title_lower or "deps" in desc_lower:
            tags.append("dependencies")

        # Domain-specific tags
        if "auth" in title_lower or "security" in desc_lower:
            tags.append("security")
        if "performance" in title_lower or "optimize" in title_lower:
            tags.append("performance")

        return list(set(tags))  # Remove duplicates

    def _build_summary(self, pr: PullRequest, analysis: dict) -> str:
        """Build comprehensive AI summary of PR analysis."""
        summary_parts = []

        summary_parts.append(f"PR #{pr.number} in {pr.repository}")
        summary_parts.append(f"Title: {pr.title}")

        if analysis.get("code_complexity"):
            summary_parts.append(f"Code: {analysis.get('code_complexity')} complexity (+{pr.additions}/-{pr.deletions})")

        if analysis.get("new_tags"):
            summary_parts.append(f"Tags: {', '.join(analysis.get('new_tags'))}")

        if analysis.get("needs_issue"):
            summary_parts.append(f"Suggestion: {analysis.get('suggested_title')}")

        if analysis.get("reasoning"):
            summary_parts.append(f"Analysis: {analysis.get('reasoning')}")

        return ". ".join(summary_parts)

    def _format_issue_draft(self, analysis: dict, pr: PullRequest) -> str:
        """Format AI-suggested issue creation."""
        summary = self._build_summary(pr, analysis)
        suggested_title = analysis.get("suggested_title", "Based on PR: " + pr.title)

        return f"""Title: {suggested_title}

Description:
{summary}

Created from: GitHub PR #{pr.number} in {pr.repository}
Repository: {pr.repository}

Please review and adjust as needed.
"""