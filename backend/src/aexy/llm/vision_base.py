"""Vision provider abstractions used by the Drive AI metadata pipeline.

Two concrete providers (openrouter, ollama) plug into a single ABC so the
caller (Temporal activity) doesn't care which vision-language model is in
use. The provider is selected at startup via the `VISION_PROVIDER` env var.

Why a separate module from `llm/base.py`:
    - The text `LLMProvider` interface is tightly coupled to
      `AnalysisRequest`/`AnalysisResult` (skill extraction, code analysis)
      which is not what we need for image/video understanding.
    - Vision payloads carry binary/URL inputs and timecode metadata; mixing
      them into `AnalysisRequest.content: str` would muddy that contract.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Optional

from pydantic import BaseModel, Field


class VisionResult(BaseModel):
    """A single image analysis response."""

    description: str = Field(description="Free-form caption / description of the image.")
    tags: list[str] = Field(default_factory=list)
    objects: list[str] = Field(
        default_factory=list, description="Distinct objects/entities seen in the image."
    )
    raw: str = Field(default="", description="Raw model response (debug only).")
    model: str = Field(default="")
    provider: str = Field(default="")
    tokens_used: int = Field(default=0)


class VideoAnnotationItem(BaseModel):
    """One time-coded annotation produced by the video pipeline."""

    t_start_ms: int = Field(ge=0)
    t_end_ms: int = Field(ge=0)
    label: str
    description: str | None = None
    tags: list[str] = Field(default_factory=list)
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)
    bbox: dict | None = Field(default=None, description="Optional {x,y,w,h} normalised to 0-1.")


class VideoAnnotationResult(BaseModel):
    """The full output of `analyze_video` for one source file."""

    annotations: list[VideoAnnotationItem] = Field(default_factory=list)
    summary: str = Field(default="")
    raw: str = Field(default="")
    model: str = Field(default="")
    provider: str = Field(default="")
    tokens_used: int = Field(default=0)


class VisionProvider(ABC):
    """Abstract base for vision-language providers."""

    @abstractmethod
    async def analyze_image(
        self,
        *,
        image_url: str | None = None,
        image_bytes: bytes | None = None,
        prompt: str = "Describe this image and list visible objects and topics.",
    ) -> VisionResult:
        """Caption + tag a single image. Exactly one of `image_url` or
        `image_bytes` must be provided.
        """

    @abstractmethod
    async def analyze_video(
        self,
        *,
        video_url: str | None = None,
        video_bytes: bytes | None = None,
        prompt: str = "Identify key moments and describe what happens at each.",
        max_annotations: int = 30,
        sample_fps: float = 0.5,
    ) -> VideoAnnotationResult:
        """Produce time-coded annotations for a video.

        `sample_fps` is the frame sampling rate sent to the model — 0.5 means
        one frame every two seconds. `max_annotations` caps the number of
        events returned. Implementations must respect both.
        """

    @property
    @abstractmethod
    def provider_name(self) -> str:
        """openrouter | ollama"""

    @property
    @abstractmethod
    def model_name(self) -> str:
        """The configured model identifier."""
