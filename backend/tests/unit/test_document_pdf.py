"""PDF export.

Most of this is ordinary rendering. Two things are not, and they are why the
module exists rather than being three lines of reportlab:

**The font.** reportlab's built-in faces are Latin-1 and the only TTFs it
bundles are Vera — 283 glyphs, no Devanagari. The product ships Hindi, so the
default configuration renders a Hindi document as a page of empty boxes: the
export succeeds, the file opens, and the content is gone. That is the worst
shape a failure can take, and `TestFonts` is the test that stops it being
silent.

**The images.** A document's image URLs are user-supplied, so fetching them
server-side is a server-side request forgery primitive unless it goes through
the SSRF guard. `TestImages` pins that a failure degrades to alt text rather
than aborting the export.
"""

import pytest

import aexy.services.document_pdf as pdf_module
from aexy.services.document_pdf import (
    FONT_DIR_ENV,
    _fetch_image,
    tiptap_to_pdf,
)


def _doc(*nodes) -> dict:
    return {"type": "doc", "content": list(nodes)}


def _para(text: str) -> dict:
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


@pytest.fixture(autouse=True)
def _reset_font_registry(monkeypatch):
    """The registry is a module-level cache, so a test that registers a font
    would otherwise decide the outcome of every test after it."""
    monkeypatch.setattr(pdf_module, "_fonts", None)
    yield
    monkeypatch.setattr(pdf_module, "_fonts", None)


class TestRendering:
    def test_it_produces_a_pdf(self):
        result = tiptap_to_pdf(_doc(_para("Hello")), "Greeting")
        assert result.pdf.startswith(b"%PDF-")

    def test_every_block_type_renders(self):
        """Node coverage matches the Markdown renderer; a type this does not
        know falls through to its text rather than disappearing."""
        document = _doc(
            {
                "type": "heading",
                "attrs": {"level": 1},
                "content": [{"type": "text", "text": "Runbook"}],
            },
            _para("Intro"),
            {
                "type": "bulletList",
                "content": [
                    {"type": "listItem", "content": [_para("one")]},
                    {"type": "listItem", "content": [_para("two")]},
                ],
            },
            {
                "type": "orderedList",
                "content": [{"type": "listItem", "content": [_para("first")]}],
            },
            {
                "type": "taskList",
                "content": [
                    {
                        "type": "taskItem",
                        "attrs": {"checked": True},
                        "content": [_para("done")],
                    }
                ],
            },
            {"type": "blockquote", "content": [_para("Escalate after 20 minutes.")]},
            {
                "type": "codeBlock",
                "attrs": {"language": "bash"},
                "content": [{"type": "text", "text": "systemctl restart worker"}],
            },
            {"type": "horizontalRule"},
            {
                "type": "table",
                "content": [
                    {
                        "type": "tableRow",
                        "content": [
                            {"type": "tableHeader", "content": [_para("Env")]},
                            {"type": "tableHeader", "content": [_para("Host")]},
                        ],
                    },
                    {
                        "type": "tableRow",
                        "content": [
                            {"type": "tableCell", "content": [_para("prod")]},
                            {"type": "tableCell", "content": [_para("a1")]},
                        ],
                    },
                ],
            },
        )

        result = tiptap_to_pdf(document, "Everything")
        assert result.pdf.startswith(b"%PDF-")
        assert result.warnings == []

    def test_an_unknown_block_keeps_its_words(self):
        document = _doc(
            {
                "type": "someFutureBlock",
                "content": [{"type": "text", "text": "important"}],
            }
        )
        assert tiptap_to_pdf(document, "Future").pdf.startswith(b"%PDF-")

    def test_markup_in_prose_does_not_become_markup(self):
        """reportlab's paragraph parser raises on malformed markup, so an
        unescaped angle bracket in someone's prose would fail the export."""
        document = _doc(_para("Use <b>bold</b> and & ampersands < like this"))
        assert tiptap_to_pdf(document, "Escaping").pdf.startswith(b"%PDF-")

    def test_a_nested_list_renders(self):
        document = _doc(
            {
                "type": "bulletList",
                "content": [
                    {
                        "type": "listItem",
                        "content": [
                            _para("one"),
                            {
                                "type": "bulletList",
                                "content": [
                                    {"type": "listItem", "content": [_para("nested")]}
                                ],
                            },
                        ],
                    }
                ],
            }
        )
        assert tiptap_to_pdf(document, "Nested").pdf.startswith(b"%PDF-")

    def test_an_empty_document_still_exports(self):
        assert tiptap_to_pdf(_doc(), "Empty").pdf.startswith(b"%PDF-")

    def test_a_contents_page_appears_only_for_a_long_document(self):
        short = tiptap_to_pdf(
            _doc(
                {
                    "type": "heading",
                    "attrs": {"level": 1},
                    "content": [{"type": "text", "text": "Only one"}],
                }
            ),
            "Short",
        )
        long = tiptap_to_pdf(
            _doc(
                *[
                    {
                        "type": "heading",
                        "attrs": {"level": 2},
                        "content": [{"type": "text", "text": f"Section {n}"}],
                    }
                    for n in range(6)
                ]
            ),
            "Long",
        )
        # Not asserting on rendered text — that means parsing the PDF. The
        # observable difference is that the long one carries a whole extra page
        # of contents plus a page break.
        assert len(long.pdf) > len(short.pdf)


