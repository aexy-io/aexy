"""LM Studio LLM provider implementation.

LM Studio exposes an OpenAI-compatible chat-completions API at
`http://localhost:1234/v1` by default. Used for local development and
the AI test suite (`tests/ai/`) so we can exercise the whole AI surface
without spending cloud-LLM budget.

Differences from cloud providers (Claude/OpenRouter/DeepSeek):
  * API key is optional — LM Studio accepts unauthenticated requests by
    default.
  * Reasoning models (Qwen 3.5, gpt-oss, nemotron) emit a
    `reasoning_content` field in `message`. When the response stops
    because `max_tokens` was exhausted by reasoning, `content` arrives
    empty and `finish_reason == "length"`. We mitigate two ways:
      1. Append `/no_think` to the system prompt so Qwen-family models
         skip reasoning entirely (a soft switch the model honors).
      2. If `content` is still empty but `reasoning_content` is present,
         fall back to the reasoning text so downstream parsers get
         *something* to work with. A warning is logged so the user can
         bump `max_tokens`.
"""

import json
import logging
from typing import Any

import httpx

from aexy.llm.base import (
    AnalysisRequest,
    AnalysisResult,
    AnalysisType,
    CodeQualityIndicators,
    DomainAnalysis,
    FrameworkAnalysis,
    LanguageAnalysis,
    LLMAPIError,
    LLMConfig,
    LLMProvider,
    LLMRateLimitError,
    MatchScore,
    SoftSkillAnalysis,
    TaskSignals,
)
from aexy.llm.prompts import (
    CODE_ANALYSIS_PROMPT,
    CODE_ANALYSIS_SYSTEM_PROMPT,
    COMMIT_MESSAGE_ANALYSIS_PROMPT,
    MATCH_SCORING_PROMPT,
    MATCH_SCORING_SYSTEM_PROMPT,
    PR_ANALYSIS_SYSTEM_PROMPT,
    PR_DESCRIPTION_ANALYSIS_PROMPT,
    REVIEW_COMMENT_ANALYSIS_PROMPT,
    TASK_SIGNALS_PROMPT,
    TASK_SIGNALS_SYSTEM_PROMPT,
)

logger = logging.getLogger(__name__)


# Qwen-family soft switch: appended to the system prompt to disable the
# model's chain-of-thought emission. Without this, Qwen 3.5 burns the
# entire `max_tokens` budget on reasoning and returns empty `content`.
QWEN_NO_THINK_SUFFIX = "\n\n/no_think"


