"""Claude/Anthropic LLM provider implementation."""

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


class ClaudeProvider(LLMProvider):
    """Claude/Anthropic API provider implementation."""

    ANTHROPIC_API_URL = "https://api.anthropic.com/v1/messages"
    DEFAULT_MODEL = "claude-sonnet-4-20250514"

    def __init__(self, config: LLMConfig) -> None:
        """Initialize the Claude provider.

        Args:
            config: LLM configuration with API key and model settings.
        """
        self.config = config
        self._model = config.model or self.DEFAULT_MODEL

        if not config.api_key:
            raise ValueError("Anthropic API key is required for Claude provider")

        self._client = httpx.AsyncClient(
            base_url=self.ANTHROPIC_API_URL,
            headers={
                "x-api-key": config.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
            timeout=config.timeout,
        )

    @property
    def provider_name(self) -> str:
        """Get the provider name."""
        return "claude"

    @property
    def model_name(self) -> str:
        """Get the model name."""
        return self._model

    async def _call_api(
        self,
        system_prompt: str,
        user_prompt: str,
    ) -> tuple[str, int]:
        """Make an API call to Claude.

        Args:
            system_prompt: System instructions.
            user_prompt: User message.

        Returns:
            Tuple of (response text, tokens used).
        """
        payload = {
            "model": self._model,
            "max_tokens": self.config.max_tokens,
            "temperature": self.config.temperature,
            "system": system_prompt,
            "messages": [{"role": "user", "content": user_prompt}],
        }

        try:
            response = await self._client.post("", json=payload)
            response.raise_for_status()
            data = response.json()

            content = data.get("content", [])
            text = content[0].get("text", "") if content else ""

            usage = data.get("usage", {})
            tokens = usage.get("input_tokens", 0) + usage.get("output_tokens", 0)

            return text, tokens

        except httpx.HTTPStatusError as e:
            logger.error(f"Claude API error: {e.response.status_code} - {e.response.text}")
            raise
        except Exception as e:
            logger.error(f"Claude API call failed: {e}")
            raise

    def _parse_json_response(self, text: str) -> dict[str, Any]:
        """Parse JSON from LLM response, handling markdown code blocks.

        Args:
            text: Raw response text.

        Returns:
            Parsed JSON dict.
        """
        # Strip markdown code blocks if present
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
                    code=request.content[:15000],  # Limit code length
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
            # Default to code analysis
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

        # Calculate overall confidence
        all_confidences = (
            [l.confidence for l in languages]
            + [f.confidence for f in frameworks]
            + [d.confidence for d in domains]
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
        # Parse task description - could be JSON with metadata
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
            # Make a minimal API call
            response = await self._client.post(
                "",
                json={
                    "model": self._model,
                    "max_tokens": 10,
                    "messages": [{"role": "user", "content": "ping"}],
                },
            )
            return response.status_code == 200
        except Exception as e:
            logger.error(f"Health check failed: {e}")
            return False

    async def close(self) -> None:
        """Close the HTTP client."""
        await self._client.aclose()
