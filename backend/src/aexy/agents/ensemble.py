"""Multi-model ensemble runner — runs prompt across N models, judges/synthesizes."""

import asyncio
import json
import logging
from typing import Any

from langchain_anthropic import ChatAnthropic
from langchain_core.messages import HumanMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from aexy.core.config import settings

logger = logging.getLogger(__name__)


class EnsembleRunner:
    """Runs a prompt across multiple models and picks/synthesizes the best result."""

    def __init__(self, judge_model: str = "claude-opus-4-6"):
        self.judge_model = judge_model

    async def run(
        self,
        prompt: str,
        models: list[str],
        strategy: str = "best_of",
        context: str = "",
    ) -> dict:
        """Run prompt across multiple models and combine results.

        Args:
            prompt: The prompt to send to all models.
            models: List of model names to use.
            strategy: "best_of" (judge picks best) or "synthesize" (merge insights).
            context: Optional context for the judge.

        Returns:
            Dict with 'result', 'model', 'strategy', 'all_results'.
        """
        if len(models) < 2:
            # Single model, just run it
            result = await self._call(prompt, models[0])
            return {
                "result": result["content"],
                "model": models[0],
                "strategy": "single",
                "all_results": [result],
            }

        # Run all models in parallel
        results = await asyncio.gather(
            *[self._call(prompt, m) for m in models],
            return_exceptions=True,
        )

        # Filter out errors
        valid_results = []
        for i, r in enumerate(results):
            if isinstance(r, Exception):
                logger.warning(f"Model {models[i]} failed: {r}")
            else:
                valid_results.append(r)

        if not valid_results:
            raise RuntimeError("All models failed in ensemble")

        if len(valid_results) == 1:
            return {
                "result": valid_results[0]["content"],
                "model": valid_results[0]["model"],
                "strategy": "fallback",
                "all_results": valid_results,
            }

        if strategy == "best_of":
            winner = await self._judge(prompt, valid_results, context)
        else:
            winner = await self._synthesize(prompt, valid_results, context)

        return {
            "result": winner["content"],
            "model": winner.get("model", "synthesized"),
            "strategy": strategy,
            "all_results": valid_results,
        }

    async def _call(self, prompt: str, model: str) -> dict:
        """Call a single model."""
        if model.startswith("gemini"):
            llm = ChatGoogleGenerativeAI(
                model=model,
                google_api_key=settings.llm.gemini_api_key,
                max_output_tokens=4096,
            )
        else:
            llm = ChatAnthropic(
                model=model,
                anthropic_api_key=settings.llm.anthropic_api_key,
                max_tokens=4096,
            )

        response = await llm.ainvoke([HumanMessage(content=prompt)])
        usage = getattr(response, "usage_metadata", {}) or {}

        return {
            "model": model,
            "content": response.content,
            "input_tokens": usage.get("input_tokens", 0),
            "output_tokens": usage.get("output_tokens", 0),
        }

    async def _judge(
        self, original_prompt: str, results: list[dict], context: str
    ) -> dict:
        """Use a judge model to pick the best result."""
        judge_prompt = f"""You are a judge evaluating multiple AI responses to the same prompt.

Original prompt: {original_prompt}

{f"Context: {context}" if context else ""}

Responses:
"""
        for i, r in enumerate(results):
            judge_prompt += f"\n--- Response {i+1} (from {r['model']}) ---\n{r['content']}\n"

        judge_prompt += """
\nEvaluate each response on: accuracy, completeness, clarity, and usefulness.
Reply with ONLY a JSON object: {"winner": <1-based index>, "reason": "<brief reason>"}
"""

        llm = ChatAnthropic(
            model=self.judge_model,
            anthropic_api_key=settings.llm.anthropic_api_key,
            max_tokens=500,
        )
        response = await llm.ainvoke([HumanMessage(content=judge_prompt)])

        try:
            parsed = json.loads(response.content)
            winner_idx = parsed.get("winner", 1) - 1
            winner_idx = max(0, min(winner_idx, len(results) - 1))
            return results[winner_idx]
        except (json.JSONDecodeError, KeyError):
            # Default to first result
            return results[0]

    async def _synthesize(
        self, original_prompt: str, results: list[dict], context: str
    ) -> dict:
        """Synthesize insights from all results into one."""
        synth_prompt = f"""You are synthesizing multiple AI responses into one comprehensive answer.

Original prompt: {original_prompt}

{f"Context: {context}" if context else ""}

Responses to synthesize:
"""
        for i, r in enumerate(results):
            synth_prompt += f"\n--- Response {i+1} (from {r['model']}) ---\n{r['content']}\n"

        synth_prompt += """
\nCombine the best insights from all responses into a single, comprehensive answer.
Resolve any contradictions. Include unique insights from each response.
"""

        llm = ChatAnthropic(
            model=self.judge_model,
            anthropic_api_key=settings.llm.anthropic_api_key,
            max_tokens=4096,
        )
        response = await llm.ainvoke([HumanMessage(content=synth_prompt)])

        return {
            "model": "synthesized",
            "content": response.content,
            "input_tokens": 0,
            "output_tokens": 0,
        }
