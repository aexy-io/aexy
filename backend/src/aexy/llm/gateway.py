"""Unified LLM gateway with provider selection and caching."""

import hashlib
import logging
from typing import TYPE_CHECKING, Any

from sqlalchemy.ext.asyncio import AsyncSession

from aexy.llm.base import (
    AnalysisRequest,
    AnalysisResult,
    LLMConfig,
    LLMProvider,
    LLMRateLimitError,
    MatchScore,
    TaskSignals,
)
from aexy.llm.resolution import LLMNotConfigured, platform_config, resolve_llm

if TYPE_CHECKING:
    from aexy.llm.embedding_base import EmbeddingProvider
    from aexy.llm.vision_base import VisionProvider
    from aexy.services.llm_rate_limiter import LLMRateLimiter

logger = logging.getLogger(__name__)


class AIFeatureDormant(RuntimeError):
    """This feature is switched off in this deployment, and why.

    Distinct from ``AIDisabledError`` (a workspace turned AI off) and from
    ``LLMNotConfigured`` (nobody set a credential). This one means the feature is
    off *by policy*, because its call site was broken for its entire existence
    and repairing it is not the same decision as starting to bill for it.

    A distinct type, not a silent no-op: the original bug was these paths failing
    invisibly, and a gate that also failed invisibly would be the same defect
    wearing a flag. Callers that can degrade gracefully catch this by name and
    say they did; the rest surface it as a 503 that names the switch.
    """

    def __init__(self, feature: str, reason: str) -> None:
        self.feature = feature
        self.reason = reason
        super().__init__(
            f"The AI feature {feature!r} is switched off in this deployment. "
            f"{reason} Set AI_ENABLE_DORMANT_FEATURES={feature} to turn it on."
        )


def _refuse_if_dormant(feature: str | None) -> None:
    """Stop a dormant feature before it spends anything.

    At the gateway rather than in the resolver, because the settings page reads
    the resolver to *describe* every feature — including the dormant ones, which
    it has to render rather than hide.
    """
    from aexy.llm.features import is_dormant

    reason = is_dormant(feature)
    if reason is not None:
        raise AIFeatureDormant(feature or "", reason)


