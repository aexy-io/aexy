"""Five AI paths that never ran, and the switch that keeps them off.

Each of these call sites raised on every invocation for its entire existence —
`commit_analyzer` passed `prompt=`/`provider=` to a `call_llm` that has never had
either, and the four predictive analyses passed a `system_prompt=` keyword
`analyze` has never had. Both were swallowed, so nothing ran and nothing said so.

Repairing the calls is not the same decision as starting to bill for five
analyses nobody has seen run, so they ship dormant. What these tests protect is
that the gate does not become the original bug in a nicer costume: it refuses by
name, it says why, and the page reports it instead of hiding it.
"""

from __future__ import annotations

import pytest

from aexy.llm.features import (
    AI_FEATURES,
    DORMANT_FEATURES,
    FEATURES_BY_ID,
    enabled_dormant,
    is_dormant,
)
from aexy.llm.gateway import AIFeatureDormant, _refuse_if_dormant

# The five, named here so a sixth cannot be added without a deliberate edit.
EXPECTED_DORMANT = {
    "code.commit_message",
    "insights.attrition_risk",
    "insights.burnout_risk",
    "insights.performance_trajectory",
    "insights.team_health",
}


@pytest.fixture
def switch(monkeypatch):
    """Set AI_ENABLE_DORMANT_FEATURES for one test."""

    def build(value: str):
        import types

        from aexy.core import config

        settings = types.SimpleNamespace(
            llm=types.SimpleNamespace(ai_enable_dormant_features=value)
        )
        monkeypatch.setattr(config, "get_settings", lambda: settings)

    return build


class TestTheDormantSet:
    def test_exactly_the_five_repaired_paths_are_dormant(self) -> None:
        assert DORMANT_FEATURES == EXPECTED_DORMANT

    def test_each_one_says_why(self) -> None:
        # The reason is shown to an admin, so it has to explain the history
        # rather than just assert the state.
        for feature_id in DORMANT_FEATURES:
            reason = FEATURES_BY_ID[feature_id].dormant_reason
            assert reason and len(reason) > 60, feature_id
            assert "never ran" in reason, feature_id

    def test_nothing_else_is_dormant(self) -> None:
        others = [f.id for f in AI_FEATURES if f.dormant_reason and f.id not in EXPECTED_DORMANT]
        assert others == []


class TestTheSwitch:
    def test_off_by_default(self, switch) -> None:
        switch("")
        assert enabled_dormant() == frozenset()
        for feature_id in EXPECTED_DORMANT:
            assert is_dormant(feature_id) is not None

    def test_one_feature_can_be_enabled_alone(self, switch) -> None:
        switch("insights.team_health")
        assert is_dormant("insights.team_health") is None
        # And only that one.
        assert is_dormant("insights.attrition_risk") is not None

    def test_several_can_be_enabled(self, switch) -> None:
        switch("insights.team_health, insights.burnout_risk")
        assert is_dormant("insights.team_health") is None
        assert is_dormant("insights.burnout_risk") is None
        assert is_dormant("code.commit_message") is not None

    def test_all_enables_everything(self, switch) -> None:
        switch("all")
        assert enabled_dormant() == DORMANT_FEATURES
        for feature_id in EXPECTED_DORMANT:
            assert is_dormant(feature_id) is None

    def test_an_unknown_id_is_warned_about_not_silently_dropped(
        self, switch, caplog
    ) -> None:
        # Somebody who typed an id to switch something on deserves to know it did
        # nothing — a silently ignored switch is the same failure class as a
        # silently dead dropdown.
        switch("insights.team_health,docs.docx_edit,nonsense")
        with caplog.at_level("WARNING"):
            enabled = enabled_dormant()
        assert enabled == frozenset({"insights.team_health"})
        assert "docs.docx_edit" in caplog.text
        assert "nonsense" in caplog.text

    def test_a_feature_that_was_never_dormant_is_unaffected(self, switch) -> None:
        switch("")
        assert is_dormant("docs.docx_edit") is None
        assert is_dormant("agents.ask") is None

    def test_no_feature_at_all_is_not_dormant(self, switch) -> None:
        # A call site that has not named itself yet still has to work.
        switch("")
        assert is_dormant(None) is None


