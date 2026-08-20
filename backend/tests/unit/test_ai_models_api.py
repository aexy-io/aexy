"""The model configuration endpoint, and the two bugs that only showed up live.

The first is why `session` exists on `_overrides_for`. A write endpoint flushes
and then re-reads to return the fresh page — but `_overrides_for` opens its own
session by default (deliberately, so the runtime path never autoflushes a
caller's transaction mid-analysis). A separate transaction cannot see an
uncommitted flush, so the response described the state *before* the save. On
screen that is a picker that visibly does nothing.

The second is the provider recorded next to the model. Without it a stored choice
silently becomes wrong when an admin switches provider, and the failure lands
hours later as somebody else's 404 inside a background job.
"""

from __future__ import annotations

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.llm import resolution as res
from aexy.llm.base import LLMConfig
from aexy.models.ai_model_override import OverrideScope, WorkspaceAIModelOverride

WORKSPACE = "11111111-1111-1111-1111-111111111111"


class _WorkspaceAI:
    enabled = True
    config = None
    allow_platform_fallback = False


@pytest.fixture(autouse=True)
def platform_only(monkeypatch):
    """A workspace with AI on, no credential of its own, on a known platform model."""
    monkeypatch.setattr(
        res,
        "platform_config",
        lambda: LLMConfig(provider="claude", model="platform-model", api_key="k"),
    )

    async def _ws(_workspace_id: str):
        return _WorkspaceAI()

    monkeypatch.setattr(res, "_workspace_ai_config", _ws)


class TestReadingAnUncommittedWrite:
    async def test_a_flushed_override_is_visible_on_the_same_session(
        self, db_session: AsyncSession
    ) -> None:
        # The regression. Flush without commit, exactly as the PUT endpoint does,
        # then resolve through the caller's session.
        db_session.add(
            WorkspaceAIModelOverride(
                workspace_id=WORKSPACE,
                scope=OverrideScope.CATEGORY,
                key="documentation",
                model="big-model",
                provider="claude",
            )
        )
        await db_session.flush()

        batch = await res.resolve_many(
            WORKSPACE, ["docs.docx_edit"], session=db_session
        )
        answer = batch.features["docs.docx_edit"]
        assert answer.model == "big-model"
        assert answer.source == "category"

    async def test_without_the_session_the_uncommitted_write_is_invisible(
        self, db_session: AsyncSession
    ) -> None:
        # The other half, stated so the reason `session` exists cannot be
        # refactored away by accident: the default really is a separate
        # transaction, which is correct for the runtime path and wrong for a
        # write endpoint's response.
        db_session.add(
            WorkspaceAIModelOverride(
                workspace_id=WORKSPACE,
                scope=OverrideScope.CATEGORY,
                key="documentation",
                model="big-model",
                provider="claude",
            )
        )
        await db_session.flush()

        batch = await res.resolve_many(WORKSPACE, ["docs.docx_edit"])
        assert batch.features["docs.docx_edit"].model == "platform-model"

    async def test_a_deleted_override_stops_applying_immediately(
        self, db_session: AsyncSession
    ) -> None:
        # Reset has to fall back, not keep the value it was showing. Before the
        # fix this returned the pre-delete state.
        row = WorkspaceAIModelOverride(
            workspace_id=WORKSPACE,
            scope=OverrideScope.FEATURE,
            key="docs.docx_edit",
            model="contract-model",
            provider="claude",
        )
        db_session.add(row)
        await db_session.flush()

        await db_session.delete(row)
        await db_session.flush()

        batch = await res.resolve_many(
            WORKSPACE, ["docs.docx_edit"], session=db_session
        )
        assert batch.features["docs.docx_edit"].model == "platform-model"
        assert batch.features["docs.docx_edit"].source == "platform"


class TestPrecedenceThroughTheBatchPath:
    async def test_a_feature_override_beats_its_category(
        self, db_session: AsyncSession
    ) -> None:
        for scope, key, model in (
            (OverrideScope.CATEGORY, "documentation", "big-model"),
            (OverrideScope.FEATURE, "docs.docx_edit", "contract-model"),
        ):
            db_session.add(
                WorkspaceAIModelOverride(
                    workspace_id=WORKSPACE,
                    scope=scope,
                    key=key,
                    model=model,
                    provider="claude",
                )
            )
        await db_session.flush()

        batch = await res.resolve_many(
            WORKSPACE,
            ["docs.docx_edit", "docs.generate"],
            session=db_session,
        )
        assert batch.features["docs.docx_edit"].model == "contract-model"
        assert batch.features["docs.docx_edit"].source == "feature"
        # Its sibling keeps following the category.
        assert batch.features["docs.generate"].model == "big-model"
        assert batch.features["docs.generate"].source == "category"

    async def test_the_default_is_reported_even_when_features_override_it(
        self, db_session: AsyncSession
    ) -> None:
        # `BatchResolution.default` exists because a feature carrying an override
        # hides the base it overrode, and the page has to show both.
        db_session.add(
            WorkspaceAIModelOverride(
                workspace_id=WORKSPACE,
                scope=OverrideScope.CATEGORY,
                key="documentation",
                model="big-model",
                provider="claude",
            )
        )
        await db_session.flush()

        batch = await res.resolve_many(
            WORKSPACE, ["docs.docx_edit"], session=db_session
        )
        assert batch.default.model == "platform-model"
        assert batch.features["docs.docx_edit"].model == "big-model"


class TestProviderMismatch:
    async def test_an_override_for_another_provider_is_ignored_and_explained(
        self, db_session: AsyncSession
    ) -> None:
        db_session.add(
            WorkspaceAIModelOverride(
                workspace_id=WORKSPACE,
                scope=OverrideScope.CATEGORY,
                key="documentation",
                model="gemini-x",
                provider="gemini",  # the workspace runs claude
            )
        )
        await db_session.flush()

        answer = (
            await res.resolve_many(
                WORKSPACE, ["docs.docx_edit"], session=db_session
            )
        ).features["docs.docx_edit"]

        assert answer.model == "platform-model"
        assert answer.source == "platform"
        assert answer.ignored_override is not None
        assert "gemini-x" in answer.ignored_override
        assert "claude" in answer.ignored_override
