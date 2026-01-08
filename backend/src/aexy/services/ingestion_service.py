"""Data Ingestion Service for GitHub events."""

import re
from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.models.activity import Commit, PullRequest, CodeReview
from aexy.models.developer import Developer, GitHubConnection


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
    ".vue": "Vue",
    ".svelte": "Svelte",
}

# Skill keywords for extraction
SKILL_KEYWORDS: dict[str, list[str]] = {
    "payment": ["stripe", "payment", "billing", "checkout", "invoice"],
    "authentication": ["auth", "oauth", "jwt", "login", "session", "sso"],
    "database": ["postgres", "mysql", "mongodb", "redis", "database", "sql"],
    "api": ["api", "rest", "graphql", "grpc", "endpoint"],
    "devops": ["docker", "kubernetes", "k8s", "ci/cd", "jenkins", "terraform"],
    "testing": ["test", "jest", "pytest", "cypress", "e2e"],
    "frontend": ["react", "vue", "angular", "frontend", "ui", "css"],
    "backend": ["backend", "server", "microservice"],
    "ml": ["machine learning", "ml", "model", "training", "tensorflow", "pytorch"],
    "security": ["security", "encryption", "vulnerability", "firewall"],
}


class IngestionService:
    """Service for ingesting GitHub data into the database."""

    def extract_languages(self, files: list[str]) -> list[str]:
        """Extract programming languages from file paths.

        Args:
            files: List of file paths

        Returns:
            List of unique language names
        """
        languages = set()
        for file_path in files:
            for ext, language in LANGUAGE_EXTENSIONS.items():
                if file_path.endswith(ext):
                    languages.add(language)
                    break
        return list(languages)

    def extract_file_types(self, files: list[str]) -> list[str]:
        """Extract file extensions from file paths.

        Args:
            files: List of file paths

        Returns:
            List of unique file extensions
        """
        extensions = set()
        for file_path in files:
            if "." in file_path:
                ext = "." + file_path.rsplit(".", 1)[-1]
                extensions.add(ext)
        return list(extensions)

    def extract_skills_from_pr(self, title: str, body: str | None) -> list[str]:
        """Extract skills/domains from PR title and body.

        Args:
            title: PR title
            body: PR body/description

        Returns:
            List of detected skill domains
        """
        text = f"{title} {body or ''}".lower()
        detected_skills = []

        for skill, keywords in SKILL_KEYWORDS.items():
            for keyword in keywords:
                if keyword in text:
                    detected_skills.append(skill)
                    break

        return list(set(detected_skills))

    async def find_developer_by_email(
        self,
        email: str,
        db: AsyncSession,
    ) -> Developer | None:
        """Find developer by email address.

        Args:
            email: Email address to search
            db: Database session

        Returns:
            Developer if found, None otherwise
        """
        stmt = select(Developer).where(Developer.email == email)
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def find_developer_by_github_id(
        self,
        github_id: int,
        db: AsyncSession,
    ) -> Developer | None:
        """Find developer by GitHub ID.

        Args:
            github_id: GitHub user ID
            db: Database session

        Returns:
            Developer if found, None otherwise
        """
        stmt = (
            select(Developer)
            .join(GitHubConnection)
            .where(GitHubConnection.github_id == github_id)
        )
        result = await db.execute(stmt)
        return result.scalar_one_or_none()

    async def ingest_commit(
        self,
        repository: str,
        commit: dict[str, Any],
        db: AsyncSession,
    ) -> Commit:
        """Ingest a single commit into the database.

        Args:
            repository: Repository full name (owner/repo)
            commit: Commit data from GitHub
            db: Database session

        Returns:
            Created or existing Commit record
        """
        sha = commit.get("id", commit.get("sha", ""))

        # Check for existing commit
        stmt = select(Commit).where(Commit.sha == sha)
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        # Get author info
        author = commit.get("author", {})
        email = author.get("email", "")

        # Find associated developer
        developer = await self.find_developer_by_email(email, db)
        developer_id = developer.id if developer else None

        # If no developer found, create a placeholder
        if not developer_id and email:
            developer = Developer(
                email=email,
                name=author.get("name"),
            )
            db.add(developer)
            await db.flush()
            developer_id = developer.id

        # Extract file information
        added = commit.get("added", [])
        modified = commit.get("modified", [])
        removed = commit.get("removed", [])
        all_files = added + modified + removed

        languages = self.extract_languages(all_files)
        file_types = self.extract_file_types(all_files)

        # Parse timestamp
        timestamp_str = commit.get("timestamp", "")
        try:
            committed_at = datetime.fromisoformat(timestamp_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            committed_at = datetime.now()

        # Create commit record
        commit_record = Commit(
            sha=sha,
            repository=repository,
            developer_id=developer_id,
            message=commit.get("message", ""),
            additions=len(added),
            deletions=len(removed),
            files_changed=len(all_files),
            languages=languages,
            file_types=file_types,
            committed_at=committed_at,
        )

        db.add(commit_record)
        await db.flush()
        return commit_record

    async def ingest_commits(
        self,
        repository: str,
        commits: list[dict[str, Any]],
        sender: dict[str, Any] | None,
        db: AsyncSession,
    ) -> list[Commit]:
        """Ingest multiple commits in batch.

        Args:
            repository: Repository full name
            commits: List of commit data
            sender: Push sender info
            db: Database session

        Returns:
            List of created Commit records
        """
        results = []
        for commit in commits:
            record = await self.ingest_commit(repository, commit, db)
            results.append(record)
        return results

    async def ingest_pull_request(
        self,
        repository: str,
        pull_request: dict[str, Any],
        action: str | None,
        sender: dict[str, Any] | None,
        db: AsyncSession,
    ) -> PullRequest:
        """Ingest a pull request into the database.

        Args:
            repository: Repository full name
            pull_request: PR data from GitHub
            action: PR action (opened, closed, etc.)
            sender: Event sender info
            db: Database session

        Returns:
            Created or updated PullRequest record
        """
        github_id = pull_request.get("id")

        # Check for existing PR
        stmt = select(PullRequest).where(PullRequest.github_id == github_id)
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()

        # Find associated developer
        user = pull_request.get("user", {})
        user_github_id = user.get("id")
        developer = None
        if user_github_id:
            developer = await self.find_developer_by_github_id(user_github_id, db)
        developer_id = developer.id if developer else None

        # Extract skills from PR content
        title = pull_request.get("title", "")
        body = pull_request.get("body")
        detected_skills = self.extract_skills_from_pr(title, body)

        # Parse timestamps
        created_at_str = pull_request.get("created_at", "")
        updated_at_str = pull_request.get("updated_at")
        merged_at_str = pull_request.get("merged_at")
        closed_at_str = pull_request.get("closed_at")

        def parse_timestamp(ts: str | None) -> datetime | None:
            if not ts:
                return None
            try:
                return datetime.fromisoformat(ts.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                return None

        if existing:
            # Update existing PR
            existing.state = pull_request.get("state", existing.state)
            existing.title = title or existing.title
            existing.description = body
            existing.additions = pull_request.get("additions", existing.additions)
            existing.deletions = pull_request.get("deletions", existing.deletions)
            existing.files_changed = pull_request.get("changed_files", existing.files_changed)
            existing.commits_count = pull_request.get("commits", existing.commits_count)
            existing.comments_count = pull_request.get("comments", existing.comments_count)
            existing.review_comments_count = pull_request.get("review_comments", existing.review_comments_count)
            existing.detected_skills = detected_skills
            existing.updated_at_github = parse_timestamp(updated_at_str)
            existing.merged_at = parse_timestamp(merged_at_str)
            existing.closed_at = parse_timestamp(closed_at_str)

            if developer_id and not existing.developer_id:
                existing.developer_id = developer_id

            await db.flush()
            return existing

        # Create new PR
        pr_record = PullRequest(
            github_id=github_id,
            number=pull_request.get("number", 0),
            repository=repository,
            developer_id=developer_id,
            title=title,
            description=body,
            state=pull_request.get("state", "open"),
            additions=pull_request.get("additions", 0),
            deletions=pull_request.get("deletions", 0),
            files_changed=pull_request.get("changed_files", 0),
            commits_count=pull_request.get("commits", 0),
            comments_count=pull_request.get("comments", 0),
            review_comments_count=pull_request.get("review_comments", 0),
            detected_skills=detected_skills,
            created_at_github=parse_timestamp(created_at_str) or datetime.now(),
            updated_at_github=parse_timestamp(updated_at_str),
            merged_at=parse_timestamp(merged_at_str),
            closed_at=parse_timestamp(closed_at_str),
        )

        db.add(pr_record)
        await db.flush()
        return pr_record

    async def ingest_review(
        self,
        repository: str,
        review: dict[str, Any],
        pull_request: dict[str, Any] | None,
        sender: dict[str, Any] | None,
        db: AsyncSession,
    ) -> CodeReview:
        """Ingest a code review into the database.

        Args:
            repository: Repository full name
            review: Review data from GitHub
            pull_request: Associated PR data
            sender: Event sender info
            db: Database session

        Returns:
            Created CodeReview record
        """
        github_id = review.get("id")

        # Check for existing review
        stmt = select(CodeReview).where(CodeReview.github_id == github_id)
        result = await db.execute(stmt)
        existing = result.scalar_one_or_none()
        if existing:
            return existing

        # Find associated developer
        user = review.get("user", {})
        user_github_id = user.get("id")
        developer = None
        if user_github_id:
            developer = await self.find_developer_by_github_id(user_github_id, db)
        developer_id = developer.id if developer else None

        # Parse timestamp
        submitted_at_str = review.get("submitted_at", "")
        try:
            submitted_at = datetime.fromisoformat(submitted_at_str.replace("Z", "+00:00"))
        except (ValueError, AttributeError):
            submitted_at = datetime.now()

        pr_github_id = pull_request.get("id") if pull_request else 0

        review_record = CodeReview(
            github_id=github_id,
            repository=repository,
            developer_id=developer_id,
            pull_request_github_id=pr_github_id,
            state=review.get("state", ""),
            body=review.get("body"),
            comments_count=0,  # Would need additional API call
            submitted_at=submitted_at,
        )

        db.add(review_record)
        await db.flush()
        return review_record