class TestTheRefusal:
    def test_a_dormant_feature_is_refused_by_name(self, switch) -> None:
        switch("")
        with pytest.raises(AIFeatureDormant) as caught:
            _refuse_if_dormant("insights.attrition_risk")
        assert caught.value.feature == "insights.attrition_risk"

    def test_the_refusal_names_the_switch_that_lifts_it(self, switch) -> None:
        # An operator reading this in a log should not have to go and find the
        # env var themselves.
        switch("")
        with pytest.raises(AIFeatureDormant) as caught:
            _refuse_if_dormant("code.commit_message")
        message = str(caught.value)
        assert "AI_ENABLE_DORMANT_FEATURES=code.commit_message" in message
        assert "never ran" in message

    def test_an_enabled_feature_passes_through(self, switch) -> None:
        switch("all")
        _refuse_if_dormant("insights.team_health")

    def test_a_live_feature_passes_through(self, switch) -> None:
        switch("")
        _refuse_if_dormant("docs.docx_edit")

    def test_it_is_not_confused_with_the_other_two_refusals(self) -> None:
        # Three different reasons AI might not run, three types: the workspace
        # switched it off, nobody configured a credential, or the feature is off
        # by policy. Collapsing them would make the logs useless.
        from aexy.llm.resolution import LLMNotConfigured
        from aexy.services.workspace_ai_settings_service import AIDisabledError

        assert not issubclass(AIFeatureDormant, AIDisabledError)
        assert not issubclass(AIFeatureDormant, LLMNotConfigured)


class TestTheGatewayEntryPoints:
    async def test_call_llm_refuses_before_spending_anything(
        self, switch, monkeypatch
    ) -> None:
        switch("")
        from aexy.llm.gateway import LLMGateway

        def _never(*_args, **_kwargs):
            raise AssertionError("resolution reached for a dormant feature")

        gateway = LLMGateway(provider=object())
        monkeypatch.setattr(LLMGateway, "_resolve_provider", _never)

        with pytest.raises(AIFeatureDormant):
            await gateway.call_llm(
                system_prompt="s",
                user_prompt="u",
                feature="code.commit_message",
            )

    async def test_analyze_refuses_before_reading_the_cache(
        self, switch, monkeypatch
    ) -> None:
        # Before the cache, so a dormant feature cannot serve an answer some
        # earlier run left behind.
        switch("")
        from aexy.llm.base import AnalysisRequest, AnalysisType
        from aexy.llm.gateway import LLMGateway

        class _Cache:
            async def get(self, _key):
                raise AssertionError("cache read for a dormant feature")

        gateway = LLMGateway(provider=object(), cache=_Cache())

        with pytest.raises(AIFeatureDormant):
            await gateway.analyze(
                AnalysisRequest(content="x", analysis_type=AnalysisType.CODE),
                feature="insights.team_health",
            )


class TestHowEachCallSiteDegrades:
    """Two different right answers, because the two callers differ.

    `commit_analyzer` has a non-AI path to fall back to, so it degrades and says
    so. The predictive analyses have nothing honest to return — a fabricated risk
    score would be worse than an error — so they surface as a 503 naming the
    switch.
    """

    async def test_commit_analysis_falls_back_and_logs_why(
        self, switch, caplog, monkeypatch
    ) -> None:
        switch("")
        from aexy.services import commit_analyzer as module

        class _Commit:
            message = "fix: correct the off-by-one in the paginator"
            sha = "abc123"
            additions = 3
            deletions = 1
            files_changed = 1
            languages = ["python"]

        service = module.CommitAnalyzer.__new__(module.CommitAnalyzer)

        # A real LLMGateway, because the gate lives inside its `call_llm` — a
        # stub would bypass the very thing under test. The provider is a bare
        # object: the refusal happens before anything touches it, which is also
        # what proves nothing was spent.
        from aexy.llm.gateway import LLMGateway

        monkeypatch.setattr(
            "aexy.llm.gateway.get_llm_gateway",
            lambda: LLMGateway(provider=object()),
        )

        with caplog.at_level("INFO"):
            result = await service._analyze_with_llm(_Commit())

        assert result is None
        # Info, not warning: this is the configured state, not a fault. And it
        # says so at all, which the original swallow did not.
        assert "switched off" in caplog.text
        assert "AI_ENABLE_DORMANT_FEATURES" in caplog.text

    async def test_a_dormant_feature_surfaces_as_503_naming_the_switch(
        self,
    ) -> None:
        # The four predictive analyses have no handler of their own, so without
        # this an unhandled RuntimeError would be a 500 — indistinguishable from
        # a crash, when the truth is "switched off on purpose".
        #
        # Exercises the handler actually registered on the app, not a copy.
        import json

        from aexy.llm.gateway import AIFeatureDormant
        from aexy.main import app

        handler = app.exception_handlers[AIFeatureDormant]
        response = await handler(
            None,
            AIFeatureDormant("insights.team_health", "This never ran because X."),
        )

        assert response.status_code == 503
        body = json.loads(response.body)
        assert body["feature"] == "insights.team_health"
        assert body["reason"] == "This never ran because X."
        # The operator should not have to go looking for the variable name.
        assert body["enable_with"] == (
            "AI_ENABLE_DORMANT_FEATURES=insights.team_health"
        )
