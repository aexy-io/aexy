"""Excerpting a markdown post for the surfaces that cannot render it.

A community post is markdown, and the thread view renders it. A search snippet
and an RSS ``<description>`` are prose fields with no renderer behind them, so
the syntax has to come back out first — otherwise a release note is quoted into
Google and into feed readers as ``## Added - A changelog script…``.

The frontend has the same rules in ``src/lib/markdownText.ts`` for the meta
description and the JSON-LD; the two are kept in step by the cases below and
their counterparts in ``src/test/communityMarkdown.test.tsx``.
"""

from aexy.services.public_community_service import excerpt_text, render_public_content


class TestExcerptText:
    def test_flattens_a_changelog_to_prose(self):
        assert excerpt_text(
            "## Added\n\n- A [changelog script](https://example.com)\n"
            "- **Bold** and `code`\n"
        ) == "Added A changelog script Bold and code"

    def test_keeps_code_block_contents_but_drops_the_fences(self):
        # The code is often the part of a release note worth matching on.
        assert excerpt_text("```py\nprint(1)\n```") == "print(1)"

    def test_drops_table_markup(self):
        assert excerpt_text("| a | b |\n| --- | --- |\n| 1 | 2 |") == "a b 1 2"

    def test_drops_images_quotes_and_rules(self):
        assert excerpt_text("![alt text](x.png)") == "alt text"
        assert excerpt_text("> quoted\n\n---\n\nafter") == "quoted after"

    def test_unwraps_autolinks_to_the_bare_url(self):
        assert excerpt_text("see <https://example.com/x>") == "see https://example.com/x"

    def test_still_strips_internal_mention_markup(self):
        # excerpt_text builds on render_public_content, so the mention target id
        # must not survive into a snippet any more than into the thread.
        raw = "thanks @[Ada Lovelace](mention:user:0f1e2d3c) for the fix"
        assert excerpt_text(raw) == "thanks @Ada Lovelace for the fix"
        assert "mention:user" not in excerpt_text(raw)

    def test_keeps_emphasis_characters_that_are_code_or_arithmetic(self):
        # A `*` or `_` flanked by alphanumerics is literal in CommonMark.
        # Stripping it anyway rewrote `run_migrations.py` and turned `4*5=20`
        # into `45=20` — a different number, not merely lost formatting.
        assert excerpt_text("run `run_migrations.py` for web_public") == (
            "run run_migrations.py for web_public"
        )
        assert excerpt_text("4*5=20 and x**2") == "4*5=20 and x**2"
        assert excerpt_text("_italic_ and __bold__ still go") == "italic and bold still go"

    def test_keeps_brackets_that_are_a_type_or_an_index(self):
        assert excerpt_text("Fixed Optional[str] in messages[0]") == (
            "Fixed Optional[str] in messages[0]"
        )
        # A real reference link still resolves to its text.
        assert excerpt_text("see [the docs][1]") == "see the docs"

    def test_cuts_at_a_word_boundary(self):
        # A mid-word cut is visible in a search result and reads as a broken page.
        assert excerpt_text("## Adds the changelog publishing script", limit=20) == (
            "Adds the changelog…"
        )

    def test_cuts_a_single_unbroken_token_anyway(self):
        # Honouring the boundary here would throw the whole excerpt away.
        assert excerpt_text("x" * 50, limit=20) == "x" * 20 + "…"

    def test_leaves_a_short_post_untouched(self):
        assert excerpt_text("Just text.") == "Just text."

    def test_handles_empty_and_none_content(self):
        assert excerpt_text("") == ""
        assert excerpt_text(None) == ""  # type: ignore[arg-type]

    def test_collapses_newlines_because_the_field_is_one_line(self):
        assert excerpt_text("first\nsecond\n\nthird") == "first second third"


class TestRenderPublicContentUnchanged:
    def test_thread_content_keeps_its_markdown(self):
        # The thread view renders markdown, so the message body served to it must
        # NOT be flattened — only the excerpt paths strip syntax.
        body = "## Added\n\n- one\n"
        assert render_public_content(body) == body
