"""Guidance that is earned, not printed.

"Remember to update the docs" is advice nobody needs and everybody mutes. Every
rule here needs two signals — one from the change, one from the page — and the
tests that matter most are the negative ones: a Python-only pull request against
a page full of screenshots must say nothing about screenshots, and a UI pull
request against a page with no images must say nothing either.

A rule that fires on one signal is indistinguishable from a static checklist,
and a static checklist is the thing this feature exists instead of.
"""

from __future__ import annotations

import pytest

from aexy.services.document_impact_service import (
    MAX_IMAGE_SPOTS,
    classify_paths,
    derive_guidance,
    document_signals,
    route_for_path,
    summarise_images,
)


def doc(*nodes) -> dict:
    return {"type": "doc", "content": list(nodes)}


def heading(text: str, level: int = 2) -> dict:
    return {
        "type": "heading",
        "attrs": {"level": level},
        "content": [{"type": "text", "text": text}],
    }


def image(src: str, alt: str | None = None) -> dict:
    return {"type": "image", "attrs": {"src": src, "alt": alt}}


def para(text: str = "words") -> dict:
    return {"type": "paragraph", "content": [{"type": "text", "text": text}]}


def code(text: str = "GET /things") -> dict:
    return {"type": "codeBlock", "content": [{"type": "text", "text": text}]}


UI_PATHS = ["frontend/src/components/tickets/FilterBar.tsx"]
PY_PATHS = ["backend/src/aexy/services/ticket_service.py"]


class TestCountingScreenshots:
    def test_a_page_with_no_images(self):
        assert summarise_images(doc(para(), heading("Setup"))) == {
            "count": 0,
            "spots": [],
        }

    def test_none_and_empty_are_not_errors(self):
        """Reached for every affected document, including ones never written to."""
        assert summarise_images(None)["count"] == 0
        assert summarise_images({})["count"] == 0

    def test_it_names_the_heading_each_image_sits_under(self):
        summary = summarise_images(
            doc(
                heading("Creating a filter"),
                image("https://cdn.example.com/img/filter-bar.png"),
                heading("Saved views"),
                image("https://cdn.example.com/img/saved-views.png"),
            )
        )
        assert summary["count"] == 2
        assert summary["spots"] == [
            {"heading": "Creating a filter", "label": "filter-bar.png"},
            {"heading": "Saved views", "label": "saved-views.png"},
        ]

    def test_an_image_before_any_heading_has_none(self):
        """Rather than inventing one. The client renders a shorter line."""
        summary = summarise_images(doc(image("a/hero.png"), heading("Later")))
        assert summary["spots"] == [{"heading": None, "label": "hero.png"}]

    def test_an_image_inside_a_paragraph_is_found(self):
        """TipTap images are inline nodes as often as block ones."""
        summary = summarise_images(
            doc(heading("Inline"), {"type": "paragraph", "content": [image("x/y.png")]})
        )
        assert summary["count"] == 1
        assert summary["spots"][0]["heading"] == "Inline"

    def test_a_query_string_is_not_part_of_the_name(self):
        summary = summarise_images(doc(image("/files/shot.png?v=3&w=800#top")))
        assert summary["spots"][0]["label"] == "shot.png"

    def test_an_escaped_name_is_readable(self):
        summary = summarise_images(doc(image("/files/ticket%20list.png")))
        assert summary["spots"][0]["label"] == "ticket list.png"

    def test_a_data_uri_falls_back_to_alt_then_to_nothing(self):
        """A data URI has no filename. Returning None rather than an English
        placeholder keeps the payload translatable — the client owns that word."""
        with_alt = summarise_images(doc(image("data:image/png;base64,AAA", alt="The grid")))
        assert with_alt["spots"][0]["label"] == "The grid"

        without = summarise_images(doc(image("data:image/png;base64,AAA")))
        assert without["count"] == 1
        assert without["spots"][0]["label"] is None

    def test_the_count_is_complete_even_when_the_spots_are_capped(self):
        """Somebody reading "and 14 more" has the point; the count must still
        be true, because it is what the notification body says."""
        content = doc(heading("Many"), *[image(f"/i/{n}.png") for n in range(10)])
        summary = summarise_images(content)
        assert summary["count"] == 10
        assert len(summary["spots"]) == MAX_IMAGE_SPOTS


