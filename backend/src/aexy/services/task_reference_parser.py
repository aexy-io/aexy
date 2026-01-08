"""Task reference parser for extracting task IDs from text.

Parses commit messages, PR titles/descriptions, and other text to find
task references in various formats.
"""

import re
from dataclasses import dataclass
from enum import Enum


class ReferenceType(str, Enum):
    """Type of reference action."""

    FIXES = "fixes"  # Closes the task when PR is merged
    CLOSES = "closes"  # Same as fixes
    RESOLVES = "resolves"  # Same as fixes
    REFS = "refs"  # References the task (no status change)
    RELATES = "relates"  # Same as refs


class TaskReferenceSource(str, Enum):
    """Source system for the task reference."""

    GITHUB_ISSUE = "github_issue"
    JIRA = "jira"
    LINEAR = "linear"
    GENERIC = "generic"  # Unknown format, could be any source


@dataclass
class TaskReference:
    """A parsed task reference from text."""

    identifier: str  # The task ID/key (e.g., "123", "PROJ-123", "TEAM-123")
    reference_type: ReferenceType  # Type of reference (fixes, refs, etc.)
    source: TaskReferenceSource  # Detected source system
    matched_text: str  # The original matched text
    project_key: str | None = None  # For Jira/Linear: the project/team prefix