class LLMGateway:
    """Unified gateway for LLM operations with caching, rate limiting, and provider abstraction."""

    def __init__(
        self,
        provider: LLMProvider,
        cache: Any | None = None,  # Will be AnalysisCache when implemented
        rate_limiter: "LLMRateLimiter | None" = None,
    ) -> None:
        """Initialize the gateway.

        Args:
            provider: The LLM provider to use.
            cache: Optional cache for analysis results.
            rate_limiter: Optional rate limiter for API calls.
        """
        self.provider = provider
        self.cache = cache
        self._rate_limiter = rate_limiter

    @property
    def rate_limiter(self) -> "LLMRateLimiter":
        """Get rate limiter (lazy initialization)."""
        if self._rate_limiter is None:
            from aexy.services.llm_rate_limiter import get_llm_rate_limiter
            self._rate_limiter = get_llm_rate_limiter()
        return self._rate_limiter

    # ─── Vision (Drive AI metadata pipeline) ───────────────────────────────
    @property
    def vision(self) -> "VisionProvider":
        """Lazy vision provider — Qwen-VL via OpenRouter or Ollama.

        The provider is selected by `settings.llm.vision_provider`. Constructed
        on first access and cached on the gateway instance for the lifetime
        of the Temporal activity.
        """
        cached = getattr(self, "_vision_provider", None)
        if cached is not None:
            return cached
        from aexy.core.config import get_settings
        from aexy.llm.qwen_ollama_provider import QwenOllamaVisionProvider
        from aexy.llm.qwen_openrouter_provider import QwenOpenRouterVisionProvider
        from aexy.llm.vision_base import VisionProvider as _VP

        settings = get_settings()
        choice = (settings.llm.vision_provider or "openrouter").lower()
        if choice == "ollama":
            provider: _VP = QwenOllamaVisionProvider(
                base_url=settings.llm.ollama_base_url,
                model=settings.llm.vision_model,
            )
        else:
            provider = QwenOpenRouterVisionProvider(
                api_key=settings.llm.openrouter_api_key,
                model=settings.llm.vision_model,
            )
        self._vision_provider = provider
        return provider

    @property
    def embeddings(self) -> "EmbeddingProvider":
        """Lazy embeddings provider — OpenRouter or Ollama."""
        cached = getattr(self, "_embedding_provider", None)
        if cached is not None:
            return cached
        from aexy.core.config import get_settings
        from aexy.llm.embedding_base import (
            EmbeddingProvider as _EP,
        )
        from aexy.llm.embedding_base import (
            OllamaEmbeddingProvider,
            OpenRouterEmbeddingProvider,
        )

        settings = get_settings()
        choice = (settings.llm.embeddings_provider or "openrouter").lower()
        if choice == "ollama":
            provider: _EP = OllamaEmbeddingProvider(
                base_url=settings.llm.ollama_base_url,
                model=settings.llm.embeddings_model,
                dim=settings.llm.embeddings_dim,
            )
        else:
            provider = OpenRouterEmbeddingProvider(
                api_key=settings.llm.openrouter_api_key,
                model=settings.llm.embeddings_model,
                dim=settings.llm.embeddings_dim,
            )
        self._embedding_provider = provider
        return provider

    # ─── Rate-limited vision + embeddings helpers ───────────────────────────
    async def _gate(
        self,
        provider_key: str,
        tokens_estimate: int,
        workspace_id: str | None,
        developer_id: str | None,
    ) -> None:
        """Pre-call rate-limit check for non-text providers (Qwen vision,
        embeddings). Reuses the same Redis-backed limiter as text LLMs but
        keys by `provider_key` ("qwen-openrouter", "embeddings-ollama", …)
        so vision/embedding usage is tracked separately from chat.

        Also the enforcement point for the workspace AI kill switch on these
        paths: image understanding and embeddings are AI processing of the
        workspace's own files, so "disable AI" has to stop them too.
        """
        await self._ensure_ai_enabled(workspace_id)
        result = await self.rate_limiter.check_rate_limit(
            provider_key,
            tokens_estimate=tokens_estimate,
            workspace_id=workspace_id,
            developer_id=developer_id,
        )
        if not result.allowed:
            raise LLMRateLimitError(
                message=result.reason or "Rate limit exceeded",
                retry_after=result.retry_after,
                wait_seconds=result.wait_seconds,
            )

    async def _record(
        self,
        provider_key: str,
        tokens_used: int,
        workspace_id: str | None,
        developer_id: str | None,
    ) -> None:
        await self.rate_limiter.record_request(
            provider_key,
            tokens_used=tokens_used,
            workspace_id=workspace_id,
            developer_id=developer_id,
        )

    async def embed_batch_limited(
        self,
        texts: list[str],
        *,
        workspace_id: str | None = None,
        developer_id: str | None = None,
    ) -> list[list[float]]:
        """Rate-limited wrapper around the embedding provider's `embed_batch`.

        Token estimate uses the rough rule of ~4 chars per token. We charge
        on inputs only; the response is a fixed-size vector and not billed
        as tokens.
        """
        if not texts:
            return []
        embedder = self.embeddings
        tokens_estimate = max(1, sum(len(t) for t in texts) // 4)
        await self._gate(embedder.provider_name, tokens_estimate, workspace_id, developer_id)
        vectors = await embedder.embed_batch(texts)
        await self._record(embedder.provider_name, tokens_estimate, workspace_id, developer_id)
        return vectors

    async def vision_image_limited(
        self,
        *,
        image_url: str | None = None,
        image_bytes: bytes | None = None,
        prompt: str | None = None,
        workspace_id: str | None = None,
        developer_id: str | None = None,
    ):
        vision = self.vision
        # An image with caption — assume a flat ~1500 tokens per call. The
        # exact cost depends on resolution but we're rate-limiting, not
        # billing, so an estimate is sufficient.
        tokens_estimate = 1500
        await self._gate(vision.provider_name, tokens_estimate, workspace_id, developer_id)
        kwargs = {"image_url": image_url, "image_bytes": image_bytes}
        if prompt is not None:
            kwargs["prompt"] = prompt
        result = await vision.analyze_image(**kwargs)
        used = int(getattr(result, "tokens_used", 0) or tokens_estimate)
        await self._record(vision.provider_name, used, workspace_id, developer_id)
        return result

    async def vision_video_frames_limited(
        self,
        *,
        frame_bytes: list[bytes],
        frame_timestamps_ms: list[int],
        sample_fps: float,
        max_annotations: int,
        workspace_id: str | None = None,
        developer_id: str | None = None,
    ):
        vision = self.vision
        if not hasattr(vision, "analyze_video_frames"):
            raise RuntimeError(
                f"Vision provider {vision.provider_name} does not implement analyze_video_frames"
            )
        # Charge per frame so longer videos burn more of the budget.
        tokens_estimate = max(1500, len(frame_bytes) * 800)
        await self._gate(vision.provider_name, tokens_estimate, workspace_id, developer_id)
        result = await vision.analyze_video_frames(
            frame_bytes=frame_bytes,
            frame_timestamps_ms=frame_timestamps_ms,
            sample_fps=sample_fps,
            max_annotations=max_annotations,
        )
        used = int(getattr(result, "tokens_used", 0) or tokens_estimate)
        await self._record(vision.provider_name, used, workspace_id, developer_id)
        return result

    # ─── Workspace AI governance ────────────────────────────────────────────
    async def _ensure_ai_enabled(self, workspace_id: str | None) -> None:
        """Raise if this workspace has switched AI off. No-op without context.

        Still here, and still needed, for the vision path — which resolves its
        provider from ``VISION_PROVIDER``/``VISION_MODEL`` rather than through
        ``resolve_llm``, so it would otherwise miss the kill switch entirely.
        Every text path gets the same check inside the resolver.

        Reads ``resolution._workspace_ai_config`` rather than duplicating the
        lookup, so there is one seam for the settings read and patching it in a
        test covers both paths.
        """
        if not workspace_id:
            return
        from aexy.llm.resolution import _workspace_ai_config
        from aexy.services.workspace_ai_settings_service import AIDisabledError

        if not (await _workspace_ai_config(workspace_id)).enabled:
            raise AIDisabledError(
                f"AI is disabled for workspace {workspace_id} by its administrators"
            )

    @staticmethod
    def _provider_cache_scope(provider: LLMProvider) -> str:
        """What must be part of a cache key besides the prompt.

        An analysis is a function of the prompt AND the model that answered it.
        Without this in the key, a workspace using its own Gemini credential
        reads answers the platform's Claude wrote — which was already true before
        per-feature models existed, and a feature asking for a stronger model
        would otherwise be served the cheap model's cached answer.

        Falls back to the class name for a provider exposing no config, so a
        stand-in in a test still scopes its own entries rather than sharing.
        """
        config = getattr(provider, "config", None)
        if config is None:
            return type(provider).__name__
        return f"{config.provider}/{config.model}"

    async def _resolve_provider(
        self,
        workspace_id: str | None,
        *,
        feature: str | None = None,
    ) -> LLMProvider:
        """The provider this call must use.

        Every decision — is AI allowed here, whose credential, which model —
        belongs to `llm/resolution.resolve_llm`, which is also what agents and
        Ask now read. This method is only the part the gateway owns: turning a
        resolved config into a cached provider instance.

        ``workspace_id is None`` means platform-level work with no workspace
        context, which skips the kill switch and any override.

        Raises:
            AIDisabledError: when the workspace has AI switched off.
        """
        # No workspace means nothing to resolve: the kill switch, the credential
        # and every model override are workspace-scoped, so platform-level work
        # runs on the provider this gateway was built with. Short-circuited
        # rather than resolved, both because it is cheaper and because reaching
        # for `platform_config()` here would refuse a gateway that was
        # deliberately constructed with a provider of its own.
        if not workspace_id:
            return self.provider

        base = getattr(self.provider, "config", None)
        if base is None:
            # A provider whose config we cannot read: a hand-built client, or a
            # stand-in in a test. The governance half still applies — the kill
            # switch is the whole point and does not need a config. The model
            # override cannot, because there is nothing to rewrite the model on.
            # Stated rather than left implicit, since "the override silently did
            # nothing" is the failure this design exists to remove.
            await self._ensure_ai_enabled(workspace_id)
            return self.provider

        # This gateway's own provider is the base when the workspace has none of
        # its own — not a freshly read `platform_config()`. A gateway built with
        # an injected provider must resolve against what it was actually built
        # with, and a deployment with no platform key at all must still work for
        # a workspace that brought one.
        resolved = await resolve_llm(workspace_id, feature, base=base)

        try:
            return _provider_for_config(resolved.config)
        except Exception as exc:
            # A workspace's own credential is only discovered to be unusable
            # here, at construction, which is why the fallback lives on this side
            # of the seam rather than in the resolver.
            if resolved.allow_platform_fallback and resolved.source != "platform":
                logger.warning(
                    "Workspace %s provider %s unusable (%s); falling back to the platform provider",
                    workspace_id, resolved.config.provider, exc,
                )
                return self.provider
            raise

    async def _check_rate_limit(
        self,
        tokens_estimate: int = 1000,
        workspace_id: str | None = None,
        developer_id: str | None = None,
        provider_name: str | None = None,
    ) -> None:
        """Check rate limit and raise if exceeded.

        Args:
            tokens_estimate: Estimated tokens for this request.
            workspace_id: Optional workspace ID for workspace-level limits.
            developer_id: Optional developer ID for developer-level limits.
            provider_name: The provider actually serving this call. Defaults to
                the platform provider; a workspace using its own key must be
                counted (and limited) under *its* provider, not ours.

        Raises:
            LLMRateLimitError: If rate limit is exceeded.
        """
        result = await self.rate_limiter.check_rate_limit(
            provider_name or self.provider.provider_name,
            tokens_estimate=tokens_estimate,
            workspace_id=workspace_id,
            developer_id=developer_id,
        )

        if not result.allowed:
            raise LLMRateLimitError(
                message=result.reason or "Rate limit exceeded",
                retry_after=result.retry_after,
                wait_seconds=result.wait_seconds,
            )

    async def _record_rate_limit_usage(
        self,
        tokens_used: int,
        workspace_id: str | None = None,
        developer_id: str | None = None,
        provider_name: str | None = None,
    ) -> None:
        """Record usage for rate limiting.

        Args:
            tokens_used: Number of tokens used.
            workspace_id: Optional workspace ID for workspace-level tracking.
            developer_id: Optional developer ID for developer-level tracking.
            provider_name: The provider actually serving this call — must match
                what ``_check_rate_limit`` counted against, or the bucket that
                was checked and the bucket that was charged diverge.
        """
        await self.rate_limiter.record_request(
            provider_name or self.provider.provider_name,
            tokens_used=tokens_used,
            workspace_id=workspace_id,
            developer_id=developer_id,
        )

    async def get_rate_limit_status(
        self,
        workspace_id: str | None = None,
        developer_id: str | None = None,
    ) -> dict[str, Any]:
        """Get current rate limit status for the provider.

        Args:
            workspace_id: Optional workspace ID for workspace-level status.
            developer_id: Optional developer ID for developer-level status.

        Returns:
            Dict with rate limit status information.
        """
        status = await self.rate_limiter.get_status(
            self.provider.provider_name,
            workspace_id=workspace_id,
            developer_id=developer_id,
        )
        return {
            "provider": status.provider,
            "is_limited": status.is_limited,
            "requests_remaining_minute": status.requests_remaining_minute,
            "requests_remaining_day": status.requests_remaining_day,
            "tokens_remaining_minute": status.tokens_remaining_minute,
            "reset_at_minute": status.reset_at_minute.isoformat(),
            "reset_at_day": status.reset_at_day.isoformat(),
            "wait_seconds": status.wait_seconds,
            "workspace_id": status.workspace_id,
            "developer_id": status.developer_id,
            "source": status.source,
        }

    async def _record_usage(
        self,
        db: AsyncSession | None,
        developer_id: str | None,
        result: AnalysisResult,
        operation: str = "analysis",
        workspace_id: str | None = None,
    ) -> None:
        """Record token usage for billing.

        Args:
            db: Database session.
            developer_id: Developer ID for billing.
            result: Analysis result containing token counts.
            operation: Type of operation performed.
            workspace_id: Workspace ID for workspace-level billing attribution.
        """
        if not db or not developer_id:
            return

        if result.input_tokens == 0 and result.output_tokens == 0:
            return

        try:
            from aexy.services.usage_service import UsageService

            usage_service = UsageService(db)
            await usage_service.record_usage(
                developer_id=developer_id,
                provider=result.provider,
                model=result.model,
                input_tokens=result.input_tokens,
                output_tokens=result.output_tokens,
                operation=operation,
                workspace_id=workspace_id,
            )
        except Exception as e:
            # Log but don't fail the request if usage tracking fails
            logger.warning(f"Failed to record usage: {e}")

    async def _log_prompt(
        self,
        db: AsyncSession | None,
        developer_id: str | None,
        workspace_id: str | None,
        provider: str,
        model: str,
        operation: str,
        user_prompt: str,
        completion: str,
        system_prompt: str | None = None,
        analysis_type: str | None = None,
        confidence: float | None = None,
        input_tokens: int = 0,
        output_tokens: int = 0,
        is_cached: bool = False,
        request_metadata: dict | None = None,
        response_metadata: dict | None = None,
    ) -> None:
        """Log prompt/completion pair for fine-tuning dataset collection."""
        if not db:
            return

        try:
            from aexy.models.llm_prompt_log import LLMPromptLog

            log = LLMPromptLog(
                developer_id=developer_id,
                workspace_id=workspace_id,
                provider=provider,
                model=model,
                operation=operation,
                system_prompt=system_prompt,
                user_prompt=user_prompt[:50000] if user_prompt else "",
                completion=completion[:50000] if completion else "",
                analysis_type=analysis_type,
                confidence=confidence,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                total_tokens=input_tokens + output_tokens,
                is_cached=is_cached,
                is_flagged=confidence is not None and confidence < 0.3,
                request_metadata=request_metadata,
                response_metadata=response_metadata,
            )
            db.add(log)
            await db.flush()
        except Exception as e:
            logger.warning(f"Failed to log prompt: {e}")

    @staticmethod
    def _hash_content(content: str) -> str:
        """Generate a hash for content-based caching.

        Args:
            content: The content to hash.

        Returns:
            SHA256 hash of the content.
        """
        return hashlib.sha256(content.encode()).hexdigest()

    async def analyze(
        self,
        request: AnalysisRequest,
        use_cache: bool = True,
        cache_ttl: int = 86400,
        db: AsyncSession | None = None,
        developer_id: str | None = None,
        skip_rate_limit: bool = False,
        workspace_id: str | None = None,
        feature: str | None = None,
    ) -> AnalysisResult:
        """Analyze content with optional caching and rate limiting.

        Args:
            request: The analysis request.
            use_cache: Whether to use caching.
            cache_ttl: Cache TTL in seconds (default 24 hours).
            db: Database session for usage tracking.
            developer_id: Developer ID for billing usage.
            skip_rate_limit: Skip rate limit check (for internal/priority requests).
            workspace_id: Optional workspace ID for workspace-level rate limiting.
            feature: The `llm/features.py` id of the product feature making
                this call, which is how a workspace's model choice for it is
                found. Omitted, the call takes the workspace default.

        Returns:
            Analysis result.

        Raises:
            LLMRateLimitError: If rate limit is exceeded.
        """
        # Before the cache and before resolution: a feature that is switched off
        # must not return a previously-generated answer either.
        _refuse_if_dormant(feature)

        # Before the cache, not after: a workspace that switched AI off should
        # get a hard stop, not a previously-generated answer.
        provider = await self._resolve_provider(workspace_id, feature=feature)

        cache_key = None

        # Check cache first (no rate limit cost)
        if use_cache and self.cache:
            cache_key = self._hash_content(
                f"{self._provider_cache_scope(provider)}:"
                f"{request.analysis_type}:{request.content}"
            )
            cached = await self.cache.get(cache_key)
            if cached:
                logger.debug(f"Cache hit for {cache_key[:16]}...")
                return cached

        # Check rate limit before making request
        if not skip_rate_limit:
            await self._check_rate_limit(
                tokens_estimate=1000,
                workspace_id=workspace_id,
                developer_id=developer_id,
                provider_name=provider.provider_name,
            )

        result = await provider.analyze(request)

        # Record usage for rate limiting
        total_tokens = result.input_tokens + result.output_tokens
        await self._record_rate_limit_usage(
            total_tokens,
            workspace_id=workspace_id,
            developer_id=developer_id,
            provider_name=provider.provider_name,
        )

        # Track usage for billing (workspace_id enables per-org billing attribution)
        await self._record_usage(
            db=db,
            developer_id=developer_id,
            result=result,
            operation=f"analysis:{request.analysis_type.value}",
            workspace_id=workspace_id,
        )

        # Log prompt/completion for fine-tuning dataset
        await self._log_prompt(
            db=db,
            developer_id=developer_id,
            workspace_id=workspace_id,
            provider=result.provider,
            model=result.model,
            operation=f"analysis:{request.analysis_type.value}",
            user_prompt=request.content,
            completion=result.raw_response or result.summary,
            system_prompt=request.context.get("system_prompt"),
            analysis_type=request.analysis_type.value,
            confidence=result.confidence,
            input_tokens=result.input_tokens,
            output_tokens=result.output_tokens,
            request_metadata={
                "file_path": request.file_path,
                "language_hint": request.language_hint,
            },
        )

        if use_cache and self.cache and cache_key and result.confidence > 0:
            await self.cache.set(cache_key, result, ttl=cache_ttl)
            logger.debug(f"Cached result for {cache_key[:16]}...")

        return result

    async def analyze_batch(
        self,
        requests: list[AnalysisRequest],
        use_cache: bool = True,
        db: AsyncSession | None = None,
        developer_id: str | None = None,
        workspace_id: str | None = None,
    ) -> list[AnalysisResult]:
        """Analyze multiple requests.

        Args:
            requests: List of analysis requests.
            use_cache: Whether to use caching.
            db: Database session for usage tracking.
            developer_id: Developer ID for billing usage.
            workspace_id: Optional workspace ID for workspace-level rate limiting.

        Returns:
            List of analysis results.
        """
        results = []
        for request in requests:
            result = await self.analyze(
                request,
                use_cache=use_cache,
                db=db,
                developer_id=developer_id,
                workspace_id=workspace_id,
            )
            results.append(result)
        return results

    async def extract_task_signals(
        self,
        task_description: str,
        use_cache: bool = True,
        cache_ttl: int = 3600,
        skip_rate_limit: bool = False,
        workspace_id: str | None = None,
        developer_id: str | None = None,
    ) -> TaskSignals:
        """Extract signals from a task description.

        Args:
            task_description: The task description.
            use_cache: Whether to use caching.
            cache_ttl: Cache TTL in seconds (default 1 hour).
            skip_rate_limit: Skip rate limit check.
            workspace_id: Optional workspace ID for workspace-level rate limiting.
            developer_id: Optional developer ID for developer-level rate limiting.

        Returns:
            Extracted task signals.

        Raises:
            LLMRateLimitError: If rate limit is exceeded.
        """
        provider = await self._resolve_provider(workspace_id)

        cache_key = None

        if use_cache and self.cache:
            cache_key = self._hash_content(f"task_signals:{task_description}")
            cached = await self.cache.get(cache_key)
            if cached:
                return cached

        # Check rate limit
        if not skip_rate_limit:
            await self._check_rate_limit(
                tokens_estimate=500,
                workspace_id=workspace_id,
                developer_id=developer_id,
                provider_name=provider.provider_name,
            )

        result = await provider.extract_task_signals(task_description)

        # Record usage (estimate ~500 tokens)
        await self._record_rate_limit_usage(
            500,
            workspace_id=workspace_id,
            developer_id=developer_id,
            provider_name=provider.provider_name,
        )

        if use_cache and self.cache and cache_key:
            await self.cache.set(cache_key, result, ttl=cache_ttl)

        return result

    async def call_llm(
        self,
        system_prompt: str,
        user_prompt: str,
        tokens_estimate: int = 1000,
        skip_rate_limit: bool = False,
        workspace_id: str | None = None,
        developer_id: str | None = None,
        db: AsyncSession | None = None,
        feature: str | None = None,
    ) -> tuple[str, int, int, int]:
        """Call LLM directly with custom prompts and rate limiting.

        This method provides rate-limited access to the underlying provider
        for use cases like question generation that need custom prompts.

        Args:
            system_prompt: System prompt for the LLM.
            user_prompt: User prompt with the actual request.
            tokens_estimate: Estimated tokens for pre-check.
            skip_rate_limit: Skip rate limit check.
            workspace_id: Optional workspace ID for workspace-level rate limiting.
            developer_id: Optional developer ID for developer-level rate limiting.
            db: Database session for billing usage tracking.
            feature: The `llm/features.py` id of the product feature making
                this call. The workspace's model choice for that feature (or its
                category) is resolved from it; omitted, the call takes the
                workspace default.

        Returns:
            Tuple of (response_text, total_tokens, input_tokens, output_tokens).

        Raises:
            LLMRateLimitError: If rate limit is exceeded.
        """
        _refuse_if_dormant(feature)

        # Workspace AI settings first: an org that disabled AI must not spend a
        # rate-limit token, and one with its own key must not be billed ours.
        provider = await self._resolve_provider(workspace_id, feature=feature)

        # Check rate limit
        if not skip_rate_limit:
            await self._check_rate_limit(
                tokens_estimate=tokens_estimate,
                workspace_id=workspace_id,
                developer_id=developer_id,
                provider_name=provider.provider_name,
            )

        # Call provider directly
        result = await provider._call_api(system_prompt, user_prompt)

        # Record usage for rate limiting + billing
        if isinstance(result, tuple) and len(result) >= 2:
            total_tokens = result[1] if len(result) > 1 else 0
            input_tokens = result[2] if len(result) > 2 else 0
            output_tokens = result[3] if len(result) > 3 else 0
            await self._record_rate_limit_usage(
                total_tokens,
                workspace_id=workspace_id,
                developer_id=developer_id,
                provider_name=provider.provider_name,
            )

            # Track usage for billing
            if db and developer_id and (input_tokens > 0 or output_tokens > 0):
                billing_result = AnalysisResult(
                    summary=result[0][:100] if result else "",
                    confidence=1.0,
                    provider=provider.__class__.__name__.lower().replace("provider", ""),
                    model=getattr(provider, "model", "unknown"),
                    input_tokens=input_tokens,
                    output_tokens=output_tokens,
                )
                await self._record_usage(
                    db=db,
                    developer_id=developer_id,
                    result=billing_result,
                    operation="call_llm",
                    workspace_id=workspace_id,
                )

            # Log prompt/completion for fine-tuning dataset
            provider_name = provider.__class__.__name__.lower().replace("provider", "")
            await self._log_prompt(
                db=db,
                developer_id=developer_id,
                workspace_id=workspace_id,
                provider=provider_name,
                model=getattr(provider, "model", "unknown"),
                operation="call_llm",
                system_prompt=system_prompt,
                user_prompt=user_prompt,
                completion=result[0] if result else "",
                input_tokens=input_tokens,
                output_tokens=output_tokens,
            )

        return result

    async def score_match(
        self,
        task_signals: TaskSignals,
        developer_skills: dict[str, Any],
        workspace_id: str | None = None,
    ) -> MatchScore:
        """Score a developer-task match.

        Args:
            task_signals: Extracted task signals.
            developer_skills: Developer skill fingerprint.
            workspace_id: Optional workspace context, so the workspace's AI
                settings (kill switch, own provider) apply here too. Optional to
                keep existing platform-level callers working unchanged.

        Returns:
            Match score.
        """
        provider = await self._resolve_provider(workspace_id)
        return await provider.score_match(task_signals, developer_skills)

    async def rank_developers(
        self,
        task_signals: TaskSignals,
        developers: list[dict[str, Any]],
        workspace_id: str | None = None,
    ) -> list[MatchScore]:
        """Rank multiple developers for a task.

        Args:
            task_signals: Extracted task signals.
            developers: List of developer skill profiles.
            workspace_id: Optional workspace context (see ``score_match``).

        Returns:
            Ranked list of match scores.
        """
        scores = []
        for developer in developers:
            score = await self.score_match(task_signals, developer, workspace_id=workspace_id)
            scores.append(score)

        # Sort by overall score descending
        scores.sort(key=lambda s: s.overall_score, reverse=True)
        return scores

    async def health_check(self) -> dict[str, Any]:
        """Check health of the gateway and its components.

        Returns:
            Health status dict.
        """
        provider_healthy = await self.provider.health_check()

        cache_healthy = True
        if self.cache:
            try:
                cache_healthy = await self.cache.health_check()
            except Exception:
                cache_healthy = False

        return {
            "healthy": provider_healthy and cache_healthy,
            "provider": {
                "name": self.provider.provider_name,
                "model": self.provider.model_name,
                "healthy": provider_healthy,
            },
            "cache": {
                "enabled": self.cache is not None,
                "healthy": cache_healthy,
            },
        }

    @property
    def provider_name(self) -> str:
        """Get the current provider name."""
        return self.provider.provider_name

    @property
    def model_name(self) -> str:
        """Get the current model name."""
        return self.provider.model_name


def create_provider(config: LLMConfig) -> LLMProvider:
    """Create an LLM provider based on configuration.

    Args:
        config: LLM configuration.

    Returns:
        Configured LLM provider.

    Raises:
        ValueError: If provider type is not supported.
    """
    if config.provider == "claude":
        from aexy.llm.claude_provider import ClaudeProvider

        return ClaudeProvider(config)

    elif config.provider == "ollama":
        from aexy.llm.ollama_provider import OllamaProvider

        return OllamaProvider(config)

    elif config.provider == "gemini":
        from aexy.llm.gemini_provider import GeminiProvider

        return GeminiProvider(config)

    elif config.provider == "openrouter":
        from aexy.llm.openrouter_provider import OpenRouterProvider

        return OpenRouterProvider(config)

    elif config.provider == "deepseek":
        from aexy.llm.deepseek_provider import DeepSeekProvider

        return DeepSeekProvider(config)

    elif config.provider == "lmstudio":
        from aexy.llm.lmstudio_provider import LMStudioProvider

        return LMStudioProvider(config)

    else:
        raise ValueError(f"Unsupported LLM provider: {config.provider}")


# Provider instances built from *workspace* configs, keyed by a fingerprint of
# the config. Every provider owns an httpx.AsyncClient, so constructing one per
# LLM call would open a fresh connection pool per call and leak sockets under
# load. Bounded and cleared wholesale rather than LRU-evicted: the working set is
# "one per workspace that configured its own key", which is small, and a rare
# full flush only costs a reconnect.
_workspace_providers: dict[str, LLMProvider] = {}
_WORKSPACE_PROVIDER_CACHE_MAX = 128


def _config_fingerprint(config: LLMConfig) -> str:
    """Stable key for a config. Includes the key so rotation takes effect."""
    material = "|".join(
        str(x)
        for x in (
            config.provider,
            config.model,
            config.base_url or "",
            config.api_key or "",
            config.max_tokens,
        )
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def _provider_for_config(config: LLMConfig) -> LLMProvider:
    """Get (or build) the cached provider instance for a workspace config."""
    key = _config_fingerprint(config)
    cached = _workspace_providers.get(key)
    if cached is not None:
        return cached
    provider = create_provider(config)
    if len(_workspace_providers) >= _WORKSPACE_PROVIDER_CACHE_MAX:
        _workspace_providers.clear()
    _workspace_providers[key] = provider
    return provider


async def resolve_effective_model(
    workspace_id: str | None,
    feature: str | None = None,
) -> tuple[str, str] | None:
    """The ``(provider, model)`` a call for this workspace and feature would use.

    For settings screens. A picker has to be able to say what the default is,
    and a feature row has to be able to show what it actually resolves to —
    otherwise a dropdown gives no way to tell that the answer changed when an
    admin switched provider at ``/settings/ai``.

    Returns None when nothing is configured at all, which a settings screen
    should render as "AI is not set up" rather than as an empty picker.
    """
    gateway = get_llm_gateway()
    base = getattr(gateway.provider, "config", None) if gateway else None
    try:
        resolved = await resolve_llm(workspace_id, feature, base=base)
    except LLMNotConfigured:
        return None
    except Exception:  # noqa: BLE001 - a disabled workspace still has to render
        # Including AIDisabledError: "off" is answered by the caller's own
        # settings, not by this.
        try:
            config = platform_config()
        except LLMNotConfigured:
            return None
        return config.provider, config.model
    return resolved.config.provider, resolved.config.model


_llm_gateway_instance: LLMGateway | None = None
_llm_gateway_initialized: bool = False


def get_llm_gateway() -> LLMGateway | None:
    """Get the LLM gateway instance.

    Uses lazy initialization and caches successful results. If gateway creation
    fails, it retries on the next call.

    The platform config comes from `llm/resolution.platform_config`, which is
    also what the resolver, the agent adapter and Ask read — this function used
    to carry its own sixty-line copy of that mapping, and the three copies had
    drifted to three different sets of per-provider defaults.

    Returns:
        LLM gateway if configured, None otherwise. None rather than a raise
        because dozens of callers already branch on it.
    """
    global _llm_gateway_instance, _llm_gateway_initialized

    if _llm_gateway_initialized and _llm_gateway_instance is not None:
        return _llm_gateway_instance

    try:
        config = platform_config()
    except LLMNotConfigured as exc:
        logger.warning("LLM not configured - gateway not available: %s", exc)
        return None

    try:
        provider = create_provider(config)
        _llm_gateway_instance = LLMGateway(provider=provider, cache=None)
        _llm_gateway_initialized = True
        return _llm_gateway_instance
    except Exception as e:  # noqa: BLE001 - any construction failure is the same answer
        logger.error(f"Failed to create LLM provider: {e}")
        return None
