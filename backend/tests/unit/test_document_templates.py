"""System document templates: a code catalogue, not seeded rows.

`document_templates` was empty in every workspace — nothing ever wrote a system
template — so the picker had nothing to show and was never wired up. The set now
lives in `document_templates_catalog` and is merged in at read time, which means
the seam worth pinning is where a `sys:` id has to behave like a row: creating a
document from one, and forking one into a workspace's own editable copy.
"""

import uuid

import pytest

from aexy.models.developer import Developer
from aexy.models.documentation import DocumentTemplate
from aexy.schemas.document import TemplateListResponse
from aexy.services.document_service import DocumentService
from aexy.services.document_templates_catalog import (
    SYSTEM_TEMPLATES,
    _empty_text_nodes,
    get_system_template,
    is_system_template_id,
    p,
    table,
)
from tests.conftest import requires_postgres, seed_workspace

pytestmark = pytest.mark.asyncio

# `DocumentTemplate.variables` is `ARRAY(String)`, which SQLite cannot bind — so
# the tests that have to *write* a template row only run against Postgres. The
# behaviour that matters on every run (a `sys:` id resolving, its content reaching
# a new document, the values a fork would carry) is covered without a write.


async def _developer(db, name="Ada") -> str:
    """Through the ORM — see the note in test_document_comments._developer."""
    developer = Developer(id=str(uuid.uuid4()), name=name)
    db.add(developer)
    await db.flush()
    return str(developer.id)


def test_every_template_is_usable_content():
    """The catalogue validates at import, so this pins what "valid" has to mean."""
    for template in SYSTEM_TEMPLATES:
        assert template.id.startswith("sys:")
        assert template.content["type"] == "doc"
        # A template whose body is empty is a blank page with extra steps. Blank
        # is the one deliberate exception and still carries its empty paragraph.
        assert template.content["content"], template.slug
        assert template.prompt.strip(), template.slug


def test_no_template_contains_an_empty_text_node():
    """ProseMirror forbids these, and its failure mode is silence.

    A `{"type": "text", "text": ""}` anywhere at any depth makes TipTap reject
    the *entire* document: it warns to the browser console and renders an empty
    editor. Nothing throws, no request fails, and every test here passed — five
    of the nine templates shipped blank, and only opening one in a browser showed
    it. They came from `p("")`, which is simply how a blank table cell reads.

    So the rule is asserted directly rather than trusted to the builders: it
    holds however a future template is written.
    """
    for template in SYSTEM_TEMPLATES:
        empty = _empty_text_nodes(template.content)
        assert not empty, (
            f"{template.slug} would render as a blank document; "
            f"empty text nodes at {empty}"
        )


def test_a_blank_table_cell_is_an_empty_paragraph_not_an_empty_text_node():
    """The specific shape that broke it, pinned at the builder."""
    assert p("") == {"type": "paragraph"}
    assert p() == {"type": "paragraph"}
    # And a real string still becomes a text node, or this "fix" would be a mute.
    assert p("Owner")["content"] == [{"type": "text", "text": "Owner"}]
    # `table` builds its body rows entirely out of blank cells, which is exactly
    # how every affected template got there.
    built = table(["Measure", "Today"], rows=2)
    assert not _empty_text_nodes(built)
    body_cell = built["content"][1]["content"][0]
    assert body_cell["content"] == [{"type": "paragraph"}]


def test_every_catalogue_category_survives_the_response_schema():
    """The list endpoint's category type is a separate hand-written copy.

    `TemplateCategory` exists three times — the model enum, the Pydantic Literal
    here, and a TypeScript union in the frontend — and they are only kept in step
    by hand. Adding "general" to the enum was not enough: the Literal rejected it
    and `GET /templates` 500ed on the whole list, which no unit test that happened
    to pick a `guides` template would have noticed.
    """
    for template in SYSTEM_TEMPLATES:
        response = TemplateListResponse(
            id=template.id,
            name=template.name,
            description=template.description,
            category=template.category.value,
            icon=template.icon,
            is_system=True,
            variables=list(template.variables),
        )
        assert response.category == template.category.value


def test_system_ids_are_distinguishable_from_row_ids():
    assert is_system_template_id("sys:prd")
    assert not is_system_template_id(str(uuid.uuid4()))
    assert not is_system_template_id(None)


def test_the_ids_the_frontend_hardcodes_still_exist():
    """These ids are a contract that no type checker spans.

    `frontend/src/components/docs/templateIds.ts` names them, because the empty
    state has to filter out "Blank" — offering an empty page as the way out of an
    empty page. Renaming a slug here would leave that filter matching nothing and
    quietly put Blank back in the list, so it fails here instead.
    """
    ids = {template.id for template in SYSTEM_TEMPLATES}
    assert "sys:blank" in ids, "BLANK_TEMPLATE_ID in templateIds.ts points at nothing"
    assert all(template.id.startswith("sys:") for template in SYSTEM_TEMPLATES)


@requires_postgres
async def test_listing_merges_the_catalogue_with_the_workspaces_own(db_session):
    workspace_id = await seed_workspace(db_session)
    owner = await _developer(db_session)
    service = DocumentService(db_session)

    own = await service.create_template(
        workspace_id=workspace_id,
        created_by_id=owner,
        name="Our incident review",
        category="general",
        content_template={"type": "doc", "content": [{"type": "paragraph"}]},
        prompt_template="…",
        variables=[],
    )

    listed = await service.list_templates(workspace_id=workspace_id)
    ids = [str(t.id) for t in listed]

    assert "sys:prd" in ids, "system templates come from the catalogue"
    assert str(own.id) in ids, "and the workspace's own rows are still listed"
    # Catalogue order first, Blank leading — picker order is authored, not alphabetical.
    assert ids[0] == "sys:blank"
    # Excluding system templates leaves only the row.
    only_own = await service.list_templates(
        workspace_id=workspace_id, include_system=False
    )
    assert [str(t.id) for t in only_own] == [str(own.id)]