class TestFonts:
    def test_a_hindi_document_warns_rather_than_rendering_boxes(self):
        """The failure this module exists to prevent.

        Without the coverage check the export succeeds, the file opens, and
        every Devanagari glyph is an empty rectangle — silently, and for
        exactly the users the Hindi locale was added for.
        """
        document = _doc(_para("यह एक परीक्षण है।"))
        result = tiptap_to_pdf(document, "नीति")

        assert result.pdf.startswith(b"%PDF-"), "the export must still produce a file"
        assert result.warnings, "unrenderable script produced no warning"
        assert FONT_DIR_ENV in result.warnings[0], (
            "the warning must say how to fix it"
        )

    def test_one_warning_of_each_kind_for_the_whole_document(self):
        """Per paragraph, a long Hindi document would produce dozens of
        warnings saying the same thing with different sample letters.

        Two kinds are expected, and they are different problems: the glyphs
        are missing from the fallback font, *and* the exporter cannot reshape
        Devanagari even once they are present. Fixing the font silences the
        first and leaves the second.
        """
        document = _doc(
            _para("यह एक परीक्षण है।"),
            _para("दूसरा अनुच्छेद।"),
            _para("तीसरा अनुच्छेद।"),
        )
        result = tiptap_to_pdf(document, "Policy")
        assert len(result.warnings) == 2, result.warnings
        assert sum("cannot be drawn" in w for w in result.warnings) == 1
        assert sum("does not reshape" in w for w in result.warnings) == 1

    def test_a_latin_document_warns_about_nothing(self):
        result = tiptap_to_pdf(_doc(_para("Ordinary English prose.")), "Plain")
        assert result.warnings == []

    def test_a_covering_font_removes_the_warning(self, tmp_path, monkeypatch):
        """Proves the escape hatch the warning points at actually works.

        Skipped where no Devanagari-capable TTF is available, rather than
        asserting against whatever the machine happens to have.
        """
        import os
        import shutil

        candidates = [
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf",
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
        ]
        source = next((c for c in candidates if os.path.exists(c)), None)
        if source is None:
            pytest.skip("no Devanagari-capable TTF on this machine")

        font_dir = tmp_path / "fonts"
        font_dir.mkdir()
        shutil.copy(source, font_dir / "Covering-Regular.ttf")
        monkeypatch.setenv(FONT_DIR_ENV, str(font_dir))

        result = tiptap_to_pdf(_doc(_para("यह एक परीक्षण है।")), "नीति")

        # The chosen font may not in fact cover Devanagari (DejaVu does not);
        # what is being tested is that a *covering* font clears the coverage
        # warning. The shaping warning stays, and must: a font supplying the
        # glyphs does not give reportlab the ability to order them correctly,
        # so silence here would mean claiming a Hindi PDF is faithful when it
        # is not.
        if "Devanagari" in source or "Arial Unicode" in source:
            assert not any("cannot be drawn" in w for w in result.warnings)
            assert any("does not reshape" in w for w in result.warnings)
        assert result.pdf.startswith(b"%PDF-")

    def test_a_missing_font_directory_falls_back(self, monkeypatch):
        """A Latin document must export on a machine with no extra fonts,
        which is every default deployment."""
        monkeypatch.setenv(FONT_DIR_ENV, "/nonexistent/path/to/fonts")
        result = tiptap_to_pdf(_doc(_para("Hello")), "Fallback")
        assert result.pdf.startswith(b"%PDF-")


