"""Qwen-VL routed via OpenRouter.

OpenRouter exposes Qwen vision models through the OpenAI-compatible chat
completions API. Image inputs are passed as `image_url` content parts;
videos are sampled to frames locally (ffmpeg) and sent as a multi-image
batch in a single request — OpenRouter (and Qwen) can take many image
parts per call, but we keep it bounded by `max_annotations`.

Returns structured JSON parsed into `VideoAnnotationResult`.
"""

from __future__ import annotations

import base64
import json
import logging
import re
from typing import Any

import httpx

from aexy.llm.base import LLMAPIError, LLMRateLimitError
from aexy.llm.vision_base import (
    VideoAnnotationItem,
    VideoAnnotationResult,
    VisionProvider,
    VisionResult,
)

logger = logging.getLogger(__name__)

OPENROUTER_API_URL = "https://openrouter.ai/api/v1"
DEFAULT_MODEL = "qwen/qwen2.5-vl-72b-instruct"


_VIDEO_PROMPT_TEMPLATE = (
    "You are watching a video sampled at {sample_fps} frames per second. "
    "Each image is a sequential frame; their indices map to timestamps "
    "starting at 0. Identify up to {max_annotations} distinct moments "
    "(actions, scene changes, key entities). Reply with JSON in this exact "
    "shape and nothing else:\n"
    "{{\n"
    '  "summary": "one-sentence overall summary",\n'
    '  "annotations": [\n'
    '    {{"t_start_ms": int, "t_end_ms": int, "label": str, '
    '"description": str, "tags": [str], "confidence": float}},\n'
    "    ...\n"
    "  ]\n"
    "}}\n"
    "Use millisecond integers for timestamps. {extra}"
)


def _extract_json(text: str) -> dict | None:
    """Parse the first JSON object from a possibly-noisy LLM reply."""
    if not text:
        return None
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        pass
    match = re.search(r"\{.*\}", text, re.DOTALL)
    if match:
        try:
            return json.loads(match.group(0))
        except json.JSONDecodeError:
            return None
    return None


class QwenOpenRouterVisionProvider(VisionProvider):
    """Vision provider backed by Qwen-VL on OpenRouter."""

    def __init__(self, api_key: str, model: str = DEFAULT_MODEL, timeout: int = 120):
        if not api_key:
            raise ValueError("OpenRouter API key is required for Qwen vision")
        self._api_key = api_key
        self._model = model
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
        return "qwen-openrouter"

    @property
    def model_name(self) -> str:
        return self._model

    async def analyze_image(
        self,
        *,
        image_url: str | None = None,
        image_bytes: bytes | None = None,
        prompt: str = "Describe this image and list visible objects and topics.",
    ) -> VisionResult:
        if not image_url and not image_bytes:
            raise ValueError("Either image_url or image_bytes is required")

        url = image_url or self._bytes_to_data_url(image_bytes or b"")
        text = await self._chat(
            content=[
                {"type": "text", "text": prompt + " Reply with JSON: "
                 '{"description": str, "tags": [str], "objects": [str]}.'},
                {"type": "image_url", "image_url": {"url": url}},
            ]
        )
        parsed = _extract_json(text) or {}
        return VisionResult(
            description=str(parsed.get("description", text[:500])),
            tags=list(parsed.get("tags", [])),
            objects=list(parsed.get("objects", [])),
            raw=text,
            model=self._model,
            provider="openrouter",
        )

    async def analyze_video(
        self,
        *,
        video_url: str | None = None,
        video_bytes: bytes | None = None,
        prompt: str = "",
        max_annotations: int = 30,
        sample_fps: float = 0.5,
    ) -> VideoAnnotationResult:
        # Frame extraction happens upstream in the activity (so OpenRouter and
        # Ollama share the sampling code path). Callers pass either a list of
        # frame URLs via `video_url=` (semicolon-separated) or pre-encoded
        # data URLs via `video_bytes` packed as length-prefixed JSON. Real
        # callers should use the typed helper below — this signature exists
        # to keep the ABC simple.
        raise NotImplementedError(
            "analyze_video is invoked via analyze_video_frames(); the activity "
            "samples frames with ffmpeg and calls that method directly."
        )

    async def analyze_video_frames(
        self,
        *,
        frame_urls: list[str] | None = None,
        frame_bytes: list[bytes] | None = None,
        frame_timestamps_ms: list[int],
        sample_fps: float,
        max_annotations: int = 30,
        extra_prompt: str = "",
    ) -> VideoAnnotationResult:
        """Annotate a video given pre-sampled frames and their timestamps."""
        if not frame_urls and not frame_bytes:
            raise ValueError("Need either frame_urls or frame_bytes")
        if frame_urls and frame_bytes:
            raise ValueError("Pass exactly one of frame_urls / frame_bytes")
        n = len(frame_urls or frame_bytes or [])
        if n != len(frame_timestamps_ms):
            raise ValueError("frame_timestamps_ms must align with frames")

        prompt = _VIDEO_PROMPT_TEMPLATE.format(
            sample_fps=sample_fps,
            max_annotations=max_annotations,
            extra=extra_prompt,
        )

        content: list[dict] = [{"type": "text", "text": prompt}]
        urls = frame_urls or [self._bytes_to_data_url(b) for b in (frame_bytes or [])]
        for url, ts in zip(urls, frame_timestamps_ms, strict=False):
            content.append({"type": "text", "text": f"Frame at {ts} ms:"})
            content.append({"type": "image_url", "image_url": {"url": url}})

        text = await self._chat(content=content)
        parsed = _extract_json(text) or {}
        annotations_raw = parsed.get("annotations", []) or []
        annotations: list[VideoAnnotationItem] = []
        for item in annotations_raw[:max_annotations]:
            try:
                annotations.append(
                    VideoAnnotationItem(
                        t_start_ms=int(item["t_start_ms"]),
                        t_end_ms=int(item.get("t_end_ms", item["t_start_ms"])),
                        label=str(item.get("label", ""))[:255] or "moment",
                        description=item.get("description"),
                        tags=list(item.get("tags", [])),
                        confidence=item.get("confidence"),
                    )
                )
            except (KeyError, ValueError, TypeError) as exc:
                logger.warning("Dropping malformed annotation %r: %s", item, exc)

        return VideoAnnotationResult(
            annotations=annotations,
            summary=str(parsed.get("summary", "")),
            raw=text,
            model=self._model,
            provider="openrouter",
        )

    async def _chat(self, content: list[dict[str, Any]]) -> str:
        try:
            response = await self._client.post(
                "/chat/completions",
                json={
                    "model": self._model,
                    "messages": [{"role": "user", "content": content}],
                    "temperature": 0.0,
                },
            )
        except httpx.HTTPError as exc:
            raise LLMAPIError(f"OpenRouter request failed: {exc}") from exc

        if response.status_code == 429:
            raise LLMRateLimitError("OpenRouter rate limit exceeded")
        if response.status_code >= 400:
            raise LLMAPIError(
                f"OpenRouter returned {response.status_code}: {response.text[:500]}",
                status_code=response.status_code,
            )

        body = response.json()
        try:
            return body["choices"][0]["message"]["content"] or ""
        except (KeyError, IndexError, TypeError) as exc:
            raise LLMAPIError(f"Unexpected OpenRouter response shape: {exc}") from exc

    @staticmethod
    def _bytes_to_data_url(raw: bytes, mime: str = "image/jpeg") -> str:
        b64 = base64.b64encode(raw).decode("ascii")
        return f"data:{mime};base64,{b64}"

    async def close(self) -> None:
        await self._client.aclose()
