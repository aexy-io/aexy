"""The published documentation says things that are true.

Not about prose — nothing can check that. About the two mechanical ways
`docs/` breaks, both of which happened before these tests existed:

**A link in `README.md` that points nowhere.** The nav for the public docs site
is built by parsing that file. A file it does not reference is not dropped — it
is bucketed under its parent directory and published under its raw filename as
a title. So a typo does not produce a 404 anybody notices; it produces a page
live on the internet with a name like `DOCUMENTS_AND_DRIVE`.

**An image reference with no file, or a file no page references.** The first is
a broken image on a public page. The second is a screenshot somebody forgot to
delete, which is how a stale picture of an old UI survives three redesigns.

These live in the backend suite because that is the one that runs on every
change; `docs/` is repo-level and belongs to neither half.
"""

import re
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[3]
DOCS = REPO / "docs"

#: Held back from the public site by `generate-docs.mjs`, so a link to one is
#: not a promise the site can keep. Kept in step with EXCLUDED there.
NOT_PUBLISHED = {
    "FEATURE_TESTING_PLAN.md",
    "GITHUB_INTELLIGENCE_SYSTEM.md",
    "tracker.md",
    "testing/testing-tracker.md",
}

_MARKDOWN_LINK = re.compile(r"\[[^\]]*\]\(([^)]+)\)")
_IMAGE = re.compile(r"!\[[^\]]*\]\(([^)]+)\)")

pytestmark = pytest.mark.skipif(
    not DOCS.is_dir(), reason="docs/ not present in this checkout"
)


def _markdown_files() -> list[Path]:
    return sorted(DOCS.rglob("*.md"))


def _local_targets(pattern: re.Pattern, text: str) -> list[str]:
    """Link targets that point at a file in this repo.

    External URLs and in-page anchors are somebody else's problem.
    """
    out = []
    for target in pattern.findall(text):
        target = target.split()[0].strip()
        if target.startswith(("http://", "https://", "mailto:", "#")):
            continue
        # A root-relative link is a route on the marketing site (`/mission`),
        # not a file in this directory.
        if target.startswith("/"):
            continue
        out.append(target.split("#")[0])
    return [t for t in out if t]


def test_there_are_docs_to_check():
    """Guards against the whole file passing because it found nothing."""
    assert len(_markdown_files()) > 20


def test_readme_links_resolve():
    """Every link in the index points at a file that exists.

    The generator buckets anything unlinked rather than failing, so a broken
    link here is silent — and the page it should have named ends up published
    under its raw filename with no nav entry.
    """
    readme = DOCS / "README.md"
    broken = []

    for target in _local_targets(_MARKDOWN_LINK, readme.read_text()):
        if not (DOCS / target).exists():
            broken.append(target)

    assert not broken, f"README.md links to files that do not exist: {broken}"


def test_readme_does_not_link_unpublished_pages():
    """A link to a page the generator holds back is a promise the site cannot
    keep: the nav entry renders and the page 404s."""
    readme = DOCS / "README.md"
    linked = {
        t.lstrip("./") for t in _local_targets(_MARKDOWN_LINK, readme.read_text())
    }
    assert not (linked & NOT_PUBLISHED), (
        f"README.md links pages excluded from the site: {sorted(linked & NOT_PUBLISHED)}"
    )


def test_image_references_resolve():
    """No broken images on the public site."""
    broken = []

    for page in _markdown_files():
        for target in _local_targets(_IMAGE, page.read_text()):
            resolved = (page.parent / target).resolve()
            if not resolved.exists():
                broken.append(f"{page.relative_to(DOCS)} → {target}")

    assert not broken, f"images referenced but missing: {broken}"


def test_every_image_is_referenced():
    """No orphans.

    An unreferenced image is how a screenshot of a UI that no longer exists
    survives: nothing renders it, so nobody notices it is wrong, and the next
    person to need one finds it and uses it.
    """
    images_dir = DOCS / "images"
    if not images_dir.is_dir():
        pytest.skip("no docs/images yet")

    referenced: set[Path] = set()
    for page in _markdown_files():
        for target in _local_targets(_IMAGE, page.read_text()):
            referenced.add((page.parent / target).resolve())

    on_disk = {
        p.resolve()
        for p in images_dir.rglob("*")
        if p.is_file() and p.suffix.lower() in {".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg"}
    }

    orphans = sorted(str(p.relative_to(DOCS)) for p in on_disk - referenced)
    assert not orphans, (
        f"images no page references: {orphans}. Reference them, or delete them — "
        "an unreferenced screenshot is one nobody will notice has gone stale."
    )


def test_the_knowledge_base_guide_is_linked():
    """The user-facing guide specifically, because it is the one a reader is
    most likely to arrive looking for and the easiest to leave unlinked."""
    guide = DOCS / "knowledge-base.md"
    assert guide.exists(), "docs/knowledge-base.md is missing"
    assert "knowledge-base.md" in (DOCS / "README.md").read_text(), (
        "knowledge-base.md exists but README.md does not link it, so it would "
        "publish under its raw filename with no nav entry"
    )