class TestTheRouteAScreenshotShows:
    @pytest.mark.parametrize(
        "path,expected",
        [
            ("frontend/src/app/(app)/docs/page.tsx", "/docs"),
            ("frontend/src/app/(app)/docs/[documentId]/page.tsx", "/docs/:documentId"),
            ("app/page.tsx", "/"),
            ("frontend/src/app/(app)/settings/repositories/page.tsx",
             "/settings/repositories"),
            ("frontend/src/app/blog/[...slug]/page.tsx", "/blog/*"),
            ("frontend/src/app/shop/[[...filters]]/page.tsx", "/shop/*"),
            ("frontend/src/app/(app)/@modal/photo/page.tsx", "/photo"),
        ],
    )
    def test_a_page_file_is_its_route(self, path, expected):
        assert route_for_path(path) == expected

    @pytest.mark.parametrize(
        "path",
        [
            # An endpoint, not a screen.
            "frontend/src/app/api/things/route.ts",
            # A component. Which routes it appears on needs an import graph that
            # does not exist, and a confidently wrong route is worse than none.
            "frontend/src/components/tickets/FilterBar.tsx",
            # The Pages Router is not handled. Narrow beats nearly right.
            "frontend/src/pages/docs.tsx",
            # No app/ ancestor at all.
            "some/other/page.tsx",
            "",
        ],
    )
    def test_everything_else_declines_to_guess(self, path):
        assert route_for_path(path) is None

    def test_a_backend_directory_called_app_cannot_produce_a_route(self):
        """The guard that keeps this from firing on repositories that are not
        Next.js at all: only a `page.*` file qualifies."""
        assert route_for_path("backend/app/main.py") is None
        assert route_for_path("backend/app/views/page.py") is None


class TestClassifyingPaths:
    @pytest.mark.parametrize(
        "path",
        [
            "frontend/src/components/tickets/FilterBar.tsx",
            "frontend/src/app/(app)/docs/page.tsx",
            "web/views/Thing.vue",
            "src/Thing.svelte",
            # A stylesheet changes what a screenshot looks like as surely as
            # markup does.
            "frontend/src/styles/tickets.css",
        ],
    )
    def test_ui(self, path):
        assert "ui" in classify_paths([path])

    @pytest.mark.parametrize(
        "path",
        [
            "backend/src/aexy/api/documents.py",
            "backend/src/aexy/schemas/document.py",
            "server/things_router.py",
            "frontend/src/app/api/things/route.ts",
        ],
    )
    def test_api(self, path):
        assert "api" in classify_paths([path])

    @pytest.mark.parametrize(
        "path",
        [
            "docker-compose.yml",
            "docker-compose.override.yaml",
            "Dockerfile",
            "backend/src/aexy/core/settings.py",
            "infra/main.tf",
            "nginx/default.conf",
        ],
    )
    def test_config(self, path):
        assert "config" in classify_paths([path])

    def test_an_ordinary_service_file_is_none_of_them(self):
        assert classify_paths(["backend/src/aexy/services/ticket_service.py"]) == set()

    @pytest.mark.parametrize(
        "path",
        [
            # The case that shipped wrong. `components` is a UI directory, so the
            # directory clause claimed a Python file as a UI change and fired the
            # screenshot guidance on a backend-only pull request. Every unit test
            # missed it because they all put their Python under `backend/`, where
            # no UI directory appears — it took seeding a real pull request.
            "frontend/src/components/tickets/service_helpers.py",
            "web/app/scripts/generate.py",
            "src/pages/README.md",
            "app/components/schema.sql",
            "frontend/src/app/deploy.sh",
        ],
    )
    def test_living_under_a_ui_directory_is_not_enough(self, path):
        assert "ui" not in classify_paths([path])

    @pytest.mark.parametrize(
        "path",
        [
            # The reason the directory clause exists at all: a hook or a helper
            # that shapes a screen and has no front-end extension to prove it.
            "frontend/src/components/tickets/useFilters.ts",
            "frontend/src/app/(app)/tickets/helpers.js",
        ],
    )
    def test_but_front_end_code_there_still_counts(self, path):
        assert "ui" in classify_paths([path])

    def test_blank_and_missing_paths_do_not_crash(self):
        assert classify_paths(["", "   ", None]) == set()


class TestDocumentSignals:
    def test_it_finds_what_a_change_could_invalidate(self):
        signals = document_signals(
            doc(heading("Installation"), code(), image("/a.png"))
        )
        assert signals == {"setup_heading", "code_blocks", "images"}

    def test_setup_must_be_a_heading_not_a_passing_mention(self):
        """A page that says "we use Docker" in a paragraph is not a page whose
        setup steps a compose change invalidates."""
        assert document_signals(doc(para("We use Docker in development."))) == set()
        assert "setup_heading" in document_signals(doc(heading("Getting started")))


