"""Qwen-VL routed via local Ollama.

Ollama exposes vision models (e.g. `qwen2.5vl:7b`, `qwen2.5vl:32b`,
`qwen2.5vl:72b`) over a local HTTP API. Images are passed as base64
strings in the `images` array of `/api/chat`. Frame sampling for videos
must happen upstream — callers feed already-decoded frames here.
"""

from __future__ import annotations

import base64
import json
import logging
import re
from typing import Any

import httpx

from aexy.llm.base import LLMAPIError
from aexy.llm.qwen_openrouter_provider import _VIDEO_PROMPT_TEMPLATE, _extract_json
from aexy.llm.vision_base import (
    VideoAnnotationItem,
    VideoAnnotationResult,
    VisionProvider,
    VisionResult,
)

logger = logging.getLogger(__name__)

DEFAULT_MODEL = "qwen2.5vl:7b"


class QwenOllamaVisionProvider(VisionProvider):
    """Vision provider backed by a local Ollama Qwen-VL model."""

    def __init__(
        self,
        base_url: str,
        model: str = DEFAULT_MODEL,
        timeout: int = 300,  # local inference is slower
    ):
        if not base_url:
            raise ValueError("Ollama base_url is required")
        self._model = model
        self._client = httpx.AsyncClient(base_url=base_url, timeout=timeout)

    @property
    def provider_name(self) -> str:
        return "qwen-ollama"

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
        if not image_bytes and not image_url:
            raise ValueError("Either image_url or image_bytes is required")
        if image_url and not image_bytes:
            # Ollama only takes inline base64 — fetch the URL ourselves.
            async with httpx.AsyncClient(timeout=60) as fetcher:
                resp = await fetcher.get(image_url)
                resp.raise_for_status()
                image_bytes = resp.content

        body = await self._chat(
            prompt=prompt
            + ' Reply with JSON: {"description": str, "tags": [str], "objects": [str]}.',
            images=[image_bytes or b""],
        )
        parsed = _extract_json(body) or {}
        return VisionResult(
            description=str(parsed.get("description", body[:500])),
            tags=list(parsed.get("tags", [])),
            objects=list(parsed.get("objects", [])),
            raw=body,
            model=self._model,
            provider="ollama",
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
        if frame_urls and not frame_bytes:
            # Ollama only takes inline images. Fetch and decode.
            frame_bytes = []
            async with httpx.AsyncClient(timeout=60) as fetcher:
                for url in frame_urls:
                    resp = await fetcher.get(url)
                    resp.raise_for_status()
                    frame_bytes.append(resp.content)
        if not frame_bytes:
            raise ValueError("No frames provided")

        # Build a single-message prompt that interleaves frame timestamps with
        # the image data. Ollama's /api/chat takes `images: [base64]` on each
        # message; we encode timestamps in the text so the model can correlate.
        prompt = _VIDEO_PROMPT_TEMPLATE.format(
            sample_fps=sample_fps,
            max_annotations=max_annotations,
            extra=extra_prompt,
        )
        prompt += "\n\nFrame timestamps (ms), in order: " + ", ".join(
            str(t) for t in frame_timestamps_ms
        )

        text = await self._chat(prompt=prompt, images=frame_bytes)
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
            provider="ollama",
        )

    async def _chat(self, prompt: str, images: list[bytes]) -> str:
        b64_images = [base64.b64encode(img).decode("ascii") for img in images if img]
        try:
            response = await self._client.post(
                "/api/chat",
                json={
                    "model": self._model,
                    "messages": [
                        {
                            "role": "user",
                            "content": prompt,
                            "images": b64_images,
                        }
                    ],
                    "stream": False,
                    "options": {"temperature": 0.0},
                },
            )
        except httpx.HTTPError as exc:
            raise LLMAPIError(f"Ollama request failed: {exc}") from exc

        if response.status_code >= 400:
            raise LLMAPIError(
                f"Ollama returned {response.status_code}: {response.text[:500]}",
                status_code=response.status_code,
            )

        try:
            return response.json()["message"]["content"] or ""
        except (KeyError, TypeError, json.JSONDecodeError) as exc:
            raise LLMAPIError(f"Unexpected Ollama response shape: {exc}") from exc

    async def close(self) -> None:
        await self._client.aclose()