async def test_listing_without_a_workspace_returns_the_catalogue_only(db_session):
    listed = await DocumentService(db_session).list_templates()
    assert [str(t.id) for t in listed] == [t.id for t in SYSTEM_TEMPLATES]


async def test_a_system_template_resolves_without_being_a_row(db_session):
    service = DocumentService(db_session)

    resolved = await service.get_template("sys:runbook")

    assert resolved is not None
    assert resolved.name == "Runbook"
    assert resolved.is_system is True
    assert resolved.workspace_id is None
    # Never persisted: the catalogue is the source of truth, and a row would let
    # the two drift.
    assert resolved not in db_session.new
    assert await service.get_template("sys:does-not-exist") is None


async def test_creating_a_document_from_a_system_template_carries_its_content(db_session):
    workspace_id = await seed_workspace(db_session)
    owner = await _developer(db_session)
    service = DocumentService(db_session)

    document = await service.create_document(
        workspace_id=workspace_id,
        created_by_id=owner,
        title="Payments runbook",
        template_id="sys:runbook",
    )

    expected = get_system_template("sys:runbook")
    assert document.content == expected.content
    # The icon rides along, which is what makes the tree readable at a glance.
    assert document.icon == expected.icon
    headings = [
        node["content"][0]["text"]
        for node in document.content["content"]
        if node["type"] == "heading"
    ]
    assert "Escalation" in headings


async def test_a_blank_document_still_works(db_session):
    """No template id at all must stay the cheap path it was."""
    workspace_id = await seed_workspace(db_session)
    owner = await _developer(db_session)

    document = await DocumentService(db_session).create_document(
        workspace_id=workspace_id, created_by_id=owner, title="Untitled"
    )

    assert document.content == {"type": "doc", "content": []}


async def test_forking_a_system_template_carries_its_content(db_session, monkeypatch):
    """The authoring on-ramp: customise a system template rather than start over.

    Asserted on the values handed to ``create_template`` rather than on the row it
    writes, so this runs on SQLite too — the row itself is checked below.
    """
    service = DocumentService(db_session)
    captured: dict = {}

    async def spy(**kwargs):
        captured.update(kwargs)
        return DocumentTemplate(id=str(uuid.uuid4()), **kwargs)

    monkeypatch.setattr(service, "create_template", spy)

    await service.duplicate_template(
        template_id="sys:postmortem",
        workspace_id="workspace-1",
        duplicated_by_id="dev-1",
    )

    origin = get_system_template("sys:postmortem")
    assert captured["content_template"] == origin.content
    assert captured["prompt_template"] == origin.prompt
    assert captured["category"] == origin.category.value
    # Named as a copy so it does not read as the system one in the picker.
    assert captured["name"] == "Postmortem (Custom)"
    assert captured["workspace_id"] == "workspace-1"


async def test_a_system_template_cannot_be_edited_or_retired(db_session):
    """It ships with the code, so there is no row to change.

    Refused before any query — a `sys:` id must not be able to match a row, and
    saying "not found" is the honest answer rather than silently doing nothing.
    """
    service = DocumentService(db_session)

    assert await service.update_workspace_template("sys:prd", "workspace-1", {"name": "Mine"}) is None
    assert await service.delete_workspace_template("sys:prd", "workspace-1") is False
    # Still there and unchanged.
    assert (await service.get_template("sys:prd")).name == "Product requirements"


@requires_postgres
async def test_renaming_and_retiring_a_workspace_template(db_session):
    workspace_id = await seed_workspace(db_session)
    owner = await _developer(db_session)
    service = DocumentService(db_session)
    template = await service.create_template(
        workspace_id=workspace_id,
        created_by_id=owner,
        name="Draft name",
        category="general",
        content_template={"type": "doc", "content": [{"type": "paragraph"}]},
        prompt_template="…",
        variables=[],
    )

    renamed = await service.update_workspace_template(
        str(template.id), workspace_id, {"name": "Incident review"}
    )
    assert renamed is not None and renamed.name == "Incident review"

    # Another workspace's id must not reach it — scoped in the query, so this is
    # indistinguishable from the template not existing.
    assert await service.update_workspace_template(
        str(template.id), str(uuid.uuid4()), {"name": "Hijacked"}
    ) is None

    assert await service.delete_workspace_template(str(template.id), workspace_id) is True
    # Deactivated, not deleted: recoverable, and already filtered from listings.
    listed = await service.list_templates(workspace_id=workspace_id, include_system=False)
    assert [str(t.id) for t in listed] == []
    assert (await db_session.get(DocumentTemplate, template.id)).is_active is False


@requires_postgres
async def test_a_fork_is_a_real_editable_row(db_session):
    workspace_id = await seed_workspace(db_session)
    owner = await _developer(db_session)
    service = DocumentService(db_session)

    fork = await service.duplicate_template(
        template_id="sys:postmortem",
        workspace_id=workspace_id,
        duplicated_by_id=owner,
    )

    assert fork is not None
    # A real row this time — editable, workspace-scoped, and no longer "system".
    assert fork.is_system is False
    assert str(fork.workspace_id) == workspace_id
    assert fork.content_template == get_system_template("sys:postmortem").content
    assert isinstance(await db_session.get(DocumentTemplate, fork.id), DocumentTemplate)
