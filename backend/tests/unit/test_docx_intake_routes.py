"""The two intake endpoints, over HTTP.

`test_docx_intake_service.py` covers the reading and the refusals. What only a
route test can hold is the contract *at the boundary*:

  - a refusal written for a person arrives as that sentence, not as a 500;
  - the candidates that get created are the ones in the request body, not a
    fresh model run — the whole point of the two-step design is that a person
    approved a specific list;
  - `preview` writes nothing, which is the promise the split exists to keep.

No test in this repo had overridden `get_current_developer` before, so the
fixtures below establish that: the router sits behind `require_app_access("docs")`
whose guard is a closure created at mount time and therefore not addressable by
`dependency_overrides` — so its two module-level checks are stubbed instead.
"""

from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from aexy.api import access_guard
from aexy.api.developers import get_current_developer
from aexy.core.database import get_db
from aexy.main import app
from aexy.services import docx_intake_service as intake

WORKSPACE = "11111111-1111-1111-1111-111111111111"
DOCUMENT = "22222222-2222-2222-2222-222222222222"
DEVELOPER = "33333333-3333-3333-3333-333333333333"
BASE = f"/api/v1/workspaces/{WORKSPACE}/docx-ai/documents/{DOCUMENT}"


class _Developer:
    id = DEVELOPER
    name = "Priya"
    email = "priya@example.com"


@pytest.fixture
def api(db_session, monkeypatch):
    """An authenticated client whose app-access guard is satisfied.

    The guard is mounted on the router as a closure, so it cannot be reached
    through `dependency_overrides`. Its two checks are module-level functions,
    which can be.
    """

    async def _ok(*_args, **_kwargs):
        return None

    monkeypatch.setattr(access_guard, "ensure_app_enabled", _ok)
    monkeypatch.setattr(access_guard, "ensure_member_app_access", _ok)

    async def _db():
        yield db_session

    app.dependency_overrides[get_db] = _db
    app.dependency_overrides[get_current_developer] = lambda: _Developer()

    transport = ASGITransport(app=app)
    yield AsyncClient(transport=transport, base_url="http://test")

    app.dependency_overrides.clear()


@pytest.fixture
def member(monkeypatch):
    """The caller is a workspace member."""

    async def _yes(self, workspace_id, developer_id, role):
        return True

    monkeypatch.setattr(
        "aexy.services.workspace_service.WorkspaceService.check_permission", _yes
    )


@pytest.fixture
def outsider(monkeypatch):
    async def _no(self, workspace_id, developer_id, role):
        return False

    monkeypatch.setattr(
        "aexy.services.workspace_service.WorkspaceService.check_permission", _no
    )


def _candidate(title: str = "Add rate limiting", **kw) -> dict:
    return {
        "title": title,
        "detail": kw.get("detail", "Section 4 says so"),
        "source": kw.get("source", "markers"),
        "kind": kw.get("kind", "action"),
        "origin": kw.get("origin", "paragraph 12"),
        "comment_id": kw.get("comment_id"),
        "paragraph_index": kw.get("paragraph_index", 12),
        "as_a": kw.get("as_a"),
        "i_want": kw.get("i_want"),
        "so_that": kw.get("so_that"),
    }


class TestPreview:
    async def test_it_returns_what_was_found(self, api, member, monkeypatch) -> None:
        async def _preview(self, document_id, sources, requested_by_id=None):
            return [
                intake.Candidate(
                    title="Add rate limiting",
                    detail="Section 4 says so",
                    source="markers",
                    origin="paragraph 12",
                    paragraph_index=12,
                )
            ]

        monkeypatch.setattr(intake.DocxIntakeService, "preview", _preview)

        async with api as client:
            response = await client.post(
                f"{BASE}/intake/preview", json={"sources": ["markers"]}
            )

        assert response.status_code == 200
        [found] = response.json()["candidates"]
        assert found["title"] == "Add rate limiting"
        # The origin is part of the contract, not decoration: it is what tells a
        # reader how much to trust the row.
        assert found["source"] == "markers"
        assert found["origin"] == "paragraph 12"

    async def test_the_chosen_sources_reach_the_service(
        self, api, member, monkeypatch
    ) -> None:
        # Both pickers belong to the run. If the route dropped or reordered them,
        # a person asking for comments only would silently get a model call.
        seen: list = []

        async def _preview(self, document_id, sources, requested_by_id=None):
            seen.append((document_id, sources, requested_by_id))
            return []

        monkeypatch.setattr(intake.DocxIntakeService, "preview", _preview)

        async with api as client:
            await client.post(
                f"{BASE}/intake/preview", json={"sources": ["comments", "model"]}
            )

        assert seen == [(DOCUMENT, ("comments", "model"), DEVELOPER)]

    async def test_an_empty_result_is_a_200_not_an_error(
        self, api, member, monkeypatch
    ) -> None:
        # A document with no work in it is a normal document.
        async def _preview(self, document_id, sources, requested_by_id=None):
            return []

        monkeypatch.setattr(intake.DocxIntakeService, "preview", _preview)

        async with api as client:
            response = await client.post(
                f"{BASE}/intake/preview", json={"sources": ["markers"]}
            )

        assert response.status_code == 200
        assert response.json()["candidates"] == []

    async def test_a_refusal_arrives_as_its_own_sentence(
        self, api, member, monkeypatch
    ) -> None:
        # Every message on this path is written for a person to read. A 500 with
        # a stack trace would waste that.
        async def _preview(self, document_id, sources, requested_by_id=None):
            raise intake.DocxIntakeError("That document no longer exists.")

        monkeypatch.setattr(intake.DocxIntakeService, "preview", _preview)

        async with api as client:
            response = await client.post(
                f"{BASE}/intake/preview", json={"sources": ["markers"]}
            )

        assert response.status_code == 422
        assert response.json()["detail"] == "That document no longer exists."

    async def test_no_source_is_refused_by_the_schema(self, api, member) -> None:
        # Before the service, and before any document is read.
        async with api as client:
            response = await client.post(f"{BASE}/intake/preview", json={"sources": []})
        assert response.status_code == 422

    async def test_an_outsider_is_refused(self, api, outsider, monkeypatch) -> None:
        async def _never(self, *_a, **_k):
            raise AssertionError("the document was read for a non-member")

        monkeypatch.setattr(intake.DocxIntakeService, "preview", _never)

        async with api as client:
            response = await client.post(
                f"{BASE}/intake/preview", json={"sources": ["markers"]}
            )
        assert response.status_code == 403
        assert "permission" in response.json()["detail"].lower()


