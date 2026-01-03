"""Slack message parser for extracting task references, standups, and blockers."""

import logging
import re
from dataclasses import dataclass, field
from enum import Enum

logger = logging.getLogger(__name__)


class TaskRefType(str, Enum):
    """Types of task references."""

    GITHUB_ISSUE = "github_issue"
    JIRA = "jira"
    LINEAR = "linear"
    INTERNAL = "internal"
    GENERIC = "generic"


@dataclass
class TaskReference:
    """A task reference found in a message."""

    ref_type: TaskRefType
    ref_string: str
    task_id: str | None = None
    project_key: str | None = None
    issue_number: int | None = None


@dataclass
class StandupContent:
    """Parsed standup content."""

    yesterday: str
    today: str
    blockers: str | None = None
    confidence: float = 1.0


@dataclass
class BlockerMention:
    """A blocker mention parsed from text."""

    description: str
    task_ref: str | None = None
    severity: str = "medium"
    confidence: float = 1.0


@dataclass
class ParsedMessage:
    """Result of parsing a Slack message."""

    is_standup: bool = False
    standup_content: StandupContent | None = None
    task_references: list[TaskReference] = field(default_factory=list)
    blocker_mentions: list[BlockerMention] = field(default_factory=list)
    sentiment: str | None = None
    classification: str | None = None
    confidence: float = 0.0