class TestGuidanceIsEarned:
    def test_a_ui_change_against_a_page_with_screenshots(self):
        """The case the whole feature exists for."""
        content = doc(
            heading("Creating a filter"),
            image("/i/filter-bar.png"),
            image("/i/filter-chip.png"),
        )
        guidance = derive_guidance(matched_paths=UI_PATHS, content=content)

        assert [g["id"] for g in guidance] == ["screenshots"]
        assert guidance[0]["params"]["count"] == 2
        assert guidance[0]["params"]["headings"] == ["Creating a filter"]
        assert guidance[0]["params"]["labels"] == ["filter-bar.png", "filter-chip.png"]

    def test_a_python_only_change_against_that_same_page_says_nothing(self):
        """**The test that proves the guidance is earned.** The page is
        unchanged; only the kind of change is different, and the screenshot line
        must disappear entirely. A rule that fired here would be a checklist."""
        content = doc(heading("Creating a filter"), image("/i/filter-bar.png"))
        assert derive_guidance(matched_paths=PY_PATHS, content=content) == []

    def test_a_ui_change_against_a_page_with_no_images_says_nothing(self):
        """The converse, and the reason there is no "consider adding
        screenshots" line: an unsolicited suggestion is the first thing to be
        muted."""
        content = doc(heading("Filtering"), para("Prose only."))
        assert derive_guidance(matched_paths=UI_PATHS, content=content) == []

    def test_being_a_guide_does_not_excuse_the_missing_ui_signal(self):
        """"A guide's screenshots are its point" is true and still not enough.

        `template_category` is a fact about the *document*, so letting it satisfy
        the *change-side* half of the conjunction collapses the rule — every guide
        with an image then gets the screenshot line for a backend-only change,
        which is the generic reminder this module exists instead of.

        Having images is already the document-side signal. The category cannot be
        both halves.
        """
        content = doc(heading("Walkthrough"), image("/i/step-1.png"))
        assert (
            derive_guidance(
                matched_paths=PY_PATHS, content=content, template_category="guides"
            )
            == []
        )

    def test_a_guide_with_a_ui_change_still_earns_it(self):
        content = doc(heading("Walkthrough"), image("/i/step-1.png"))
        guidance = derive_guidance(
            matched_paths=UI_PATHS, content=content, template_category="guides"
        )
        assert [g["id"] for g in guidance] == ["screenshots"]

    def test_the_route_is_a_sub_line_of_the_screenshots_never_alone(self):
        content = doc(heading("The list"), image("/i/list.png"))
        guidance = derive_guidance(
            matched_paths=["frontend/src/app/(app)/tickets/page.tsx"], content=content
        )
        assert [g["id"] for g in guidance] == ["screenshots", "route"]
        assert guidance[1]["params"]["routes"] == ["/tickets"]

    def test_no_screenshots_means_no_route_either(self):
        """On its own, "your change touched /tickets" tells the author nothing
        they did not already know — they wrote it."""
        content = doc(heading("The list"), para("No images here."))
        assert derive_guidance(
            matched_paths=["frontend/src/app/(app)/tickets/page.tsx"], content=content
        ) == []

    def test_api_paths_need_a_page_that_shows_a_shape(self):
        api = ["backend/src/aexy/api/documents.py"]
        with_code = doc(heading("Endpoints"), code("POST /documents"))
        prose_only = doc(heading("Endpoints"), para("We have some endpoints."))

        assert [g["id"] for g in derive_guidance(matched_paths=api, content=with_code)] == [
            "apiSurface"
        ]
        # Without a code block or an explicit api_docs category this would fire
        # on every page that happens to sit over `api/`.
        assert derive_guidance(matched_paths=api, content=prose_only) == []

    def test_an_api_reference_qualifies_by_declaration(self):
        api = ["backend/src/aexy/api/documents.py"]
        prose_only = doc(heading("Endpoints"), para("Prose."))
        guidance = derive_guidance(
            matched_paths=api, content=prose_only, template_category="api_docs"
        )
        assert [g["id"] for g in guidance] == ["apiSurface"]
        assert guidance[0]["params"]["paths"] == api

    def test_setup_needs_both_a_config_change_and_setup_steps(self):
        config = ["docker-compose.yml"]
        with_steps = doc(heading("Getting started"), para("Run compose."))
        without = doc(heading("Architecture"), para("Boxes and arrows."))

        assert [
            g["id"] for g in derive_guidance(matched_paths=config, content=with_steps)
        ] == ["setup"]
        assert derive_guidance(matched_paths=config, content=without) == []

    def test_several_rules_can_fire_and_the_order_is_fixed(self):
        content = doc(
            heading("Getting started"),
            code("docker compose up"),
            heading("The screen"),
            image("/i/home.png"),
        )
        guidance = derive_guidance(
            matched_paths=[
                "frontend/src/app/(app)/home/page.tsx",
                "backend/src/aexy/api/things.py",
                "docker-compose.yml",
            ],
            content=content,
        )
        assert [g["id"] for g in guidance] == [
            "screenshots",
            "route",
            "apiSurface",
            "setup",
        ]

    def test_guidance_carries_no_prose(self):
        """Ids and params only. The one thing that keeps this translatable —
        `/review`'s server-rendered group headings are why that page cannot be."""
        content = doc(heading("Creating a filter"), image("/i/filter-bar.png"))
        for entry in derive_guidance(matched_paths=UI_PATHS, content=content):
            assert set(entry) == {"id", "params"}
            assert entry["id"].isidentifier()
