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
        # warning.
        if "Devanagari" in source or "Arial Unicode" in source:
            assert not any("cannot be drawn" in w for w in result.warnings)

            # Whether anything is left depends on shaping, and both answers are
            # correct. A font supplying the glyphs does not by itself let
            # reportlab order them, so without HarfBuzz the export still has to
            # say so; with it, the text is right and silence is the honest
            # result.
            if pdf_module._register_fonts().shaped:
                assert result.warnings == [], result.warnings
            else:
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


class TestShaping:
    """Correct glyph order for scripts that reorder or join.

    reportlab maps one codepoint to one glyph and draws left to right unless
    HarfBuzz is wired in, so `नीति` came out with the leading `ि` stranded
    after the `त` it belongs in front of, `छुट्टी` with its conjunct broken
    open, and Arabic unjoined *and* in left-to-right order.

    Two switches, both required and neither on by default:
    `ParagraphStyle.shaping` (ships as 0) and `TTFont.shapable` (True, but
    reads False until `uharfbuzz` is importable). Installing the package and
    stopping there changes nothing — the bytes come out identical, which is a
    slow way to learn the flag exists. These tests pin both halves.
    """

    @staticmethod
    def _shapable_font_dir(tmp_path):
        import os
        import shutil

        for candidate in (
            "/usr/share/aexy-fonts/FreeSans.ttf",
            "/usr/share/fonts/truetype/freefont/FreeSans.ttf",
            "/System/Library/Fonts/Supplemental/Arial Unicode.ttf",
        ):
            if os.path.exists(candidate):
                break
        else:
            pytest.skip("no TTF available to shape with")

        font_dir = tmp_path / "fonts"
        font_dir.mkdir()
        shutil.copy(candidate, font_dir / "Shaper-Regular.ttf")
        return font_dir

    def test_a_ttf_is_marked_shapable_when_uharfbuzz_is_present(
        self, tmp_path, monkeypatch
    ):
        pytest.importorskip("uharfbuzz")
        monkeypatch.setenv(FONT_DIR_ENV, str(self._shapable_font_dir(tmp_path)))

        assert pdf_module._register_fonts().shaped is True

    def test_the_builtin_fallback_is_not_shapable(self, monkeypatch):
        """Helvetica is a Type1 with no outlines to reshape, so the flag must
        stay off rather than asking reportlab to shape something it cannot."""
        monkeypatch.setenv(FONT_DIR_ENV, "/nonexistent/path/to/fonts")

        assert pdf_module._register_fonts().shaped is False

    def test_the_style_carries_the_flag_and_children_inherit_it(
        self, tmp_path, monkeypatch
    ):
        """`shaping` on the body style is the only place it is set; every other
        style picks it up through `parent=body`. If that inheritance ever
        stops, headings and table cells silently go back to unshaped."""
        pytest.importorskip("uharfbuzz")
        monkeypatch.setenv(FONT_DIR_ENV, str(self._shapable_font_dir(tmp_path)))

        renderer = pdf_module._Renderer("t", pdf_module._register_fonts())
        for name in ("body", "title", "h1", "h2", "h3", "cell", "quote", "toc"):
            assert renderer.styles[name].shaping == 1, name

    def test_no_shaping_flag_without_a_shapable_font(self, monkeypatch):
        monkeypatch.setenv(FONT_DIR_ENV, "/nonexistent/path/to/fonts")

        renderer = pdf_module._Renderer("t", pdf_module._register_fonts())
        assert renderer.styles["body"].shaping == 0

    def test_shaped_output_is_not_the_unshaped_output(self, tmp_path, monkeypatch):
        """The end of it: same document, same font, different bytes.

        Byte-identical output is exactly what installing uharfbuzz without
        setting `shaping` produces, so this is the assertion that would have
        caught that.
        """
        pytest.importorskip("uharfbuzz")
        monkeypatch.setenv(FONT_DIR_ENV, str(self._shapable_font_dir(tmp_path)))
        document = _doc(_para("छुट्टी की नीति"))

        shaped = tiptap_to_pdf(document, "Policy")

        monkeypatch.setattr(pdf_module, "_fonts", None)
        real_load = pdf_module._load_family
        monkeypatch.setattr(
            pdf_module,
            "_load_family",
            lambda d: (
                None
                if (f := real_load(d)) is None
                else pdf_module.replace(f, shaped=False)
            ),
        )
        unshaped = tiptap_to_pdf(document, "Policy")

        assert shaped.pdf != unshaped.pdf, "shaping made no difference to the output"

    def test_shaping_silences_the_unshaped_warning(self, tmp_path, monkeypatch):
        """With HarfBuzz these scripts come out correct — verified against real
        exports for Devanagari, Arabic and Hebrew, ordering included — so the
        warning must go, or readers learn to ignore one that is usually wrong.
        """
        pytest.importorskip("uharfbuzz")
        monkeypatch.setenv(FONT_DIR_ENV, str(self._shapable_font_dir(tmp_path)))

        result = tiptap_to_pdf(_doc(_para("छुट्टी की नीति")), "नीति")

        assert not any("does not reshape" in w for w in result.warnings), (
            result.warnings
        )

    def test_a_shaping_failure_falls_back_instead_of_losing_the_document(
        self, tmp_path, monkeypatch
    ):
        """reportlab's shaped path is its newest and it is not bulletproof: a
        paragraph of Devanagari written as HTML numeric entities crashes it
        with an IndexError from `textobject.setRise`. Nothing here emits those,
        but a shaping bug should cost correct glyph order — which the unshaped
        build already gives — not the whole export.
        """
        pytest.importorskip("uharfbuzz")
        monkeypatch.setenv(FONT_DIR_ENV, str(self._shapable_font_dir(tmp_path)))

        calls = {"n": 0}
        real_build = pdf_module._build_pdf

        def flaky(*args, **kwargs):
            calls["n"] += 1
            if kwargs["fonts"].shaped:
                raise IndexError("list index out of range")
            return real_build(*args, **kwargs)

        monkeypatch.setattr(pdf_module, "_build_pdf", flaky)
        result = tiptap_to_pdf(_doc(_para("छुट्टी की नीति")), "नीति")

        assert calls["n"] == 2, "the unshaped retry did not happen"
        assert result.pdf.startswith(b"%PDF-")
        assert any("could not be text-shaped" in w for w in result.warnings)

    def test_a_genuine_failure_still_raises(self, monkeypatch):
        """With no shapable font there is nothing to fall back to, so an error
        is the document's own and must not be swallowed."""
        monkeypatch.setenv(FONT_DIR_ENV, "/nonexistent/path/to/fonts")

        def broken(*args, **kwargs):
            raise ValueError("something is genuinely wrong")

        monkeypatch.setattr(pdf_module, "_build_pdf", broken)
        with pytest.raises(ValueError):
            tiptap_to_pdf(_doc(_para("Hello")), "Boom")

    def test_the_renderer_never_emits_numeric_entities(self):
        """The input that crashes reportlab's shaper. `_inline` escapes with
        `html.escape`, which touches only `& < > "` — if that is ever swapped
        for something that emits `&#NNNN;`, the export starts crashing on
        exactly the documents shaping was added for.
        """
        import re

        markup = pdf_module._inline(
            [{"type": "text", "text": 'छुट्टी <b>&amp;</b> "quoted"'}]
        )
        assert not re.search(r"&#\d+;", markup), markup

    def test_shaping_reorders_and_reverses_the_glyphs_it_draws(
        self, tmp_path, monkeypatch
    ):
        """The point of the whole change, asserted on glyph order rather than
        on "the bytes differ".

        `नीति` is *stored* न ी त ि, and the `ि` has to be *drawn* in front of
        the त it belongs to; Hebrew has to come out right to left. The oracle
        is reportlab's own shaping call, the one the paragraph path makes.

        Only script-level behaviour is asserted. HarfBuzz reorders pre-base
        vowel signs and reverses RTL runs whatever the font carries, while the
        conjunct in `छुट्टी` and the lam-alef ligature in `سلام` need GSUB
        rules the shipped face may not have — asserting those would pass here
        on Arial Unicode and fail in the image on FreeSans.
        """
        pytest.importorskip("uharfbuzz")
        from reportlab.pdfbase.ttfonts import shapeStr

        monkeypatch.setenv(FONT_DIR_ENV, str(self._shapable_font_dir(tmp_path)))
        face = pdf_module._register_fonts().regular

        # Escapes, not literals: the expected values are strings in *visual*
        # order, and an editor or a terminal that helpfully reorders bidi text
        # would rewrite the assertion into the thing it is meant to catch.
        niti = "\u0928\u0940\u0924\u093f"  # न ी त ि, as typed
        niti_drawn = "\u0928\u0940\u093f\u0924"  # ...ि ahead of त, as drawn
        shalom = "\u05e9\u05dc\u05d5\u05dd"
        shalom_drawn = shalom[::-1]

        assert str(shapeStr(niti, face, 11)) == niti_drawn
        assert str(shapeStr(shalom, face, 11)) == shalom_drawn