class SlackMessageParser:
    """Parses Slack messages for task references, standups, and blockers."""

    # Standup detection patterns
    STANDUP_PATTERNS = [
        # Pattern: yesterday: X | today: Y | blockers: Z
        re.compile(
            r"(?:yesterday|done|completed|finished)[\s:]+(.+?)(?:\||today|plan|doing|working)",
            re.IGNORECASE | re.DOTALL,
        ),
        # Full standup with all three parts
        re.compile(
            r"(?:yesterday|done)[\s:]+(.+?)\s*\|\s*(?:today|plan)[\s:]+(.+?)(?:\s*\|\s*(?:blockers?|blocked)[\s:]+(.+))?$",
            re.IGNORECASE | re.DOTALL,
        ),
    ]

    # Standup trigger words
    STANDUP_TRIGGERS = [
        "standup",
        "stand-up",
        "daily",
        "yesterday",
        "today's plan",
        "what i did",
        "what i'm doing",
    ]

    # Blocker keywords and phrases
    BLOCKER_KEYWORDS = [
        "blocked",
        "blocker",
        "stuck",
        "waiting on",
        "waiting for",
        "can't proceed",
        "cannot proceed",
        "need help",
        "need assistance",
        "impediment",
        "dependency",
        "blocked by",
        "blocking issue",
        "held up",
        "on hold",
    ]

    # Severity indicators
    SEVERITY_HIGH_KEYWORDS = [
        "critical",
        "urgent",
        "asap",
        "immediately",
        "blocker",
        "can't proceed",
        "completely blocked",
    ]
    SEVERITY_LOW_KEYWORDS = [
        "minor",
        "small",
        "eventually",
        "when possible",
        "nice to have",
    ]

    # Task reference patterns
    TASK_PATTERNS = [
        # GitHub issues: #123, org/repo#123
        (TaskRefType.GITHUB_ISSUE, re.compile(r"(?:[\w-]+/[\w-]+)?#(\d+)")),
        # Jira: PROJ-123, ABC-1234
        (TaskRefType.JIRA, re.compile(r"\b([A-Z]{2,10}-\d+)\b")),
        # Linear: LIN-123, or just identifier patterns
        (TaskRefType.LINEAR, re.compile(r"\b(LIN-\d+|[A-Z]+-\d+)\b", re.IGNORECASE)),
        # Generic task mentions: task #123, task:123, task 123
        (TaskRefType.GENERIC, re.compile(r"task[\s:#]+(\d+)", re.IGNORECASE)),
    ]

    # Progress indicators for classification
    PROGRESS_KEYWORDS = ["completed", "finished", "done", "merged", "deployed", "fixed"]
    QUESTION_KEYWORDS = ["?", "how", "what", "where", "when", "why", "can someone", "does anyone"]

    def parse_message(self, text: str) -> ParsedMessage:
        """Parse a message for task refs, standup content, and blockers."""
        result = ParsedMessage()

        # Clean the text
        text = self._clean_slack_text(text)

        # Extract task references
        result.task_references = self.extract_task_references(text)

        # Check for standup format
        standup = self.detect_standup_format(text)
        if standup:
            result.is_standup = True
            result.standup_content = standup
            result.classification = "standup"
            result.confidence = standup.confidence

        # Detect blockers
        result.blocker_mentions = self.detect_blockers(text)
        if result.blocker_mentions and not result.is_standup:
            result.classification = "blocker"
            result.confidence = max(b.confidence for b in result.blocker_mentions)

        # Classify if not already classified
        if not result.classification:
            result.classification = self._classify_message(text)
            result.confidence = 0.7  # Lower confidence for general classification

        # Detect sentiment
        result.sentiment = self._detect_sentiment(text)

        return result

    def _clean_slack_text(self, text: str) -> str:
        """Clean Slack-specific formatting from text."""
        # Remove user mentions but keep the username
        text = re.sub(r"<@(\w+)(?:\|([^>]+))?>", r"@\2" if r"\2" else r"@\1", text)

        # Remove channel mentions
        text = re.sub(r"<#(\w+)\|([^>]+)>", r"#\2", text)

        # Remove URL formatting
        text = re.sub(r"<(https?://[^|>]+)(?:\|([^>]+))?>", r"\2" if r"\2" else r"\1", text)

        # Remove code blocks for parsing (keep for display)
        text = re.sub(r"```[\s\S]*?```", "[code block]", text)
        text = re.sub(r"`[^`]+`", "[code]", text)

        return text.strip()

    def extract_task_references(self, text: str) -> list[TaskReference]:
        """Extract all task references from text."""
        references = []
        seen = set()

        for ref_type, pattern in self.TASK_PATTERNS:
            for match in pattern.finditer(text):
                ref_string = match.group(0)
                if ref_string in seen:
                    continue
                seen.add(ref_string)

                ref = TaskReference(
                    ref_type=ref_type,
                    ref_string=ref_string,
                )

                # Extract additional info based on type
                if ref_type == TaskRefType.GITHUB_ISSUE:
                    try:
                        ref.issue_number = int(match.group(1))
                    except (ValueError, IndexError):
                        pass
                elif ref_type in (TaskRefType.JIRA, TaskRefType.LINEAR):
                    parts = ref_string.split("-")
                    if len(parts) == 2:
                        ref.project_key = parts[0]
                        try:
                            ref.issue_number = int(parts[1])
                        except ValueError:
                            pass

                references.append(ref)

        return references

    def detect_standup_format(self, text: str) -> StandupContent | None:
        """Detect if message is a standup and parse it."""
        text_lower = text.lower()

        # Check for standup triggers
        has_trigger = any(trigger in text_lower for trigger in self.STANDUP_TRIGGERS)

        # Check for structured standup format: yesterday: X | today: Y | blockers: Z
        if "|" in text and ("yesterday" in text_lower or "today" in text_lower):
            return self._parse_structured_standup(text)

        # Check for semi-structured format with colons
        if ":" in text and has_trigger:
            standup = self._parse_colon_standup(text)
            if standup:
                return standup

        # Check for line-based standup
        lines = text.strip().split("\n")
        if len(lines) >= 2 and has_trigger:
            return self._parse_line_standup(lines)

        return None

    def _parse_structured_standup(self, text: str) -> StandupContent | None:
        """Parse structured standup: yesterday: X | today: Y | blockers: Z"""
        parts = re.split(r"\s*\|\s*", text)
        yesterday = ""
        today = ""
        blockers = None

        for part in parts:
            part_lower = part.lower().strip()
            if any(kw in part_lower for kw in ["yesterday", "done", "completed", "finished"]):
                # Extract content after the keyword
                for sep in [":", " - ", " "]:
                    if sep in part:
                        idx = part.lower().find(sep) + len(sep)
                        yesterday = part[idx:].strip()
                        break
            elif any(kw in part_lower for kw in ["today", "plan", "doing", "working on"]):
                for sep in [":", " - ", " "]:
                    if sep in part:
                        idx = part.lower().find(sep) + len(sep)
                        today = part[idx:].strip()
                        break
            elif any(kw in part_lower for kw in ["blocker", "blocked", "stuck"]):
                for sep in [":", " - ", " "]:
                    if sep in part:
                        idx = part.lower().find(sep) + len(sep)
                        blockers = part[idx:].strip()
                        break

        if yesterday and today:
            return StandupContent(
                yesterday=yesterday,
                today=today,
                blockers=blockers,
                confidence=0.9,
            )

        return None

    def _parse_colon_standup(self, text: str) -> StandupContent | None:
        """Parse standup with colon format."""
        yesterday = ""
        today = ""
        blockers = None

        lines = text.split("\n")
        for line in lines:
            line_lower = line.lower().strip()
            if ":" in line:
                key, _, value = line.partition(":")
                key = key.lower().strip()
                value = value.strip()

                if any(kw in key for kw in ["yesterday", "done", "completed"]):
                    yesterday = value
                elif any(kw in key for kw in ["today", "plan", "doing"]):
                    today = value
                elif any(kw in key for kw in ["blocker", "blocked"]):
                    blockers = value

        if yesterday and today:
            return StandupContent(
                yesterday=yesterday,
                today=today,
                blockers=blockers,
                confidence=0.85,
            )

        return None

    def _parse_line_standup(self, lines: list[str]) -> StandupContent | None:
        """Parse line-based standup."""
        # Simple heuristic: first substantive line is yesterday, second is today
        substantive_lines = [l.strip() for l in lines if l.strip() and len(l.strip()) > 5]

        if len(substantive_lines) >= 2:
            # Check if lines start with indicators
            yesterday = ""
            today = ""
            blockers = None

            for line in substantive_lines:
                line_lower = line.lower()
                if any(kw in line_lower for kw in ["yesterday", "done", "completed"]):
                    yesterday = re.sub(r"^(yesterday|done|completed)[\s:]*", "", line, flags=re.IGNORECASE).strip()
                elif any(kw in line_lower for kw in ["today", "plan", "doing"]):
                    today = re.sub(r"^(today|plan|doing)[\s:]*", "", line, flags=re.IGNORECASE).strip()
                elif any(kw in line_lower for kw in ["blocker", "blocked"]):
                    blockers = re.sub(r"^(blocker|blocked)[\s:]*", "", line, flags=re.IGNORECASE).strip()

            if yesterday and today:
                return StandupContent(
                    yesterday=yesterday,
                    today=today,
                    blockers=blockers,
                    confidence=0.75,
                )

        return None

    def detect_blockers(self, text: str) -> list[BlockerMention]:
        """Detect blocker mentions in text."""
        blockers = []
        text_lower = text.lower()

        # Check for blocker keywords
        for keyword in self.BLOCKER_KEYWORDS:
            if keyword in text_lower:
                # Extract the blocker description
                idx = text_lower.find(keyword)

                # Try to get the sentence/phrase containing the blocker
                # Look for sentence boundaries
                start = max(0, text.rfind(".", 0, idx) + 1, text.rfind("\n", 0, idx) + 1)
                end = text.find(".", idx)
                if end == -1:
                    end = text.find("\n", idx)
                if end == -1:
                    end = len(text)

                description = text[start:end].strip()
                if len(description) < 5:
                    continue

                # Determine severity
                severity = "medium"
                if any(kw in description.lower() for kw in self.SEVERITY_HIGH_KEYWORDS):
                    severity = "high"
                elif any(kw in description.lower() for kw in self.SEVERITY_LOW_KEYWORDS):
                    severity = "low"

                # Check for task reference in the description
                task_refs = self.extract_task_references(description)
                task_ref = task_refs[0].ref_string if task_refs else None

                blocker = BlockerMention(
                    description=description,
                    task_ref=task_ref,
                    severity=severity,
                    confidence=0.8 if keyword in ["blocked", "blocker", "can't proceed"] else 0.6,
                )
                blockers.append(blocker)
                break  # Only get one blocker per keyword occurrence

        return blockers

    def _classify_message(self, text: str) -> str:
        """Classify message type based on content."""
        text_lower = text.lower()

        # Check for questions
        if any(kw in text_lower for kw in self.QUESTION_KEYWORDS):
            return "question"

        # Check for progress updates
        if any(kw in text_lower for kw in self.PROGRESS_KEYWORDS):
            return "update"

        # Check for task references
        if self.extract_task_references(text):
            return "task_mention"

        return "general"

    def _detect_sentiment(self, text: str) -> str:
        """Simple sentiment detection."""
        text_lower = text.lower()

        positive_words = ["great", "awesome", "done", "completed", "finished", "success", "working", "fixed"]
        negative_words = ["blocked", "stuck", "problem", "issue", "failed", "broken", "can't", "won't"]

        positive_count = sum(1 for word in positive_words if word in text_lower)
        negative_count = sum(1 for word in negative_words if word in text_lower)

        if positive_count > negative_count:
            return "positive"
        elif negative_count > positive_count:
            return "negative"
        return "neutral"

    def is_likely_standup(self, text: str) -> bool:
        """Quick check if message is likely a standup."""
        text_lower = text.lower()

        # Must have both yesterday and today mentions
        has_yesterday = any(kw in text_lower for kw in ["yesterday", "done", "completed"])
        has_today = any(kw in text_lower for kw in ["today", "plan", "doing", "working on"])

        return has_yesterday and has_today

    def extract_action_items(self, text: str) -> list[str]:
        """Extract action items from standup or message."""
        items = []

        # Look for bullet points or numbered items
        bullet_pattern = re.compile(r"^[\s]*[-*•]\s*(.+)$", re.MULTILINE)
        numbered_pattern = re.compile(r"^[\s]*\d+[.)]\s*(.+)$", re.MULTILINE)

        for pattern in [bullet_pattern, numbered_pattern]:
            for match in pattern.finditer(text):
                item = match.group(1).strip()
                if len(item) > 5:  # Filter out very short items
                    items.append(item)

        return items
