"""Layer-0 deterministic enrichment for synced GitHub artifacts.

Pure-Python signal extraction that runs inline during sync. Cheap, no API
calls, no LLM. Output gates Layer-1 LLM analysis so we don't burn tokens on
bot commits, formatter-only changes, or trivial PRs.
"""

from __future__ import annotations

import hashlib
import re
from typing import Any

# Author logins / emails that are bots. Suffix match against the literal
# GitHub bot suffix and a small allow-list of well-known automation accounts.
_BOT_LOGIN_SUFFIXES = ("[bot]", "-bot", "bot")
_BOT_LOGINS = frozenset(
    {
        "dependabot",
        "dependabot-preview",
        "renovate",
        "renovate-bot",
        "github-actions",
        "github-actions[bot]",
        "claude",
        "claude[bot]",
        "copilot-pull-request-reviewer",
        "imgbot",
        "snyk-bot",
        "pre-commit-ci",
        "allcontributors",
    }
)

_REVERT_RE = re.compile(r"^revert[\s:\"]", re.IGNORECASE)

# File-class buckets. The first match wins, so order matters (test before code).
_TEST_PATTERNS = re.compile(
    r"(^|/)(tests?|__tests__|spec|e2e)(/|$)|(\.test\.|\.spec\.|_test\.|_spec\.)",
    re.IGNORECASE,
)
_DOCS_PATTERNS = re.compile(
    r"(^|/)(docs?|documentation)(/|$)|(\.md$|\.mdx$|\.rst$|\.txt$|^readme|^license|^changelog)",
    re.IGNORECASE,
)
_CONFIG_PATTERNS = re.compile(
    r"(^|/)\.[^/]+rc(\..+)?$"          # .eslintrc, .prettierrc, etc.
    r"|(^|/)(package-lock\.json|yarn\.lock|pnpm-lock\.yaml|poetry\.lock|uv\.lock|cargo\.lock|gemfile\.lock|composer\.lock|go\.sum)$"
    r"|(\.cfg$|\.ini$|\.toml$|\.yaml$|\.yml$|\.json$|\.env(\..+)?$)"
    r"|(^|/)(dockerfile|docker-compose\.ya?ml|makefile|.gitignore|.gitattributes)$",
    re.IGNORECASE,
)
_GENERATED_PATTERNS = re.compile(
    r"(^|/)(dist|build|out|target|node_modules|vendor|\.next|coverage)(/|$)"
    r"|(\.min\.js$|\.bundle\.js$|\.generated\.|_pb\.|\.pb\.go$)",
    re.IGNORECASE,
)


def classify_author(github_login: str | None, email: str | None) -> str:
    """Return one of: 'bot' | 'external' | 'human'.

    'external' is reserved for human authors whose identity we couldn't
    resolve to an internal Developer (caller's responsibility — this
    function only distinguishes bots from non-bots). For the unresolved
    case the caller should override with 'external'.
    """
    login = (github_login or "").strip().lower()
    if login:
        if login in _BOT_LOGINS:
            return "bot"
        if login.endswith("[bot]"):
            return "bot"
    if email and email.endswith("@users.noreply.github.com") and "[bot]" in email:
        return "bot"
    return "human"


def classify_change(files: list[dict[str, Any]] | None) -> str | None:
    """Bucket a commit/PR by the kinds of files it touches.

    Returns one of:
        'test_only'      — every file is a test
        'docs_only'      — every file is documentation
        'config_only'    — every file is config / lockfile / CI manifest
        'generated'      — every file is in a generated/vendored path
        'formatter_only' — small, broad whitespace change (heuristic via stats only)
        'code'           — at least one production source file
        None             — no files (commit-details fetch failed)
    """
    if not files:
        return None

    buckets: set[str] = set()
    for f in files:
        path = f.get("filename") or ""
        if not path:
            continue
        if _TEST_PATTERNS.search(path):
            buckets.add("test")
        elif _DOCS_PATTERNS.search(path):
            buckets.add("docs")
        elif _GENERATED_PATTERNS.search(path):
            buckets.add("generated")
        elif _CONFIG_PATTERNS.search(path):
            buckets.add("config")
        else:
            buckets.add("code")

    if buckets == {"test"}:
        return "test_only"
    if buckets == {"docs"}:
        return "docs_only"
    if buckets == {"config"}:
        return "config_only"
    if buckets == {"generated"}:
        return "generated"
    return "code"


def is_merge_commit(commit_data: dict[str, Any]) -> bool:
    """A GitHub commit object lists its parents; >1 parent means merge."""
    parents = commit_data.get("parents") or []
    return len(parents) > 1


def is_revert_commit(message: str | None) -> bool:
    if not message:
        return False
    return bool(_REVERT_RE.match(message.strip()))