class LMStudioProvider(LLMProvider):
    """LM Studio provider (OpenAI-compatible chat completions, local)."""

    DEFAULT_BASE_URL = "http://localhost:1234/v1"
    DEFAULT_MODEL = "qwen/qwen3.5-9b"

    def __init__(self, config: LLMConfig) -> None:
        self.config = config
        self._model = config.model or self.DEFAULT_MODEL
        self._fallback_models = [
            m for m in config.fallback_models if m != self._model
        ]

        # LM Studio allows requests without auth. Pass through any token
        # the caller provided (lets you front the server with a reverse
        # proxy that requires `Authorization: Bearer …`).
        self._api_key = config.api_key or ""
        base_url = config.base_url or self.DEFAULT_BASE_URL
        headers = {"Content-Type": "application/json"}
        if self._api_key:
            headers["Authorization"] = f"Bearer {self._api_key}"

        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers=headers,
            timeout=httpx.Timeout(
                connect=10.0,
                read=max(180.0, float(config.timeout)),
                write=30.0,
                pool=10.0,
            ),
        )

    @property
    def provider_name(self) -> str:
        return "lmstudio"

    @property
    def model_name(self) -> str:
        return self._model

    def _augment_system_prompt(self, system_prompt: str) -> str:
        """Suppress reasoning emission for Qwen-family models."""
        if "qwen" in self._model.lower() and "/no_think" not in system_prompt:
            return system_prompt + QWEN_NO_THINK_SUFFIX
        return system_prompt

    async def _call_api(
        self,
        system_prompt: str,
        user_prompt: str,
    ) -> tuple[str, int, int, int]:
        """Call LM Studio with automatic fallback through `fallback_models`."""
        models_to_try = [self._model] + self._fallback_models
        last_error: Exception | None = None

        for model in models_to_try:
            try:
                result = await self._call_model(model, system_prompt, user_prompt)
                if model != self._model:
                    logger.info(
                        f"LMStudio: used fallback model {model} (primary: {self._model})"
                    )
                return result
            except (LLMRateLimitError, LLMAPIError) as e:
                last_error = e
                status = getattr(e, "status_code", None)
                if isinstance(e, LLMRateLimitError) or status in (429, 503):
                    logger.warning(
                        f"LMStudio: model {model} unavailable ({e}), trying next fallback"
                    )
                    continue
                raise

        if isinstance(last_error, LLMRateLimitError):
            raise last_error
        if isinstance(last_error, LLMAPIError):
            raise last_error
        raise LLMAPIError("All LM Studio models exhausted", status_code=503)

    async def _call_model(
        self,
        model: str,
        system_prompt: str,
        user_prompt: str,
    ) -> tuple[str, int, int, int]:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": self._augment_system_prompt(system_prompt)},
                {"role": "user", "content": user_prompt},
            ],
            "max_tokens": self.config.max_tokens,
            "temperature": self.config.temperature,
            "stream": False,
        }

        try:
            response = await self._client.post("/chat/completions", json=payload)
            response.raise_for_status()
            data = response.json()

            choices = data.get("choices", [])
            if not choices:
                return "", 0, 0, 0

            message = choices[0].get("message", {}) or {}
            content = message.get("content") or ""
            finish_reason = choices[0].get("finish_reason")

            # Reasoning models exhausted their budget before emitting
            # the answer. Fall back to the reasoning trace so callers
            # have *something* to parse.
            if not content and message.get("reasoning_content"):
                logger.warning(
                    "LMStudio: %s returned empty content (finish_reason=%s); "
                    "using reasoning_content as fallback. Bump max_tokens "
                    "or include `/no_think` in the system prompt.",
                    model,
                    finish_reason,
                )
                content = message["reasoning_content"]

            usage = data.get("usage", {}) or {}
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)
            total_tokens = input_tokens + output_tokens

            return content, total_tokens, input_tokens, output_tokens

        except httpx.HTTPStatusError as e:
            logger.error(
                f"LMStudio API error ({model}): {e.response.status_code} - {e.response.text}"
            )
            if e.response.status_code == 429:
                wait_seconds = 60.0
                try:
                    retry_after = e.response.headers.get("retry-after")
                    if retry_after:
                        wait_seconds = float(retry_after)
                except (ValueError, TypeError):
                    pass
                raise LLMRateLimitError(
                    message=f"LMStudio model {model} rate limit exceeded",
                    wait_seconds=wait_seconds,
                )
            raise LLMAPIError(
                f"LMStudio API error ({model}): {e.response.status_code}",
                status_code=e.response.status_code,
            )
        except httpx.ConnectError as e:
            # Specific message — LM Studio not running is the #1 cause
            # of failures here and the default httpx message ("[Errno 61]
            # Connection refused") is opaque.
            logger.error(f"LMStudio: cannot reach server at {self._client.base_url}: {e}")
            raise LLMAPIError(
                f"LMStudio unreachable at {self._client.base_url}. Is LM Studio running?",
                status_code=503,
            )
        except Exception as e:
            logger.error(f"LMStudio API call failed ({model}): {e}")
            raise

    def _parse_json_response(self, text: str) -> dict[str, Any]:
        text = text.strip()
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON response: {e}")
            return {}

    async def analyze(self, request: AnalysisRequest) -> AnalysisResult:
        system_prompt, user_prompt = self._build_analysis_prompts(request)

        try:
            response_text, tokens, input_tokens, output_tokens = await self._call_api(
                system_prompt, user_prompt
            )
            data = self._parse_json_response(response_text)

            return self._parse_analysis_result(
                data, response_text, tokens, input_tokens, output_tokens
            )

        except (LLMRateLimitError, LLMAPIError):
            raise
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "Too Many Requests" in error_str:
                raise LLMRateLimitError("LMStudio rate limit exceeded.")
            # `str(e)` is empty for a bare IndexError or StopIteration, and the
            # message this produced was "LMStudio analysis failed: " — a report
            # that names nothing, logged without a traceback, so the only way to
            # find the cause was to read the provider and guess.
            logger.exception("LMStudio analysis failed")
            raise LLMAPIError(
                f"LMStudio analysis failed: {error_str or type(e).__name__}"
            )

    def _build_analysis_prompts(
        self,
        request: AnalysisRequest,
    ) -> tuple[str, str]:
        if request.analysis_type == AnalysisType.CODE:
            return (
                CODE_ANALYSIS_SYSTEM_PROMPT,
                CODE_ANALYSIS_PROMPT.format(
                    file_path=request.file_path or "unknown",
                    language_hint=request.language_hint or "auto-detect",
                    code=request.content[:15000],
                ),
            )

        elif request.analysis_type == AnalysisType.COMMIT_MESSAGE:
            context = request.context
            return (
                CODE_ANALYSIS_SYSTEM_PROMPT,
                COMMIT_MESSAGE_ANALYSIS_PROMPT.format(
                    message=request.content,
                    files_changed=context.get("files_changed", 0),
                    additions=context.get("additions", 0),
                    deletions=context.get("deletions", 0),
                ),
            )

        elif request.analysis_type == AnalysisType.PR_DESCRIPTION:
            context = request.context
            return (
                PR_ANALYSIS_SYSTEM_PROMPT,
                PR_DESCRIPTION_ANALYSIS_PROMPT.format(
                    title=context.get("title", ""),
                    description=request.content,
                    files_changed=context.get("files_changed", 0),
                    additions=context.get("additions", 0),
                    deletions=context.get("deletions", 0),
                ),
            )

        elif request.analysis_type == AnalysisType.REVIEW_COMMENT:
            context = request.context
            return (
                PR_ANALYSIS_SYSTEM_PROMPT,
                REVIEW_COMMENT_ANALYSIS_PROMPT.format(
                    state=context.get("state", "commented"),
                    comment=request.content,
                ),
            )

        # Doc-related analysis types arrive with `request.content` already
        # formatted by the calling service (DocumentGenerationService bakes
        # the prompt template before sending) and the system prompt is
        # passed via `request.context["system_prompt"]`. Without this
        # branch they fell through to CODE_ANALYSIS_PROMPT below and the
        # LLM returned code-analysis JSON (languages/frameworks/...) for
        # every suggest_improvements / update_documentation call. Found
        # via tests/ai/services/test_suggest_improvements.py.
        elif request.analysis_type in (
            AnalysisType.DOC_API,
            AnalysisType.DOC_README,
            AnalysisType.DOC_FUNCTION,
            AnalysisType.DOC_MODULE,
            AnalysisType.DOC_UPDATE,
            AnalysisType.DOC_IMPROVEMENT,
        ):
            return (
                request.context.get("system_prompt") or CODE_ANALYSIS_SYSTEM_PROMPT,
                request.content,
            )

        else:
            return (
                CODE_ANALYSIS_SYSTEM_PROMPT,
                CODE_ANALYSIS_PROMPT.format(
                    file_path=request.file_path or "unknown",
                    language_hint=request.language_hint or "auto-detect",
                    code=request.content[:15000],
                ),
            )

    def _parse_analysis_result(
        self,
        data: dict[str, Any],
        raw_response: str,
        tokens: int,
        input_tokens: int,
        output_tokens: int,
    ) -> AnalysisResult:
        languages = [
            LanguageAnalysis(
                name=lang.get("name", ""),
                proficiency_indicators=lang.get("proficiency_indicators", []),
                patterns_detected=lang.get("patterns_detected", []),
                confidence=lang.get("confidence", 0.0),
            )
            for lang in data.get("languages", [])
        ]

        frameworks = [
            FrameworkAnalysis(
                name=fw.get("name", ""),
                category=fw.get("category", "other"),
                usage_depth=fw.get("usage_depth", "basic"),
                patterns_detected=fw.get("patterns_detected", []),
                confidence=fw.get("confidence", 0.0),
            )
            for fw in data.get("frameworks", [])
        ]

        domains = [
            DomainAnalysis(
                name=dom.get("name", ""),
                indicators=dom.get("indicators", []),
                confidence=dom.get("confidence", 0.0),
            )
            for dom in data.get("domains", [])
        ]

        soft_skills = [
            SoftSkillAnalysis(
                skill=ss.get("skill", ""),
                score=ss.get("score", 0.0),
                indicators=ss.get("indicators", []),
            )
            for ss in data.get("soft_skills", [])
        ]

        code_quality = None
        if cq := data.get("code_quality"):
            code_quality = CodeQualityIndicators(
                complexity=cq.get("complexity", "moderate"),
                test_coverage_indicators=cq.get("test_coverage_indicators", []),
                documentation_quality=cq.get("documentation_quality", "moderate"),
                best_practices=cq.get("best_practices", []),
                concerns=cq.get("concerns", []),
            )

        all_confidences = (
            [l.confidence for l in languages]
            + [f.confidence for f in frameworks]
            + [d.confidence for d in domains]
        )
        avg_confidence = (
            sum(all_confidences) / len(all_confidences) if all_confidences else 0.0
        )

        return AnalysisResult(
            languages=languages,
            frameworks=frameworks,
            domains=domains,
            soft_skills=soft_skills,
            code_quality=code_quality,
            summary=data.get("summary", ""),
            confidence=avg_confidence,
            raw_response=raw_response,
            tokens_used=tokens,
            input_tokens=input_tokens,
            output_tokens=output_tokens,
            provider=self.provider_name,
            model=self.model_name,
        )

    async def extract_task_signals(self, task_description: str) -> TaskSignals:
        title = ""
        description = task_description
        labels: list[str] = []
        source = "unknown"

        try:
            if task_description.startswith("{"):
                task_data = json.loads(task_description)
                title = task_data.get("title", "")
                description = task_data.get("description", task_description)
                labels = task_data.get("labels", [])
                source = task_data.get("source", "unknown")
        except json.JSONDecodeError:
            pass

        prompt = TASK_SIGNALS_PROMPT.format(
            source=source,
            title=title,
            description=description,
            labels=", ".join(labels) if labels else "none",
        )

        try:
            response_text, _, _, _ = await self._call_api(
                TASK_SIGNALS_SYSTEM_PROMPT, prompt
            )
            data = self._parse_json_response(response_text)

            return TaskSignals(
                required_skills=data.get("required_skills", []),
                preferred_skills=data.get("preferred_skills", []),
                domain=data.get("domain"),
                complexity=data.get("complexity", "medium"),
                estimated_effort=data.get("estimated_effort"),
                keywords=data.get("keywords", []),
                confidence=data.get("confidence", 0.0),
            )

        except Exception as e:
            logger.error(f"Task signal extraction failed: {e}")
            return TaskSignals()

    async def score_match(
        self,
        task_signals: TaskSignals,
        developer_skills: dict[str, Any],
    ) -> MatchScore:
        prompt = MATCH_SCORING_PROMPT.format(
            required_skills=", ".join(task_signals.required_skills),
            preferred_skills=", ".join(task_signals.preferred_skills),
            domain=task_signals.domain or "unspecified",
            complexity=task_signals.complexity,
            languages=", ".join(
                [l.get("name", "") for l in developer_skills.get("languages", [])]
            ),
            frameworks=", ".join(
                [f.get("name", "") for f in developer_skills.get("frameworks", [])]
            ),
            developer_domains=", ".join(
                [d.get("name", "") for d in developer_skills.get("domains", [])]
            ),
            recent_activity=developer_skills.get("recent_activity", "unknown"),
        )

        try:
            response_text, _, _, _ = await self._call_api(
                MATCH_SCORING_SYSTEM_PROMPT, prompt
            )
            data = self._parse_json_response(response_text)

            return MatchScore(
                developer_id=developer_skills.get("developer_id", ""),
                overall_score=data.get("overall_score", 0.0),
                skill_match=data.get("skill_match", 0.0),
                experience_match=data.get("experience_match", 0.0),
                growth_opportunity=data.get("growth_opportunity", 0.0),
                reasoning=data.get("reasoning", ""),
                strengths=data.get("strengths", []),
                gaps=data.get("gaps", []),
            )

        except Exception as e:
            logger.error(f"Match scoring failed: {e}")
            return MatchScore(
                developer_id=developer_skills.get("developer_id", ""),
                overall_score=0.0,
                skill_match=0.0,
                experience_match=0.0,
                growth_opportunity=0.0,
                reasoning=f"Scoring failed: {e}",
            )

    async def health_check(self) -> bool:
        try:
            response = await self._client.get("/models")
            return response.status_code == 200
        except Exception as e:
            logger.error(f"LMStudio health check failed: {e}")
            return False

    async def close(self) -> None:
        await self._client.aclose()
