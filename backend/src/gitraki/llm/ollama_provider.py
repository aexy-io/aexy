"""Ollama LLM provider for OSS models (Llama, Mistral, CodeLlama)."""

import json
import logging
from typing import Any

import httpx

from gitraki.llm.base import (
    AnalysisRequest,
    AnalysisResult,
    AnalysisType,
    CodeQualityIndicators,
    DomainAnalysis,
    FrameworkAnalysis,
    LanguageAnalysis,
    LLMConfig,
    LLMProvider,
    MatchScore,
    SoftSkillAnalysis,
    TaskSignals,
)
from gitraki.llm.prompts import (
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


class OllamaProvider(LLMProvider):
    """Ollama provider for OSS models like Llama, Mistral, CodeLlama."""

    DEFAULT_MODEL = "codellama:13b"
    DEFAULT_BASE_URL = "http://localhost:11434"

    def __init__(self, config: LLMConfig) -> None:
        """Initialize the Ollama provider.

        Args:
            config: LLM configuration with model and base URL.
        """
        self.config = config
        self._model = config.model or self.DEFAULT_MODEL
        self._base_url = config.base_url or self.DEFAULT_BASE_URL

        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=config.timeout,
        )

    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "ollama"

    @property
    def model_name(self) -> str:
        """Get the model name."""
        return self._model

    async def _call_api(
        self,
        system_prompt: str,
        user_prompt: str,
    ) -> tuple[str, int]:
        """Make an API call to Ollama.

        Args:
            system_prompt: System instructions.
            user_prompt: User message.

        Returns:
            Tuple of (response text, approximate tokens used).
        """
        # Combine prompts for Ollama (simpler prompt format)
        full_prompt = f"""<|system|>
{system_prompt}
<|user|>
{user_prompt}
<|assistant|>"""

        payload = {
            "model": self._model,
            "prompt": full_prompt,
            "stream": False,
            "options": {
                "temperature": self.config.temperature,
                "num_predict": self.config.max_tokens,
            },
        }

        try:
            response = await self._client.post("/api/generate", json=payload)
            response.raise_for_status()
            data = response.json()

            text = data.get("response", "")

            # Estimate tokens (Ollama doesn't always provide exact counts)
            prompt_tokens = data.get("prompt_eval_count", len(full_prompt) // 4)
            response_tokens = data.get("eval_count", len(text) // 4)
            tokens = prompt_tokens + response_tokens

            return text, tokens

        except httpx.HTTPStatusError as e:
            logger.error(f"Ollama API error: {e.response.status_code} - {e.response.text}")
            raise
        except httpx.ConnectError as e:
            logger.error(f"Cannot connect to Ollama at {self._base_url}: {e}")
            raise
        except Exception as e:
            logger.error(f"Ollama API call failed: {e}")
            raise

    def _parse_json_response(self, text: str) -> dict[str, Any]:
        """Parse JSON from LLM response.

        Args:
            text: Raw response text.

        Returns:
            Parsed JSON dict.
        """
        text = text.strip()

        # Handle markdown code blocks
        if text.startswith("```json"):
            text = text[7:]
        elif text.startswith("```"):
            text = text[3:]
        if text.endswith("```"):
            text = text[:-3]
        text = text.strip()

        # Try to find JSON object in response
        start_idx = text.find("{")
        end_idx = text.rfind("}") + 1

        if start_idx != -1 and end_idx > start_idx:
            text = text[start_idx:end_idx]

        try:
            return json.loads(text)
        except json.JSONDecodeError as e:
            logger.warning(f"Failed to parse JSON response: {e}")
            logger.debug(f"Raw response: {text[:500]}")
            return {}

    async def analyze(self, request: AnalysisRequest) -> AnalysisResult:
        """Perform analysis on the given content."""
        system_prompt, user_prompt = self._build_analysis_prompts(request)

        try:
            response_text, tokens = await self._call_api(system_prompt, user_prompt)
            data = self._parse_json_response(response_text)

            return self._parse_analysis_result(data, response_text, tokens)

        except Exception as e:
            logger.error(f"Analysis failed: {e}")
            return AnalysisResult(
                raw_response=str(e),
                provider=self.provider_name,
                model=self.model_name,
            )

    def _build_analysis_prompts(
        self,
        request: AnalysisRequest,
    ) -> tuple[str, str]:
        """Build system and user prompts based on analysis type."""
        if request.analysis_type == AnalysisType.CODE:
            return (
                CODE_ANALYSIS_SYSTEM_PROMPT,
                CODE_ANALYSIS_PROMPT.format(
                    file_path=request.file_path or "unknown",
                    language_hint=request.language_hint or "auto-detect",
                    code=request.content[:10000],  # Smaller limit for OSS models
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
                    code=request.content[:10000],
                ),
            )

    def _parse_analysis_result(
        self,
        data: dict[str, Any],
        raw_response: str,
        tokens: int,
    ) -> AnalysisResult:
        """Parse API response into AnalysisResult."""
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
            [lang.confidence for lang in languages]
            + [fw.confidence for fw in frameworks]
            + [dom.confidence for dom in domains]
        )
        avg_confidence = sum(all_confidences) / len(all_confidences) if all_confidences else 0.0

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
            provider=self.provider_name,
            model=self.model_name,
        )

    async def extract_task_signals(self, task_description: str) -> TaskSignals:
        """Extract skill signals from a task description."""
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
            response_text, _ = await self._call_api(TASK_SIGNALS_SYSTEM_PROMPT, prompt)
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
        """Score how well a developer matches a task."""
        prompt = MATCH_SCORING_PROMPT.format(
            required_skills=", ".join(task_signals.required_skills),
            preferred_skills=", ".join(task_signals.preferred_skills),
            domain=task_signals.domain or "unspecified",
            complexity=task_signals.complexity,
            languages=", ".join(
                [lang.get("name", "") for lang in developer_skills.get("languages", [])]
            ),
            frameworks=", ".join(
                [fw.get("name", "") for fw in developer_skills.get("frameworks", [])]
            ),
            developer_domains=", ".join(
                [dom.get("name", "") for dom in developer_skills.get("domains", [])]
            ),
            recent_activity=developer_skills.get("recent_activity", "unknown"),
        )

        try:
            response_text, _ = await self._call_api(MATCH_SCORING_SYSTEM_PROMPT, prompt)
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
        """Check if the provider is healthy."""
        try:
            response = await self._client.get("/api/tags")
            if response.status_code != 200:
                return False

            # Check if our model is available
            data = response.json()
            models = [m.get("name", "") for m in data.get("models", [])]
            return self._model in models or any(self._model in m for m in models)

        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()