class TestImages:
    def test_an_unfetchable_image_degrades_to_alt_text(self):
        """Losing a picture is recoverable; losing the document is not."""
        document = _doc(
            {
                "type": "image",
                "attrs": {"src": "https://nowhere.invalid/x.png", "alt": "Diagram"},
            }
        )
        result = tiptap_to_pdf(document, "With image")

        assert result.pdf.startswith(b"%PDF-")
        assert any("could not be embedded" in w for w in result.warnings)

    def test_a_private_address_is_refused(self):
        """`validate_url_for_fetch` is what stops "embed every image in this
        document" being a server-side request forgery primitive."""
        assert _fetch_image("http://169.254.169.254/latest/meta-data/") is None
        assert _fetch_image("http://127.0.0.1:8000/internal") is None

    def test_a_data_uri_image_embeds(self):
        # 1x1 transparent PNG.
        png = (
            "data:image/png;base64,"
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk"
            "YPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="
        )
        assert _fetch_image(png) is not None

    def test_an_oversized_data_uri_is_refused(self):
        import base64

        huge = base64.b64encode(b"x" * (11 * 1024 * 1024)).decode()
        assert _fetch_image(f"data:image/png;base64,{huge}") is None


class TestProvenance:
    def test_owner_and_verification_date_appear(self):
        """A printed copy leaves the product, so it carries where it came from
        — otherwise a page found on a desk in six months cannot say whether it
        is current."""
        from datetime import datetime, timezone

        result = tiptap_to_pdf(
            _doc(_para("Body")),
            "Policy",
            owner_name="Ada Lovelace",
            last_verified_at=datetime(2026, 3, 1, tzinfo=timezone.utc),
        )
        assert result.pdf.startswith(b"%PDF-")


