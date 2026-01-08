"""Code Analyzer service for LLM-powered code analysis."""

import logging
from typing import Any

from aexy.llm.base import (
    AnalysisRequest,
    AnalysisResult,
    AnalysisType,
    DomainAnalysis,
    FrameworkAnalysis,
    LanguageAnalysis,
)
from aexy.llm.gateway import LLMGateway
from aexy.services.github_service import GitHubService

logger = logging.getLogger(__name__)


class CodeAnalysisResult:
    """Aggregated result from analyzing multiple files/commits."""

    def __init__(self) -> None:
        self.languages: dict[str, LanguageAnalysis] = {}
        self.frameworks: dict[str, FrameworkAnalysis] = {}
        self.domains: dict[str, DomainAnalysis] = {}
        self.total_tokens: int = 0
        self.files_analyzed: int = 0
        self.analysis_errors: list[str] = []

    def merge(self, result: AnalysisResult) -> None:
        """Merge an analysis result into this aggregation.

        Args:
            result: The analysis result to merge.
        """
        # Merge languages - keep highest confidence
        for lang in result.languages:
            if lang.name not in self.languages or lang.confidence > self.languages[lang.name].confidence:
                self.languages[lang.name] = lang

        # Merge frameworks - keep highest confidence
        for fw in result.frameworks:
            if fw.name not in self.frameworks or fw.confidence > self.frameworks[fw.name].confidence:
                self.frameworks[fw.name] = fw

        # Merge domains - keep highest confidence
        for domain in result.domains:
            if domain.name not in self.domains or domain.confidence > self.domains[domain.name].confidence:
                self.domains[domain.name] = domain

        self.total_tokens += result.tokens_used
        self.files_analyzed += 1

    def to_dict(self) -> dict[str, Any]:
        """Convert to dictionary.

        Returns:
            Dictionary representation.
        """
        return {
            "languages": [lang.model_dump() for lang in self.languages.values()],
            "frameworks": [fw.model_dump() for fw in self.frameworks.values()],
            "domains": [domain.model_dump() for domain in self.domains.values()],
            "total_tokens": self.total_tokens,
            "files_analyzed": self.files_analyzed,
            "analysis_errors": self.analysis_errors,
        }


