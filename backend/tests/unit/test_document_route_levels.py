"""Every document route has a deliberate access floor.

This file exists because of a mistake made while fixing the original one.

`guard_document_route` was added as a router-level dependency so that a route
which forgets to check access still fails closed — and it did, at **VIEW**. An
audit of the router afterwards found nine write endpoints relying on that
default: creating and deleting code links, GitHub sync setup, export and
import, AI generation, applying a suggestion, approving a proposed edit, and
`PUT /{id}/docx`, which overwrites a Word document's bytes. All of them were
gated at read level. Better than the nothing they had before, and still wrong.

So the floor now comes from the HTTP method — a write needs EDIT unless it is a
listed exception — and this test enumerates the routes so the next endpoint is
a decision rather than a default nobody looked at.

It asserts three things:

1. every `{document_id}` route resolves to a floor;
2. no write sits below EDIT unless it is in `_WRITE_LEVEL_EXCEPTIONS`, which
   carries a written reason for each;
3. the exceptions table has no stale entries — a path that no longer exists
   would be a silent hole if a route were later added at that path.
"""

import pytest

from aexy.api.documents import (
    _WRITE_LEVEL_EXCEPTIONS,
    _WRITE_METHODS,
    minimum_for_route,
    normalise_route_path,
)
from aexy.main import app
from aexy.services.document_access import AccessLevel

DOCUMENT_PREFIX = "/workspaces/{workspace_id}/documents"


def _document_routes() -> list[tuple[str, str, str]]:
    """(method, path, endpoint name) for every route naming a document.

    Read off the live app rather than a hand-kept list, so a router mounted
    later is covered without anyone remembering to add it here.
    """
    found: list[tuple[str, str, str]] = []
    for route in app.routes:
        path = getattr(route, "path", "")
        methods = getattr(route, "methods", None)
        if not methods or "{document_id}" not in path:
            continue
        if DOCUMENT_PREFIX not in path:
            continue
        name = getattr(route, "name", "?")
        for method in methods:
            if method in ("HEAD", "OPTIONS"):
                continue
            found.append((method, path, name))
    return sorted(found)


def test_there_are_document_routes_to_check():
    """A guard against the test silently passing because it found nothing."""
    routes = _document_routes()
    assert len(routes) > 20, f"only found {len(routes)} document routes"


@pytest.mark.parametrize("method,path,name", _document_routes())
def test_every_route_has_a_floor(method, path, name):
    level = minimum_for_route(method, path)
    assert isinstance(level, AccessLevel)


@pytest.mark.parametrize("method,path,name", _document_routes())
def test_no_write_sits_below_edit_by_accident(method, path, name):
    """The rule the original guard got wrong.

    A write below EDIT is allowed, but only as an entry in
    `_WRITE_LEVEL_EXCEPTIONS` — which is a place somebody had to type a reason.
    """
    if method not in _WRITE_METHODS:
        return

    level = minimum_for_route(method, path)
    if level >= AccessLevel.EDIT:
        return

    assert normalise_route_path(path) in _WRITE_LEVEL_EXCEPTIONS, (
        f"{method} {path} ({name}) is a write gated at {level.name}, and is not "
        "a declared exception. Either it needs EDIT, or add it to "
        "_WRITE_LEVEL_EXCEPTIONS with the reason it needs less."
    )


def test_the_exceptions_table_has_no_stale_entries():
    """A path that no longer exists is a hole waiting for a route to be added
    at it — the entry would silently lower the floor for something nobody
    considered."""
    live = {normalise_route_path(path) for _method, path, _name in _document_routes()}
    stale = set(_WRITE_LEVEL_EXCEPTIONS) - live
    assert not stale, f"exceptions for routes that no longer exist: {sorted(stale)}"


def test_reads_are_view():
    for method, path, _name in _document_routes():
        if method in _WRITE_METHODS:
            continue
        assert minimum_for_route(method, path) == AccessLevel.VIEW, path


def test_the_word_document_write_needs_edit():
    """Named explicitly because it is the one this audit was worth doing for:
    a VIEW-only collaborator could replace a Word document's bytes, and a
    binary overwrite is the change nobody can diff afterwards."""
    assert (
        minimum_for_route("PUT", f"{DOCUMENT_PREFIX}/{{document_id}}/docx")
        >= AccessLevel.EDIT
    )
