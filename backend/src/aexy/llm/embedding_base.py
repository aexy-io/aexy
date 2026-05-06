"""Embedding provider abstractions.

Two backends share a single ABC: OpenAI-compatible embeddings via OpenRouter
and local Ollama embeddings. Both return vectors of dimension
`settings.llm.embeddings_dim` (1024 by default), which must match the
`file_embeddings.embedding` column dimension.

Why a separate abstraction (instead of extending `LLMProvider`):
    - `LLMProvider.analyze` is built around skill-extraction shapes; an
      embedding pipeline doesn't need any of that.
    - Embeddings have their own batching characteristics — many short
      texts in one request, no streaming, no system prompt — that don't
      map cleanly onto the chat-completion contract.
"""

from __future__ import annotations

import logging
from abc import ABC, abstractmethod

import httpx

from aexy.llm.base import LLMAPIError, LLMRateLimitError

logger = logging.getLogger(__name__)


OPENROUTER_API_URL = "https://openrouter.ai/api/v1"


class EmbeddingProvider(ABC):
    """Generate vector embeddings for arbitrary text chunks."""

    @abstractmethod
    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        """Return one vector per input text. Vectors are `embeddings_dim`-long."""

    @property
    @abstractmethod
    def provider_name(self) -> str:
        ...

    @property
    @abstractmethod
    def model_name(self) -> str:
        ...

    @property
    @abstractmethod
    def dim(self) -> int:
        ...


class OpenRouterEmbeddingProvider(EmbeddingProvider):
    """OpenAI-compatible embeddings via OpenRouter (or direct OpenAI key).

    Most OpenAI embedding models are exposed through OpenRouter under
    `openai/text-embedding-3-large`. The `dim` parameter is sent to the
    API which truncates Matryoshka-style — you get back a vector of the
    requested size.
    """

    def __init__(
        self,
        api_key: str,
        model: str = "openai/text-embedding-3-large",
        dim: int = 1024,
        timeout: int = 60,
    ):
        if not api_key:
            raise ValueError("OpenRouter API key required for embeddings")
        self._api_key = api_key
        self._model = model
        self._dim = dim
        self._client = httpx.AsyncClient(
            base_url=OPENROUTER_API_URL,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {api_key}",
                "HTTP-Referer": "https://aexy.io",
                "X-Title": "Aexy Drive",
            },
            timeout=timeout,
        )

    @property
    def provider_name(self) -> str:
        return "embeddings-openrouter"

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def dim(self) -> int:
        return self._dim

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        try:
            response = await self._client.post(
                "/embeddings",
                json={"model": self._model, "input": texts, "dimensions": self._dim},
            )
        except httpx.HTTPError as exc:
            raise LLMAPIError(f"OpenRouter embedding request failed: {exc}") from exc

        if response.status_code == 429:
            raise LLMRateLimitError("OpenRouter rate limit exceeded for embeddings")
        if response.status_code >= 400:
            raise LLMAPIError(
                f"OpenRouter returned {response.status_code}: {response.text[:500]}",
                status_code=response.status_code,
            )

        body = response.json()
        try:
            data = body["data"]
            return [row["embedding"] for row in data]
        except (KeyError, TypeError) as exc:
            raise LLMAPIError(f"Unexpected embedding response shape: {exc}") from exc

    async def close(self) -> None:
        await self._client.aclose()


class OllamaEmbeddingProvider(EmbeddingProvider):
    """Local Ollama embeddings.

    `bge-m3` and `mxbai-embed-large` produce 1024-dim vectors. Ollama's
    `/api/embeddings` endpoint takes one prompt at a time, so we call it
    in a loop. For large batches consider switching to `/api/embed` (newer
    Ollama versions, batched).
    """

    def __init__(
        self,
        base_url: str,
        model: str = "bge-m3",
        dim: int = 1024,
        timeout: int = 120,
    ):
        if not base_url:
            raise ValueError("Ollama base_url required")
        self._model = model
        self._dim = dim
        self._client = httpx.AsyncClient(base_url=base_url, timeout=timeout)

    @property
    def provider_name(self) -> str:
        return "embeddings-ollama"

    @property
    def model_name(self) -> str:
        return self._model

    @property
    def dim(self) -> int:
        return self._dim

    async def embed_batch(self, texts: list[str]) -> list[list[float]]:
        if not texts:
            return []
        # Try /api/embed (newer Ollama, batched) first; fall back to per-text
        # /api/embeddings for older releases.
        try:
            response = await self._client.post(
                "/api/embed", json={"model": self._model, "input": texts}
            )
            if response.status_code == 200:
                body = response.json()
                if "embeddings" in body:
                    return list(body["embeddings"])
        except httpx.HTTPError:
            pass

        out: list[list[float]] = []
        for text in texts:
            try:
                response = await self._client.post(
                    "/api/embeddings", json={"model": self._model, "prompt": text}
                )
            except httpx.HTTPError as exc:
                raise LLMAPIError(f"Ollama embedding request failed: {exc}") from exc
            if response.status_code >= 400:
                raise LLMAPIError(
                    f"Ollama returned {response.status_code}: {response.text[:500]}",
                    status_code=response.status_code,
                )
            body = response.json()
            try:
                out.append(list(body["embedding"]))
            except (KeyError, TypeError) as exc:
                raise LLMAPIError(f"Unexpected embedding response: {exc}") from exc
        return out

    async def close(self) -> None:
        await self._client.aclose()