_LOCKFILE_NAMES = frozenset(
    {
        "package-lock.json",
        "yarn.lock",
        "pnpm-lock.yaml",
        "poetry.lock",
        "uv.lock",
        "cargo.lock",
        "gemfile.lock",
        "composer.lock",
        "go.sum",
        "podfile.lock",
        "packages.lock.json",
        "mix.lock",
    }
)


def counts_as_source(path: str) -> bool:
    """Would a person counting "lines written" count this file?

    No for lockfiles, vendored and build output, minified bundles and
    generated code — the churn that makes one `npm install` outweigh a month
    of work. Yes for everything else, tests and docs included: they are
    written by hand and `change_class` already distinguishes them for anyone
    who wants to split them out.
    """
    if not path:
        return False
    if path.rsplit("/", 1)[-1].lower() in _LOCKFILE_NAMES:
        return False
    return not _GENERATED_PATTERNS.search(path)


def source_churn(files: list[dict[str, Any]] | None) -> tuple[int, int, int] | None:
    """(additions, deletions, files) counting source files only.

    Returns None when there is no file list to judge — the commit-details
    fetch failed, or the payload never carried one. The caller stores NULL so
    a report can say "not measured" rather than publish a zero as if the
    commit were empty.
    """
    if not files:
        return None

    additions = deletions = counted = 0
    for f in files:
        if not counts_as_source(f.get("filename") or ""):
            continue
        additions += int(f.get("additions") or 0)
        deletions += int(f.get("deletions") or 0)
        counted += 1
    return additions, deletions, counted


def content_hash(files: list[dict[str, Any]] | None) -> str | None:
    """Fingerprint the change so a cherry-pick collides with its original.

    `git patch-id --stable` in spirit: hash the diff, ignoring where it sits in
    history. The line *content* is what we hash — filename plus the added and
    removed lines of each file's patch, sorted by filename — so the same change
    ported to another branch, with different line offsets and a different sha,
    lands on the same hash. Hunk headers are dropped for that reason.

    Returns None when there is no patch to hash (a merge commit, or a
    commit-details fetch that failed). Never treat None as "unique" or as
    "duplicate" — it means unknown, and a report should count the row once and
    disclose that it could not be deduplicated.
    """
    if not files:
        return None

    parts: list[str] = []
    for f in sorted(files, key=lambda x: x.get("filename") or ""):
        filename = f.get("filename") or ""
        patch = f.get("patch")
        if not filename or not patch:
            continue
        body = "\n".join(
            line
            for line in patch.splitlines()
            # +++/--- are file headers, @@ is a hunk header carrying the line
            # offsets that a port changes and we are trying to ignore.
            if (line.startswith(("+", "-")) and not line.startswith(("+++", "---")))
        )
        parts.append(f"{filename}\n{body}")

    if not parts:
        return None
    return hashlib.sha256("\n".join(parts).encode("utf-8")).hexdigest()


def size_bucket(additions: int, deletions: int, files_changed: int) -> str:
    """Bucket a PR (or commit) by total churn. Mirrors GitHub's PR size labels."""
    total = (additions or 0) + (deletions or 0)
    if total <= 10 and files_changed <= 2:
        return "xs"
    if total <= 50 and files_changed <= 5:
        return "s"
    if total <= 250 and files_changed <= 10:
        return "m"
    if total <= 1000 and files_changed <= 30:
        return "l"
    return "xl"


# A patch_sample stored at sync time so re-analysis doesn't need a second
# GitHub round-trip. Capped to keep table size sane and prevent token blowup
# when a single commit is enormous.
PATCH_SAMPLE_MAX_BYTES = 50_000
PATCH_SAMPLE_PER_FILE_MAX_BYTES = 8_000


def build_patch_sample(files: list[dict[str, Any]] | None) -> str | None:
    """Concatenate per-file unified diffs into one capped blob.

    Skips files that look generated/lockfile (zero signal, big tokens).
    Returns None if there's nothing useful to keep.
    """
    if not files:
        return None
    chunks: list[str] = []
    used = 0
    for f in files:
        filename = f.get("filename") or ""
        patch = f.get("patch")
        if not patch or not filename:
            continue
        if _GENERATED_PATTERNS.search(filename):
            continue
        if filename.endswith((".lock", "package-lock.json", "yarn.lock", "uv.lock", "poetry.lock")):
            continue
        snippet = patch[:PATCH_SAMPLE_PER_FILE_MAX_BYTES]
        header = f"\n--- {filename} ---\n"
        budget = PATCH_SAMPLE_MAX_BYTES - used - len(header)
        if budget <= 0:
            break
        snippet = snippet[:budget]
        chunks.append(header + snippet)
        used += len(header) + len(snippet)
        if used >= PATCH_SAMPLE_MAX_BYTES:
            break
    if not chunks:
        return None
    return "".join(chunks)
