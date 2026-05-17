"""Layer-0 security pattern scanner for PR diffs.

Looks for hardcoded secrets, sensitive-area touches, and risky-call markers
in the stored `patch_sample`. Pure Python — no LLM, no network. Output is
attached to `pull_requests.ai_analysis.security_findings` by the
`scan_pr_security` activity.

Detections are intentionally conservative: a true positive surfaces as a
yellow flag for human review, not a block. False positives are fine — the
UI lets reviewers dismiss them.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any


@dataclass(frozen=True)
class SecurityFinding:
    kind: str          # 'secret' | 'sensitive_area' | 'risky_call'
    severity: str      # 'high' | 'medium' | 'low'
    pattern: str       # human-readable label (e.g. 'AWS access key')
    file: str | None
    line_hint: str | None  # short snippet of the offending line

    def to_dict(self) -> dict[str, Any]:
        return {
            "kind": self.kind,
            "severity": self.severity,
            "pattern": self.pattern,
            "file": self.file,
            "line_hint": self.line_hint,
        }


# Secret patterns. The list is short and high-precision on purpose — false
# positives erode trust faster than false negatives.
_SECRET_RULES: list[tuple[str, str, re.Pattern[str]]] = [
    ("AWS access key", "high", re.compile(r"AKIA[0-9A-Z]{16}")),
    ("AWS secret access key", "high", re.compile(r"(?i)aws[_-]?secret[_-]?access[_-]?key\s*=\s*['\"][A-Za-z0-9/+=]{40}['\"]")),
    ("GitHub fine-grained PAT", "high", re.compile(r"github_pat_[A-Za-z0-9_]{22,}")),
    ("GitHub OAuth token", "high", re.compile(r"\bgho_[A-Za-z0-9]{36,}\b")),
    ("GitHub server-to-server token", "high", re.compile(r"\bghs_[A-Za-z0-9]{36,}\b")),
    ("GitHub user-to-server token", "high", re.compile(r"\bghu_[A-Za-z0-9]{36,}\b")),
    ("Slack token", "high", re.compile(r"xox[abps]-[A-Za-z0-9-]{10,}")),
    ("Stripe live key", "high", re.compile(r"\bsk_live_[A-Za-z0-9]{24,}\b")),
    ("Google API key", "high", re.compile(r"AIza[0-9A-Za-z\-_]{35}")),
    ("Private key block", "high", re.compile(r"-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----")),
    ("Generic hardcoded password", "medium", re.compile(r"(?i)\b(password|passwd|pwd)\s*=\s*['\"][^'\"]{6,}['\"]")),
    ("Hardcoded API key assignment", "medium", re.compile(r"(?i)\b(api[_-]?key|secret[_-]?key)\s*=\s*['\"][^'\"]{16,}['\"]")),
    ("Generic bearer token literal", "medium", re.compile(r"(?i)Bearer\s+[A-Za-z0-9._-]{20,}")),
]

# Filenames whose touch should raise a yellow flag for reviewer attention.
_SENSITIVE_FILE_PATTERNS = [
    (re.compile(r"(^|/)(auth|authentication|authorization|jwt|oauth|session)/?", re.IGNORECASE), "auth / session code"),
    (re.compile(r"(^|/)(payment|billing|stripe|paypal|invoice)/?", re.IGNORECASE), "billing / payments code"),
    (re.compile(r"(^|/)migration", re.IGNORECASE), "database migration"),
    (re.compile(r"(^|/)\.github/workflows/", re.IGNORECASE), "CI workflow"),
    (re.compile(r"(^|/)Dockerfile($|\.)", re.IGNORECASE), "Dockerfile"),
    (re.compile(r"(^|/)(crypto|encryption|hash|password)", re.IGNORECASE), "crypto code"),
    (re.compile(r"(^|/)(rbac|permissions|policy|roles)", re.IGNORECASE), "permissions / RBAC"),
]

# Risky-call patterns inside the diff body. Looks at lines that *add* content
# (start with '+') so we don't flag stuff being removed.
_RISKY_CALL_RULES: list[tuple[str, str, re.Pattern[str]]] = [
    ("Shell with shell=True", "medium", re.compile(r"shell\s*=\s*True")),
    ("eval(", "high", re.compile(r"\beval\s*\(")),
    ("exec(", "high", re.compile(r"\bexec\s*\(")),
    ("os.system(", "medium", re.compile(r"\bos\.system\s*\(")),
    ("dangerouslySetInnerHTML", "medium", re.compile(r"dangerouslySetInnerHTML")),
    ("SQL string concat", "medium", re.compile(r"(SELECT|INSERT|UPDATE|DELETE)\b[^;]*?\+\s*['\"]")),
    ("Subprocess shell=True", "medium", re.compile(r"subprocess\.(call|run|Popen)\([^)]*shell\s*=\s*True")),
    ("verify=False (TLS off)", "medium", re.compile(r"\bverify\s*=\s*False\b")),
    ("AllowAll CORS", "low", re.compile(r"['\"]Access-Control-Allow-Origin['\"]\s*:\s*['\"]\*['\"]")),
]

# Each per-file diff block starts with `--- {filename} ---` from
# `build_patch_sample`. We iterate file-by-file so findings carry the path.
_FILE_HEADER = re.compile(r"^---\s+(\S+?)\s+---\s*$", re.MULTILINE)


def _iter_file_blocks(patch_sample: str):
    """Yield (filename, block_text) pairs split on the patch_sample headers."""
    matches = list(_FILE_HEADER.finditer(patch_sample))
    if not matches:
        # No headers — treat the whole thing as one anonymous block.
        yield (None, patch_sample)
        return
    for i, m in enumerate(matches):
        filename = m.group(1)
        start = m.end()
        end = matches[i + 1].start() if i + 1 < len(matches) else len(patch_sample)
        yield (filename, patch_sample[start:end])


def _added_lines(block: str) -> list[str]:
    """Return only the '+' lines (additions) from a unified-diff block.
    Skips the file headers (+++ ...) and context lines.
    """
    out: list[str] = []
    for line in block.splitlines():
        if line.startswith("+") and not line.startswith("+++"):
            out.append(line[1:])
    return out


def scan_patch_sample(patch_sample: str | None, files_changed: list[str] | None = None) -> list[SecurityFinding]:
    """Run all detectors against a stored `patch_sample` blob.

    `files_changed` is an optional override — used when patch_sample is
    missing but we still know which files the PR touched (from
    GitHub-reported file list).
    """
    findings: list[SecurityFinding] = []

    # Sensitive-area markers fire purely on filenames — no diff needed.
    candidate_files: list[str] = []
    if patch_sample:
        candidate_files.extend(name for name, _ in _iter_file_blocks(patch_sample) if name)
    if files_changed:
        candidate_files.extend(files_changed)
    seen_sensitive: set[tuple[str, str]] = set()
    for f in candidate_files:
        for pattern, label in _SENSITIVE_FILE_PATTERNS:
            if pattern.search(f) and (label, f) not in seen_sensitive:
                seen_sensitive.add((label, f))
                findings.append(
                    SecurityFinding(
                        kind="sensitive_area",
                        severity="low",
                        pattern=label,
                        file=f,
                        line_hint=None,
                    )
                )

    if not patch_sample:
        return findings

    for filename, block in _iter_file_blocks(patch_sample):
        added = _added_lines(block)
        added_text = "\n".join(added)

        for label, severity, pattern in _SECRET_RULES:
            for match in pattern.finditer(added_text):
                line_hint = _line_around(added_text, match.start())
                findings.append(
                    SecurityFinding(
                        kind="secret",
                        severity=severity,
                        pattern=label,
                        file=filename,
                        line_hint=line_hint,
                    )
                )

        for label, severity, pattern in _RISKY_CALL_RULES:
            for match in pattern.finditer(added_text):
                line_hint = _line_around(added_text, match.start())
                findings.append(
                    SecurityFinding(
                        kind="risky_call",
                        severity=severity,
                        pattern=label,
                        file=filename,
                        line_hint=line_hint,
                    )
                )

    # Cap so a runaway PR can't bloat the JSONB payload.
    return findings[:200]


def _line_around(text: str, offset: int) -> str:
    """Return the single line containing `offset`, trimmed for display.

    We trim secret-like values from the snippet so the UI doesn't
    re-display the credential. Anything 16+ chars of base64-ish characters
    gets redacted.
    """
    start = text.rfind("\n", 0, offset) + 1
    end = text.find("\n", offset)
    line = text[start: end if end != -1 else len(text)].strip()
    redacted = re.sub(r"[A-Za-z0-9/+=_-]{16,}", "<redacted>", line)
    return redacted[:200]


def summary_metrics(findings: list[SecurityFinding]) -> dict[str, Any]:
    """Roll up the findings list into headline numbers for the UI."""
    by_severity = {"high": 0, "medium": 0, "low": 0}
    by_kind = {"secret": 0, "sensitive_area": 0, "risky_call": 0}
    for f in findings:
        by_severity[f.severity] = by_severity.get(f.severity, 0) + 1
        by_kind[f.kind] = by_kind.get(f.kind, 0) + 1
    return {
        "total": len(findings),
        "by_severity": by_severity,
        "by_kind": by_kind,
    }