class TestCreate:
    async def test_it_creates_and_reports_what_it_made(
        self, api, member, monkeypatch
    ) -> None:
        async def _create(self, document_id, target, candidates, options, created_by_id=None):
            return [{"id": "b1", "title": candidates[0].title, "key": "BUG-001"}]

        monkeypatch.setattr(intake.DocxIntakeService, "create", _create)

        async with api as client:
            response = await client.post(
                f"{BASE}/intake",
                json={"target": "bug", "candidates": [_candidate()]},
            )

        assert response.status_code == 201
        body = response.json()
        assert body["target"] == "bug"
        # The key is returned so the caller can link to the row it just made.
        assert body["created"] == [
            {"id": "b1", "title": "Add rate limiting", "key": "BUG-001"}
        ]

    async def test_the_approved_list_is_what_gets_created(
        self, api, member, monkeypatch
    ) -> None:
        # The contract the two-step design exists for. The candidates come from
        # the request body, so a second model run cannot quietly substitute a
        # different list than the one a person approved.
        seen: list = []

        async def _create(self, document_id, target, candidates, options, created_by_id=None):
            seen.append(candidates)
            return []

        monkeypatch.setattr(intake.DocxIntakeService, "create", _create)

        async with api as client:
            await client.post(
                f"{BASE}/intake",
                json={
                    "target": "bug",
                    "candidates": [
                        _candidate("Keep this one"),
                        _candidate("And this one", source="comments", comment_id="7"),
                    ],
                },
            )

        [passed] = seen
        assert [c.title for c in passed] == ["Keep this one", "And this one"]
        # Provenance survives the round trip, so the created row can be traced
        # back to the comment that produced it.
        assert passed[1].source == "comments"
        assert passed[1].comment_id == "7"

    async def test_the_target_context_is_passed_through(
        self, api, member, monkeypatch
    ) -> None:
        seen: list = []

        async def _create(self, document_id, target, candidates, options, created_by_id=None):
            seen.append((target, options))
            return []

        monkeypatch.setattr(intake.DocxIntakeService, "create", _create)

        async with api as client:
            await client.post(
                f"{BASE}/intake",
                json={
                    "target": "sprint_task",
                    "candidates": [_candidate()],
                    "sprint_id": "sprint-9",
                    "labels": ["from-contract"],
                    "assignee_id": "dev-2",
                },
            )

        target, options = seen[0]
        assert target == "sprint_task"
        assert options.sprint_id == "sprint-9"
        assert options.labels == ["from-contract"]
        assert options.assignee_id == "dev-2"

    async def test_a_missing_sprint_is_refused_with_the_reason(
        self, api, member, monkeypatch
    ) -> None:
        # A task with no sprint is a row that exists and belongs nowhere, and the
        # picker relies on getting the sentence back to say so.
        async def _create(self, *_a, **_k):
            raise intake.DocxIntakeError(
                "Choose a sprint for these tasks to go into."
            )

        monkeypatch.setattr(intake.DocxIntakeService, "create", _create)

        async with api as client:
            response = await client.post(
                f"{BASE}/intake",
                json={"target": "sprint_task", "candidates": [_candidate()]},
            )

        assert response.status_code == 422
        assert "Choose a sprint" in response.json()["detail"]

    async def test_a_missing_form_is_refused_with_the_reason(
        self, api, member, monkeypatch
    ) -> None:
        async def _create(self, *_a, **_k):
            raise intake.DocxIntakeError("Choose a ticket form.")

        monkeypatch.setattr(intake.DocxIntakeService, "create", _create)

        async with api as client:
            response = await client.post(
                f"{BASE}/intake",
                json={"target": "ticket", "candidates": [_candidate()]},
            )

        assert response.status_code == 422
        assert "ticket form" in response.json()["detail"]

    async def test_an_unknown_target_never_reaches_the_service(
        self, api, member, monkeypatch
    ) -> None:
        async def _never(self, *_a, **_k):
            raise AssertionError("an unknown target reached the service")

        monkeypatch.setattr(intake.DocxIntakeService, "create", _never)

        async with api as client:
            response = await client.post(
                f"{BASE}/intake",
                json={"target": "postcard", "candidates": [_candidate()]},
            )
        assert response.status_code == 422

    async def test_creating_nothing_is_refused_by_the_schema(
        self, api, member
    ) -> None:
        async with api as client:
            response = await client.post(
                f"{BASE}/intake", json={"target": "bug", "candidates": []}
            )
        assert response.status_code == 422

    async def test_a_batch_larger_than_the_cap_is_refused(
        self, api, member
    ) -> None:
        # A hundred rows is already more than anyone reviews in one sitting;
        # accepting a thousand would be accepting that nobody read them.
        async with api as client:
            response = await client.post(
                f"{BASE}/intake",
                json={
                    "target": "bug",
                    "candidates": [_candidate(f"Issue {i}") for i in range(101)],
                },
            )
        assert response.status_code == 422

    async def test_an_outsider_creates_nothing(
        self, api, outsider, monkeypatch
    ) -> None:
        async def _never(self, *_a, **_k):
            raise AssertionError("a non-member created issues")

        monkeypatch.setattr(intake.DocxIntakeService, "create", _never)

        async with api as client:
            response = await client.post(
                f"{BASE}/intake",
                json={"target": "bug", "candidates": [_candidate()]},
            )
        assert response.status_code == 403
        assert "permission" in response.json()["detail"].lower()