class CodeAnalyzer:
    """Service for analyzing code using LLM.

    Provides deep code analysis for skill extraction, framework detection,
    and domain expertise identification.
    """

    # File extensions to analyze
    ANALYZABLE_EXTENSIONS = {
        ".py", ".js", ".ts", ".tsx", ".jsx",
        ".go", ".rs", ".java", ".kt", ".scala",
        ".rb", ".php", ".swift", ".c", ".cpp", ".h",
        ".cs", ".vue", ".svelte",
    }

    # Max file size to analyze (in bytes)
    MAX_FILE_SIZE = 50000  # 50KB

    # Max files to analyze per commit
    MAX_FILES_PER_COMMIT = 10

    def __init__(
        self,
        llm_gateway: LLMGateway,
        github_service: GitHubService | None = None,
    ) -> None:
        """Initialize the code analyzer.

        Args:
            llm_gateway: The LLM gateway for analysis.
            github_service: Optional GitHub service for fetching file contents.
        """
        self.llm = llm_gateway
        self.github = github_service

    async def analyze_code(
        self,
        code: str,
        file_path: str | None = None,
        language_hint: str | None = None,
    ) -> AnalysisResult:
        """Analyze a piece of code.

        Args:
            code: The code to analyze.
            file_path: Optional file path for context.
            language_hint: Optional language hint.

        Returns:
            Analysis result.
        """
        request = AnalysisRequest(
            content=code,
            analysis_type=AnalysisType.CODE,
            file_path=file_path,
            language_hint=language_hint,
        )

        return await self.llm.analyze(request)

    async def analyze_commit_message(
        self,
        message: str,
        files_changed: int = 0,
        additions: int = 0,
        deletions: int = 0,
    ) -> AnalysisResult:
        """Analyze a commit message for domain and skill signals.

        Args:
            message: The commit message.
            files_changed: Number of files changed.
            additions: Lines added.
            deletions: Lines deleted.

        Returns:
            Analysis result.
        """
        request = AnalysisRequest(
            content=message,
            analysis_type=AnalysisType.COMMIT_MESSAGE,
            context={
                "files_changed": files_changed,
                "additions": additions,
                "deletions": deletions,
            },
        )

        return await self.llm.analyze(request)

    async def analyze_pr_description(
        self,
        title: str,
        description: str,
        files_changed: int = 0,
        additions: int = 0,
        deletions: int = 0,
    ) -> AnalysisResult:
        """Analyze a PR for skills and soft skills.

        Args:
            title: PR title.
            description: PR description.
            files_changed: Number of files changed.
            additions: Lines added.
            deletions: Lines deleted.

        Returns:
            Analysis result.
        """
        request = AnalysisRequest(
            content=description or "",
            analysis_type=AnalysisType.PR_DESCRIPTION,
            context={
                "title": title,
                "files_changed": files_changed,
                "additions": additions,
                "deletions": deletions,
            },
        )

        return await self.llm.analyze(request)

    async def analyze_review_comment(
        self,
        comment: str,
        state: str = "commented",
    ) -> AnalysisResult:
        """Analyze a review comment for soft skills.

        Args:
            comment: The review comment text.
            state: Review state (approved, changes_requested, commented).

        Returns:
            Analysis result.
        """
        request = AnalysisRequest(
            content=comment,
            analysis_type=AnalysisType.REVIEW_COMMENT,
            context={"state": state},
        )

        return await self.llm.analyze(request)

    def _should_analyze_file(self, file_path: str, file_size: int | None = None) -> bool:
        """Check if a file should be analyzed.

        Args:
            file_path: Path to the file.
            file_size: Optional file size in bytes.

        Returns:
            True if file should be analyzed.
        """
        # Check extension
        ext = "." + file_path.rsplit(".", 1)[-1] if "." in file_path else ""
        if ext.lower() not in self.ANALYZABLE_EXTENSIONS:
            return False

        # Check size if provided
        if file_size is not None and file_size > self.MAX_FILE_SIZE:
            return False

        # Skip common non-source files
        skip_patterns = [
            "node_modules/",
            "vendor/",
            ".min.",
            ".bundle.",
            "dist/",
            "build/",
            "__pycache__/",
            ".pyc",
        ]
        return not any(pattern in file_path for pattern in skip_patterns)

    def _detect_language_from_extension(self, file_path: str) -> str | None:
        """Detect language from file extension.

        Args:
            file_path: Path to the file.

        Returns:
            Language name or None.
        """
        ext_map = {
            ".py": "Python",
            ".js": "JavaScript",
            ".ts": "TypeScript",
            ".tsx": "TypeScript",
            ".jsx": "JavaScript",
            ".go": "Go",
            ".rs": "Rust",
            ".java": "Java",
            ".kt": "Kotlin",
            ".scala": "Scala",
            ".rb": "Ruby",
            ".php": "PHP",
            ".swift": "Swift",
            ".c": "C",
            ".cpp": "C++",
            ".h": "C",
            ".cs": "C#",
            ".vue": "Vue",
            ".svelte": "Svelte",
        }

        ext = "." + file_path.rsplit(".", 1)[-1] if "." in file_path else ""
        return ext_map.get(ext.lower())

    async def analyze_commit_files(
        self,
        owner: str,
        repo: str,
        commit_sha: str,
        access_token: str,
    ) -> CodeAnalysisResult:
        """Analyze files in a commit.

        Args:
            owner: Repository owner.
            repo: Repository name.
            commit_sha: Commit SHA.
            access_token: GitHub access token.

        Returns:
            Aggregated analysis result.
        """
        if not self.github:
            raise ValueError("GitHubService required for commit analysis")

        result = CodeAnalysisResult()

        try:
            # Get commit details
            commit = await self.github.get_commit(owner, repo, commit_sha, access_token)
            files = commit.get("files", [])

            # Filter and limit files
            files_to_analyze = [
                f for f in files
                if self._should_analyze_file(f.get("filename", ""), f.get("changes", 0))
            ][:self.MAX_FILES_PER_COMMIT]

            for file_info in files_to_analyze:
                file_path = file_info.get("filename", "")
                patch = file_info.get("patch", "")

                if not patch:
                    continue

                try:
                    language = self._detect_language_from_extension(file_path)
                    analysis = await self.analyze_code(
                        code=patch,
                        file_path=file_path,
                        language_hint=language,
                    )
                    result.merge(analysis)

                except Exception as e:
                    logger.warning(f"Failed to analyze {file_path}: {e}")
                    result.analysis_errors.append(f"{file_path}: {str(e)}")

        except Exception as e:
            logger.error(f"Failed to analyze commit {commit_sha}: {e}")
            result.analysis_errors.append(str(e))

        return result

    async def analyze_pr_files(
        self,
        owner: str,
        repo: str,
        pr_number: int,
        access_token: str,
    ) -> CodeAnalysisResult:
        """Analyze files in a pull request.

        Args:
            owner: Repository owner.
            repo: Repository name.
            pr_number: PR number.
            access_token: GitHub access token.

        Returns:
            Aggregated analysis result.
        """
        if not self.github:
            raise ValueError("GitHubService required for PR analysis")

        result = CodeAnalysisResult()

        try:
            # Get PR files
            files = await self.github.get_pr_files(owner, repo, pr_number, access_token)

            # Filter and limit files
            files_to_analyze = [
                f for f in files
                if self._should_analyze_file(f.get("filename", ""), f.get("changes", 0))
            ][:self.MAX_FILES_PER_COMMIT]

            for file_info in files_to_analyze:
                file_path = file_info.get("filename", "")
                patch = file_info.get("patch", "")

                if not patch:
                    continue

                try:
                    language = self._detect_language_from_extension(file_path)
                    analysis = await self.analyze_code(
                        code=patch,
                        file_path=file_path,
                        language_hint=language,
                    )
                    result.merge(analysis)

                except Exception as e:
                    logger.warning(f"Failed to analyze {file_path}: {e}")
                    result.analysis_errors.append(f"{file_path}: {str(e)}")

        except Exception as e:
            logger.error(f"Failed to analyze PR #{pr_number}: {e}")
            result.analysis_errors.append(str(e))

        return result

    async def analyze_developer_activity(
        self,
        commits: list[dict[str, Any]],
        pull_requests: list[dict[str, Any]],
        reviews: list[dict[str, Any]] | None = None,
    ) -> CodeAnalysisResult:
        """Analyze a developer's activity for skill extraction.

        Args:
            commits: List of commit data.
            pull_requests: List of PR data.
            reviews: Optional list of review data.

        Returns:
            Aggregated analysis result.
        """
        result = CodeAnalysisResult()

        # Analyze commit messages
        for commit in commits[:20]:  # Limit to most recent
            message = commit.get("message", "")
            if len(message) > 50:  # Skip trivial commits
                try:
                    analysis = await self.analyze_commit_message(
                        message=message,
                        files_changed=commit.get("files_changed", 0),
                        additions=commit.get("additions", 0),
                        deletions=commit.get("deletions", 0),
                    )
                    result.merge(analysis)
                except Exception as e:
                    logger.warning(f"Failed to analyze commit message: {e}")

        # Analyze PR descriptions
        for pr in pull_requests[:10]:  # Limit to most recent
            description = pr.get("description") or pr.get("body", "")
            title = pr.get("title", "")
            if description and len(description) > 100:
                try:
                    analysis = await self.analyze_pr_description(
                        title=title,
                        description=description,
                        files_changed=pr.get("files_changed", 0),
                        additions=pr.get("additions", 0),
                        deletions=pr.get("deletions", 0),
                    )
                    result.merge(analysis)
                except Exception as e:
                    logger.warning(f"Failed to analyze PR description: {e}")

        # Analyze reviews for soft skills
        if reviews:
            for review in reviews[:10]:
                body = review.get("body", "")
                if body and len(body) > 50:
                    try:
                        analysis = await self.analyze_review_comment(
                            comment=body,
                            state=review.get("state", "commented"),
                        )
                        result.merge(analysis)
                    except Exception as e:
                        logger.warning(f"Failed to analyze review: {e}")

        return result
