"""DeepSeek LLM provider implementation.

DeepSeek offers an OpenAI-compatible API at https://api.deepseek.com.
Models: `deepseek-chat` (non-thinking DeepSeek-V3.2) and
`deepseek-reasoner` (thinking DeepSeek-V3.2).
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


class DeepSeekProvider(LLMProvider):
    """DeepSeek API provider (OpenAI-compatible chat completions)."""

    DEEPSEEK_API_URL = "https://api.deepseek.com"
    DEFAULT_MODEL = "deepseek-chat"

    def __init__(self, config: LLMConfig) -> None:
        self.config = config
        self._model = config.model or self.DEFAULT_MODEL
        self._fallback_models = [
            m for m in config.fallback_models if m != self._model
        ]

        if not config.api_key:
            raise ValueError("API key is required for DeepSeek provider")

        self._api_key = config.api_key
        base_url = config.base_url or self.DEEPSEEK_API_URL
        self._client = httpx.AsyncClient(
            base_url=base_url,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self._api_key}",
            },
            timeout=config.timeout,
        )

    @property
    def provider_name(self) -> str:
        return "deepseek"

    @property
    def model_name(self) -> str:
        return self._model

    async def _call_api(
        self,
        system_prompt: str,
        user_prompt: str,
    ) -> tuple[str, int, int, int]:
        """Call DeepSeek with automatic fallback through `fallback_models`."""
        models_to_try = [self._model] + self._fallback_models
        last_error: Exception | None = None

        for model in models_to_try:
            try:
                result = await self._call_model(model, system_prompt, user_prompt)
                if model != self._model:
                    logger.info(
                        f"DeepSeek: used fallback model {model} (primary: {self._model})"
                    )
                return result
            except (LLMRateLimitError, LLMAPIError) as e:
                last_error = e
                status = getattr(e, "status_code", None)
                if isinstance(e, LLMRateLimitError) or status in (429, 503):
                    logger.warning(
                        f"DeepSeek: model {model} unavailable ({e}), trying next fallback"
                    )
                    continue
                raise

        if isinstance(last_error, LLMRateLimitError):
            raise last_error
        if isinstance(last_error, LLMAPIError):
            raise last_error
        raise LLMAPIError("All DeepSeek models exhausted", status_code=429)

    async def _call_model(
        self,
        model: str,
        system_prompt: str,
        user_prompt: str,
    ) -> tuple[str, int, int, int]:
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
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

            text = choices[0].get("message", {}).get("content", "")

            usage = data.get("usage", {})
            input_tokens = usage.get("prompt_tokens", 0)
            output_tokens = usage.get("completion_tokens", 0)
            total_tokens = input_tokens + output_tokens

            return text, total_tokens, input_tokens, output_tokens

        except httpx.HTTPStatusError as e:
            logger.error(
                f"DeepSeek API error ({model}): {e.response.status_code} - {e.response.text}"
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
                    message=f"DeepSeek model {model} rate limit exceeded",
                    wait_seconds=wait_seconds,
                )
            raise LLMAPIError(
                f"DeepSeek API error ({model}): {e.response.status_code}",
                status_code=e.response.status_code,
            )
        except Exception as e:
            logger.error(f"DeepSeek API call failed ({model}): {e}")
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

        except httpx.HTTPStatusError as e:
            if e.response.status_code == 429:
                logger.error(f"Rate limit exceeded: {e}")
                raise LLMRateLimitError(
                    "DeepSeek API rate limit exceeded. Please try again in a few minutes."
                )
            logger.error(f"API error: {e}")
            raise LLMAPIError(
                f"DeepSeek API error: {e}", status_code=e.response.status_code
            )
        except LLMRateLimitError:
            raise
        except LLMAPIError:
            raise
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "Too Many Requests" in error_str:
                logger.error(f"Rate limit exceeded: {e}")
                raise LLMRateLimitError(
                    "DeepSeek API rate limit exceeded. Please try again in a few minutes."
                )
            logger.error(f"Analysis failed: {e}")
            raise LLMAPIError(f"Failed to generate documentation: {error_str}")

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
            logger.error(f"Health check failed: {e}")
            return False

    async def close(self) -> None:
        await self._client.aclose()