class TestPreviewWritesNothing:
    async def test_preview_creates_no_issues(self, api, member, monkeypatch) -> None:
        """The promise the two-step split exists to keep.

        Asserted by making `create` a landmine rather than by counting rows: a
        row count would pass just as well against a preview that wrote to a table
        this test does not know about.
        """

        async def _preview(self, document_id, sources, requested_by_id=None):
            return [intake.Candidate(title="Add rate limiting", source="markers")]

        async def _never(self, *_a, **_k):
            raise AssertionError("preview created issues")

        monkeypatch.setattr(intake.DocxIntakeService, "preview", _preview)
        monkeypatch.setattr(intake.DocxIntakeService, "create", _never)

        async with api as client:
            response = await client.post(
                f"{BASE}/intake/preview", json={"sources": ["markers"]}
            )
        assert response.status_code == 200


class TestStoryPersona:
    """A story needs somebody it is for, and the panel needs to be told when.

    The service refuses rather than writing a placeholder. That refusal is only
    useful if it reaches the client as its own sentence with a 422 — a 500 would
    leave the panel unable to ask the question that fixes it.
    """

    async def test_a_parsed_story_survives_the_round_trip(
        self, api, member, monkeypatch
    ) -> None:
        # A document written as "As a …, I want …" must not be asked who it is
        # for, which means the parts have to arrive intact.
        seen: list = []

        async def _create(self, document_id, target, candidates, options, created_by_id=None):
            seen.append((candidates, options))
            return []

        monkeypatch.setattr(intake.DocxIntakeService, "create", _create)

        async with api as client:
            await client.post(
                f"{BASE}/intake",
                json={
                    "target": "user_story",
                    "candidates": [
                        _candidate(
                            "Export the ledger",
                            as_a="finance manager",
                            i_want="export the ledger",
                            so_that="I can reconcile",
                        )
                    ],
                },
            )

        candidates, _options = seen[0]
        assert candidates[0].as_a == "finance manager"
        assert candidates[0].so_that == "I can reconcile"

    async def test_the_persona_reaches_the_service(
        self, api, member, monkeypatch
    ) -> None:
        seen: list = []

        async def _create(self, document_id, target, candidates, options, created_by_id=None):
            seen.append(options)
            return []

        monkeypatch.setattr(intake.DocxIntakeService, "create", _create)

        async with api as client:
            await client.post(
                f"{BASE}/intake",
                json={
                    "target": "user_story",
                    "candidates": [_candidate()],
                    "default_persona": "finance manager",
                },
            )

        assert seen[0].default_persona == "finance manager"

    async def test_the_refusal_arrives_as_a_422_the_panel_can_act_on(
        self, api, member, monkeypatch
    ) -> None:
        async def _create(self, *_a, **_k):
            raise intake.DocxIntakeError(
                '1 of these do not say who they are for — for example '
                '"Support CSV export". Say who the stories are for.'
            )

        monkeypatch.setattr(intake.DocxIntakeService, "create", _create)

        async with api as client:
            response = await client.post(
                f"{BASE}/intake",
                json={"target": "user_story", "candidates": [_candidate()]},
            )

        assert response.status_code == 422
        detail = response.json()["detail"]
        assert "who they are for" in detail
        # It names one, so the person can find it rather than hunting a count.
        assert "Support CSV export" in detail