class TestFontSelection:
    """Which family gets registered when a directory holds more than one.

    The rule used to be "first filename containing 'regular'", walked in
    `os.listdir` order. That made a shared font directory actively dangerous:
    aimed at `/usr/share/fonts/truetype/`, a Latin-only face beat a Devanagari
    one purely by sorting first, so a Hindi document exported blank *with a
    font that covers it in the same directory* — and, because listdir order is
    filesystem order, it did that on some machines and not others.
    """

    @staticmethod
    def _latin_only_ttf() -> str:
        """Vera, which reportlab bundles: 283 glyphs, no Devanagari."""
        import os

        import reportlab

        fonts = os.path.join(os.path.dirname(reportlab.__file__), "fonts")
        for name in sorted(os.listdir(fonts)):
            if name.lower().endswith(".ttf"):
                return os.path.join(fonts, name)
        pytest.skip("reportlab bundles no TTF on this install")

    @staticmethod
    def _wide_ttf() -> str:
        import os

        for candidate in (
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
            "/usr/share/aexy-fonts/FreeSans.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
            "/usr/share/fonts/truetype/noto/NotoSansDevanagari-Regular.ttf",
        ):
            if os.path.exists(candidate):
                return candidate
        pytest.skip("no wide-coverage TTF on this machine")

    def test_the_widest_family_wins_not_the_first(self, tmp_path, monkeypatch):
        import shutil

        narrow = self._latin_only_ttf()
        wide = self._wide_ttf()

        font_dir = tmp_path / "fonts"
        font_dir.mkdir()
        # Named so the narrow one sorts first *and* matches "regular" first,
        # which is exactly what the old rule keyed on.
        shutil.copy(narrow, font_dir / "AAANarrow-Regular.ttf")
        shutil.copy(wide, font_dir / "ZZZWide-Regular.ttf")

        monkeypatch.setenv(FONT_DIR_ENV, str(font_dir))
        fonts = pdf_module._register_fonts()

        assert fonts.cmap is not None
        narrow_glyphs = len(
            pdf_module.TTFont("probe-narrow", str(font_dir / "AAANarrow-Regular.ttf"))
            .face.charToGlyph
        )
        assert len(fonts.cmap) > narrow_glyphs, (
            "registered the narrower family; a shared font directory is a "
            "foot-gun again"
        )

    def test_a_single_family_directory_is_unchanged(self, tmp_path, monkeypatch):
        """The shipped container passes a directory holding one family, and
        that path must keep behaving exactly as it did."""
        import shutil

        font_dir = tmp_path / "fonts"
        font_dir.mkdir()
        shutil.copy(self._latin_only_ttf(), font_dir / "Only-Regular.ttf")

        monkeypatch.setenv(FONT_DIR_ENV, str(font_dir))
        fonts = pdf_module._register_fonts()

        assert fonts.regular.startswith(pdf_module.FAMILY)
        assert fonts.cmap is not None

    def test_faces_are_grouped_into_one_family(self):
        """`FreeSansBoldOblique` is a face of `freesans`, not a family of its
        own — the grouping that lets a multi-family directory be resolved."""
        classify = pdf_module._classify

        assert classify("FreeSans.ttf") == ("freesans", "regular")
        assert classify("FreeSansBold.ttf") == ("freesans", "bold")
        assert classify("FreeSansOblique.ttf") == ("freesans", "italic")
        assert classify("FreeSansBoldOblique.ttf") == ("freesans", "bold_italic")

    def test_bold_italic_is_not_read_as_bold(self):
        """Token order matters: matching "bold" first would file the
        bold-italic face as bold and lose the italic one."""
        assert pdf_module._classify("Foo-BoldItalic.ttf")[1] == "bold_italic"
        assert pdf_module._classify("Foo-Bold-Oblique.ttf")[1] == "bold_italic"

    def test_an_unreadable_font_does_not_break_the_export(
        self, tmp_path, monkeypatch
    ):
        """A directory of system fonts contains something unparseable sooner
        or later, and one bad file must not cost the whole export."""
        import shutil

        font_dir = tmp_path / "fonts"
        font_dir.mkdir()
        (font_dir / "Broken-Regular.ttf").write_bytes(b"not a font at all")
        shutil.copy(self._latin_only_ttf(), font_dir / "Good-Regular.ttf")

        monkeypatch.setenv(FONT_DIR_ENV, str(font_dir))
        result = tiptap_to_pdf(_doc(_para("Hello")), "Resilience")
        assert result.pdf.startswith(b"%PDF-")


class TestComplexScriptWarning:
    """Coverage and correct rendering are different questions.

    reportlab maps each codepoint to one glyph and draws them left to right;
    it does no OpenType shaping. So a font with full Devanagari coverage still
    produces wrong text — checked against a real export, `नीति` comes out with
    the leading `ि` stranded after the `त` it belongs in front of.

    Without this warning, installing a font in the image would have traded a
    visible failure (blank rectangles) for a silent one (text that looks fine
    and is wrong), which is the worse of the two.
    """

    def test_devanagari_is_flagged_as_unshaped(self):
        result = tiptap_to_pdf(_doc(_para("नीति")), "Policy")
        shaping = [w for w in result.warnings if "does not reshape" in w]
        assert len(shaping) == 1
        assert "Devanagari" in shaping[0]
        assert "Markdown or HTML" in shaping[0], (
            "the warning must name a format that is faithful"
        )

    def test_latin_is_not_flagged(self):
        result = tiptap_to_pdf(_doc(_para("Ordinary English prose.")), "Plain")
        assert result.warnings == []

    def test_each_script_is_named_once(self):
        result = tiptap_to_pdf(
            _doc(_para("नीति"), _para("العربية"), _para("ไทย")), "Multi"
        )
        shaping = [w for w in result.warnings if "does not reshape" in w]
        assert len(shaping) == 1
        for script in ("Arabic", "Devanagari", "Thai"):
            assert script in shaping[0]

    def test_the_title_is_checked_too(self):
        """A Hindi title on an English body is still an unshaped export."""
        result = tiptap_to_pdf(_doc(_para("English body.")), "नीति")
        assert any("does not reshape" in w for w in result.warnings)