class TaskReferenceParser:
    """Parser for extracting task references from text.

    Supports the following formats:
    - GitHub issues: #123, Fixes #123, Closes #123, Resolves #123
    - Jira: PROJ-123, [PROJ-123], Fixes PROJ-123
    - Linear: TEAM-123, [TEAM-123], Fixes TEAM-123
    - Generic: Task: 123, Task #123, Task-123
    """

    # Keywords that indicate the reference closes/fixes the task
    CLOSING_KEYWORDS = frozenset([
        "fix", "fixes", "fixed",
        "close", "closes", "closed",
        "resolve", "resolves", "resolved",
    ])

    # Keywords that indicate a reference without closing
    REFERENCE_KEYWORDS = frozenset([
        "ref", "refs", "reference", "references",
        "relate", "relates", "related",
        "see", "for",
    ])

    # Pattern for GitHub-style issue references: #123
    GITHUB_ISSUE_PATTERN = re.compile(
        r"(?:^|[\s\(\[\{])#(\d+)(?:$|[\s\)\]\}\.,;:])",
        re.IGNORECASE
    )

    # Pattern for closing keywords with GitHub issues: Fixes #123
    CLOSING_GITHUB_PATTERN = re.compile(
        r"\b(fix|fixes|fixed|close|closes|closed|resolve|resolves|resolved)\s+#(\d+)\b",
        re.IGNORECASE
    )

    # Pattern for reference keywords with GitHub issues: Refs #123
    REFERENCE_GITHUB_PATTERN = re.compile(
        r"\b(ref|refs|reference|references|relate|relates|related|see|for)\s+#(\d+)\b",
        re.IGNORECASE
    )

    # Pattern for Jira/Linear style keys: PROJ-123, [PROJ-123]
    # Jira keys are 2+ uppercase letters followed by hyphen and numbers
    PROJECT_KEY_PATTERN = re.compile(
        r"(?:^|[\s\(\[\{])([A-Z][A-Z0-9]+-\d+)(?:$|[\s\)\]\}\.,;:])",
        re.IGNORECASE
    )

    # Pattern for closing keywords with project keys: Fixes PROJ-123
    CLOSING_PROJECT_PATTERN = re.compile(
        r"\b(fix|fixes|fixed|close|closes|closed|resolve|resolves|resolved)\s+([A-Z][A-Z0-9]+-\d+)\b",
        re.IGNORECASE
    )

    # Pattern for reference keywords with project keys: Refs PROJ-123
    REFERENCE_PROJECT_PATTERN = re.compile(
        r"\b(ref|refs|reference|references|relate|relates|related|see|for)\s+([A-Z][A-Z0-9]+-\d+)\b",
        re.IGNORECASE
    )

    # Pattern for bracketed project keys: [PROJ-123]
    BRACKETED_KEY_PATTERN = re.compile(
        r"\[([A-Z][A-Z0-9]+-\d+)\]",
        re.IGNORECASE
    )

    # Pattern for "Task: " or "Task #" prefix
    TASK_PREFIX_PATTERN = re.compile(
        r"\btask[:\s#-]+(\d+)\b",
        re.IGNORECASE
    )

    def parse(self, text: str) -> list[TaskReference]:
        """Parse text and extract all task references.

        Args:
            text: The text to parse (commit message, PR title, etc.)

        Returns:
            List of TaskReference objects for each reference found
        """
        if not text:
            return []

        references: list[TaskReference] = []
        seen_identifiers: set[str] = set()

        # Check closing patterns first (they take precedence)
        references.extend(self._parse_closing_github(text, seen_identifiers))
        references.extend(self._parse_closing_project(text, seen_identifiers))

        # Check reference patterns
        references.extend(self._parse_reference_github(text, seen_identifiers))
        references.extend(self._parse_reference_project(text, seen_identifiers))

        # Check standalone patterns (default to refs type)
        references.extend(self._parse_standalone_github(text, seen_identifiers))
        references.extend(self._parse_standalone_project(text, seen_identifiers))
        references.extend(self._parse_bracketed_keys(text, seen_identifiers))
        references.extend(self._parse_task_prefix(text, seen_identifiers))

        return references

    def _parse_closing_github(
        self, text: str, seen: set[str]
    ) -> list[TaskReference]:
        """Parse closing keywords with GitHub issue numbers."""
        refs = []
        for match in self.CLOSING_GITHUB_PATTERN.finditer(text):
            keyword = match.group(1).lower()
            issue_num = match.group(2)
            identifier = f"#{issue_num}"

            if identifier in seen:
                continue
            seen.add(identifier)

            ref_type = self._keyword_to_ref_type(keyword)
            refs.append(TaskReference(
                identifier=issue_num,
                reference_type=ref_type,
                source=TaskReferenceSource.GITHUB_ISSUE,
                matched_text=match.group(0).strip(),
            ))
        return refs

    def _parse_closing_project(
        self, text: str, seen: set[str]
    ) -> list[TaskReference]:
        """Parse closing keywords with project keys (Jira/Linear)."""
        refs = []
        for match in self.CLOSING_PROJECT_PATTERN.finditer(text):
            keyword = match.group(1).lower()
            key = match.group(2).upper()

            if key in seen:
                continue
            seen.add(key)

            ref_type = self._keyword_to_ref_type(keyword)
            project, _ = key.rsplit("-", 1)
            refs.append(TaskReference(
                identifier=key,
                reference_type=ref_type,
                source=self._detect_project_source(project),
                matched_text=match.group(0).strip(),
                project_key=project,
            ))
        return refs

    def _parse_reference_github(
        self, text: str, seen: set[str]
    ) -> list[TaskReference]:
        """Parse reference keywords with GitHub issue numbers."""
        refs = []
        for match in self.REFERENCE_GITHUB_PATTERN.finditer(text):
            issue_num = match.group(2)
            identifier = f"#{issue_num}"

            if identifier in seen:
                continue
            seen.add(identifier)

            refs.append(TaskReference(
                identifier=issue_num,
                reference_type=ReferenceType.REFS,
                source=TaskReferenceSource.GITHUB_ISSUE,
                matched_text=match.group(0).strip(),
            ))
        return refs

    def _parse_reference_project(
        self, text: str, seen: set[str]
    ) -> list[TaskReference]:
        """Parse reference keywords with project keys."""
        refs = []
        for match in self.REFERENCE_PROJECT_PATTERN.finditer(text):
            key = match.group(2).upper()

            if key in seen:
                continue
            seen.add(key)

            project, _ = key.rsplit("-", 1)
            refs.append(TaskReference(
                identifier=key,
                reference_type=ReferenceType.REFS,
                source=self._detect_project_source(project),
                matched_text=match.group(0).strip(),
                project_key=project,
            ))
        return refs

    def _parse_standalone_github(
        self, text: str, seen: set[str]
    ) -> list[TaskReference]:
        """Parse standalone GitHub issue references (#123)."""
        refs = []
        for match in self.GITHUB_ISSUE_PATTERN.finditer(text):
            issue_num = match.group(1)
            identifier = f"#{issue_num}"

            if identifier in seen:
                continue
            seen.add(identifier)

            refs.append(TaskReference(
                identifier=issue_num,
                reference_type=ReferenceType.REFS,
                source=TaskReferenceSource.GITHUB_ISSUE,
                matched_text=f"#{issue_num}",
            ))
        return refs

    def _parse_standalone_project(
        self, text: str, seen: set[str]
    ) -> list[TaskReference]:
        """Parse standalone project key references (PROJ-123)."""
        refs = []
        for match in self.PROJECT_KEY_PATTERN.finditer(text):
            key = match.group(1).upper()

            if key in seen:
                continue
            seen.add(key)

            project, _ = key.rsplit("-", 1)
            refs.append(TaskReference(
                identifier=key,
                reference_type=ReferenceType.REFS,
                source=self._detect_project_source(project),
                matched_text=key,
                project_key=project,
            ))
        return refs

    def _parse_bracketed_keys(
        self, text: str, seen: set[str]
    ) -> list[TaskReference]:
        """Parse bracketed project keys [PROJ-123]."""
        refs = []
        for match in self.BRACKETED_KEY_PATTERN.finditer(text):
            key = match.group(1).upper()

            if key in seen:
                continue
            seen.add(key)

            project, _ = key.rsplit("-", 1)
            refs.append(TaskReference(
                identifier=key,
                reference_type=ReferenceType.REFS,
                source=self._detect_project_source(project),
                matched_text=match.group(0),
                project_key=project,
            ))
        return refs

    def _parse_task_prefix(
        self, text: str, seen: set[str]
    ) -> list[TaskReference]:
        """Parse Task: 123 or Task #123 format."""
        refs = []
        for match in self.TASK_PREFIX_PATTERN.finditer(text):
            task_num = match.group(1)
            identifier = f"task-{task_num}"

            if identifier in seen:
                continue
            seen.add(identifier)

            refs.append(TaskReference(
                identifier=task_num,
                reference_type=ReferenceType.REFS,
                source=TaskReferenceSource.GENERIC,
                matched_text=match.group(0).strip(),
            ))
        return refs

    def _keyword_to_ref_type(self, keyword: str) -> ReferenceType:
        """Convert a keyword to the appropriate reference type."""
        keyword = keyword.lower()
        if keyword in ("fix", "fixes", "fixed"):
            return ReferenceType.FIXES
        elif keyword in ("close", "closes", "closed"):
            return ReferenceType.CLOSES
        elif keyword in ("resolve", "resolves", "resolved"):
            return ReferenceType.RESOLVES
        elif keyword in ("relate", "relates", "related"):
            return ReferenceType.RELATES
        else:
            return ReferenceType.REFS

    def _detect_project_source(self, project_key: str) -> TaskReferenceSource:
        """Attempt to detect the source system from the project key format.

        This is a heuristic - in practice, the caller should verify against
        actual configured integrations.
        """
        # Linear typically uses short 2-4 letter team keys
        # Jira typically uses longer project keys
        # This is just a heuristic; actual matching should be done against
        # configured project mappings
        if len(project_key) <= 4:
            return TaskReferenceSource.LINEAR
        else:
            return TaskReferenceSource.JIRA

    def is_closing_reference(self, ref: TaskReference) -> bool:
        """Check if a reference should close/complete the task when PR merges."""
        return ref.reference_type in (
            ReferenceType.FIXES,
            ReferenceType.CLOSES,
            ReferenceType.RESOLVES,
        )


# Singleton instance for convenience
parser = TaskReferenceParser()


def parse_task_references(text: str) -> list[TaskReference]:
    """Parse text and extract all task references.

    This is a convenience function that uses the singleton parser instance.
    """
    return parser.parse(text)
