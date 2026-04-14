"""Unit tests for DeepSeekProvider (mocked HTTP)."""

import pytest
import httpx

from aexy.llm.base import (
    AnalysisRequest,
    AnalysisType,
    LLMAPIError,
    LLMConfig,
    LLMRateLimitError,
)
from aexy.llm.deepseek_provider import DeepSeekProvider


def _make_provider(fallback: list[str] | None = None) -> DeepSeekProvider:
    config = LLMConfig(
        provider="deepseek",
        model="deepseek-chat",
        api_key="test-key",
        max_tokens=1024,
        temperature=0.0,
        fallback_models=fallback or [],
    )
    return DeepSeekProvider(config)


def _mock_transport(handler):
    """Build an httpx transport that routes requests to `handler`."""
    return httpx.MockTransport(handler)


def _patch_client(provider: DeepSeekProvider, handler) -> None:
    """Replace the provider's AsyncClient with one backed by MockTransport."""
    provider._client = httpx.AsyncClient(
        base_url=provider.DEEPSEEK_API_URL,
        headers=dict(provider._client.headers),
        transport=_mock_transport(handler),
        timeout=provider.config.timeout,
    )


class TestConstructor:
    def test_requires_api_key(self):
        with pytest.raises(ValueError, match="API key is required"):
            DeepSeekProvider(
                LLMConfig(provider="deepseek", model="deepseek-chat", api_key="")
            )

    def test_provider_and_model_name(self):
        p = _make_provider()
        assert p.provider_name == "deepseek"
        assert p.model_name == "deepseek-chat"

    def test_strips_primary_from_fallback(self):
        p = _make_provider(fallback=["deepseek-chat", "deepseek-reasoner"])
        # primary should not appear in fallback list
        assert "deepseek-chat" not in p._fallback_models
        assert p._fallback_models == ["deepseek-reasoner"]


class TestCallModel:
    @pytest.mark.asyncio
    async def test_request_shape_and_response_parsing(self):
        captured: dict = {}

        def handler(request: httpx.Request) -> httpx.Response:
            captured["url"] = str(request.url)
            captured["auth"] = request.headers.get("authorization")
            import json as _json
            captured["body"] = _json.loads(request.content)
            return httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": "hi there"}}],
                    "usage": {"prompt_tokens": 12, "completion_tokens": 3},
                },
            )

        p = _make_provider()
        _patch_client(p, handler)

        text, total, in_tok, out_tok = await p._call_model(
            "deepseek-chat", "sys", "user"
        )

        assert text == "hi there"
        assert in_tok == 12
        assert out_tok == 3
        assert total == 15
        assert captured["url"].endswith("/chat/completions")
        assert captured["auth"] == "Bearer test-key"
        assert captured["body"]["model"] == "deepseek-chat"
        assert captured["body"]["stream"] is False
        assert captured["body"]["messages"] == [
            {"role": "system", "content": "sys"},
            {"role": "user", "content": "user"},
        ]

    @pytest.mark.asyncio
    async def test_429_raises_rate_limit_error_with_retry_after(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(429, headers={"retry-after": "17"}, text="slow down")

        p = _make_provider()
        _patch_client(p, handler)

        with pytest.raises(LLMRateLimitError) as exc:
            await p._call_model("deepseek-chat", "s", "u")
        assert exc.value.wait_seconds == 17.0

    @pytest.mark.asyncio
    async def test_non_429_http_error_raises_api_error(self):
        def handler(request: httpx.Request) -> httpx.Response:
            return httpx.Response(401, text="unauthorized")

        p = _make_provider()
        _patch_client(p, handler)

        with pytest.raises(LLMAPIError) as exc:
            await p._call_model("deepseek-chat", "s", "u")
        assert exc.value.status_code == 401


class TestFallback:
    @pytest.mark.asyncio
    async def test_falls_back_on_primary_429(self):
        calls: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            import json as _json
            model = _json.loads(request.content)["model"]
            calls.append(model)
            if model == "deepseek-chat":
                return httpx.Response(429, headers={"retry-after": "1"})
            return httpx.Response(
                200,
                json={
                    "choices": [{"message": {"content": "fallback ok"}}],
                    "usage": {"prompt_tokens": 1, "completion_tokens": 2},
                },
            )

        p = _make_provider(fallback=["deepseek-reasoner"])
        _patch_client(p, handler)

        text, *_ = await p._call_api("s", "u")
        assert text == "fallback ok"
        assert calls == ["deepseek-chat", "deepseek-reasoner"]

    @pytest.mark.asyncio
    async def test_401_does_not_trigger_fallback(self):
        calls: list[str] = []

        def handler(request: httpx.Request) -> httpx.Response:
            import json as _json
            calls.append(_json.loads(request.content)["model"])
            return httpx.Response(401, text="bad key")

        p = _make_provider(fallback=["deepseek-reasoner"])
        _patch_client(p, handler)

        with pytest.raises(LLMAPIError):
            await p._call_api("s", "u")
        assert calls == ["deepseek-chat"]  # did not retry


class TestAnalyze:
    @pytest.mark.asyncio
    async def test_analyze_parses_structured_response(self):
        def handler(request: httpx.Request) -> httpx.Response:
            payload = {
                "languages": [
                    {"name": "Python", "confidence": 0.9, "patterns_detected": ["async"]}
                ],
                "frameworks": [
                    {"name": "FastAPI", "category": "web", "usage_depth": "deep",
                     "confidence": 0.85}
                ],
                "domains": [],
                "soft_skills": [],
                "summary": "looks good",
            }
            import json as _json
            return httpx.Response(
                200,
                json={
                    "choices": [
                        {"message": {"content": _json.dumps(payload)}}
                    ],
                    "usage": {"prompt_tokens": 100, "completion_tokens": 50},
                },
            )

        p = _make_provider()
        _patch_client(p, handler)

        result = await p.analyze(
            AnalysisRequest(
                analysis_type=AnalysisType.CODE,
                content="print('hi')",
                file_path="a.py",
                language_hint="python",
            )
        )
        assert result.provider == "deepseek"
        assert result.model == "deepseek-chat"
        assert result.input_tokens == 100
        assert result.output_tokens == 50
        assert result.summary == "looks good"
        assert len(result.languages) == 1
        assert result.languages[0].name == "Python"


class TestHealthCheck:
    @pytest.mark.asyncio
    async def test_ok_when_models_returns_200(self):
        def handler(request: httpx.Request) -> httpx.Response:
            assert request.url.path.endswith("/models")
            return httpx.Response(200, json={"data": []})

        p = _make_provider()
        _patch_client(p, handler)
        assert await p.health_check() is True

    @pytest.mark.asyncio
    async def test_false_on_error(self):
        def handler(request: httpx.Request) -> httpx.Response:
            raise httpx.ConnectError("boom")

        p = _make_provider()
        _patch_client(p, handler)
        assert await p.health_check() is False


class TestGatewayWiring:
    def test_create_provider_returns_deepseek(self):
        from aexy.llm.gateway import create_provider

        cfg = LLMConfig(
            provider="deepseek", model="deepseek-chat", api_key="k"
        )
        provider = create_provider(cfg)
        assert isinstance(provider, DeepSeekProvider)
        assert provider.provider_name == "deepseek"
