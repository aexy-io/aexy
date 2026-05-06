"""Polymorphic file AI metadata pipeline.

For any (source_type, source_id) it:
  1. Resolves the file via the registered source resolver.
  2. Branches on `kind`:
       * pdf/doc/text: extract text → chunk → embed → summarise → tag
       * image: vision-caption → tag
       * video: sample frames with ffmpeg → Qwen-VL → persist VideoAnnotation rows
       * other: LLM-tag the file name
  3. Writes results to a single `file_metadata` row (creating one if needed).
  4. Persists chunk embeddings to `file_embeddings`.

This module replaces the source-specific `drive_ai_pipeline`. The Drive
pipeline still works because Drive registers the `drive_file` resolver in
`file_metadata_service.py`.
"""

from __future__ import annotations

import asyncio
import io
import ipaddress
import json
import logging
import re
import socket
import subprocess
import tempfile
from dataclasses import dataclass
from datetime import datetime, timezone
from urllib.parse import urlparse

import httpx
from sqlalchemy import delete
from sqlalchemy.ext.asyncio import AsyncSession

from aexy.llm.base import AnalysisRequest, AnalysisType
from aexy.llm.gateway import LLMGateway
from aexy.models.file_metadata import (
    AI_STATUS_DONE,
    AI_STATUS_FAILED,
    AI_STATUS_PROCESSING,
    FileEmbedding,
    FileMetadata,
    VideoAnnotation,
)
from aexy.services.file_metadata_service import (
    ResolvedFile,
    get_or_create_metadata,
    resolve,
)

logger = logging.getLogger(__name__)


# Roughly ~1k tokens per chunk assuming 4 chars/token average.
CHUNK_SIZE_CHARS = 4000
CHUNK_OVERLAP_CHARS = 200
EMBEDDING_BATCH_SIZE = 16

# Frame sampling defaults for video annotation.
DEFAULT_SAMPLE_FPS = 0.5
MAX_FRAMES_PER_CALL = 30
DEFAULT_MAX_ANNOTATIONS = 30


@dataclass
class PipelineResult:
    metadata_id: str
    source_type: str
    source_id: str
    summary: str
    tags: list[str]
    categories: list[str]
    embeddings_count: int
    annotations_count: int


# ─── Public entry point ────────────────────────────────────────────────────
async def run_pipeline(
    db: AsyncSession, source_type: str, source_id: str, gateway: LLMGateway
) -> PipelineResult:
    """Run the full pipeline for any source. Idempotent — re-running wipes
    embeddings + auto-annotations and re-writes them."""
    resolved = await resolve(db, source_type, source_id)
    metadata = await get_or_create_metadata(
        db, source_type, source_id, resolved.workspace_id
    )

    metadata.ai_status = AI_STATUS_PROCESSING
    metadata.ai_error = None
    await db.flush()

    try:
        text_for_summary = ""
        annotations_count = 0
        embeddings_count = 0

        if resolved.kind in ("doc", "pdf") or _is_text_kind(resolved):
            text = await _download_and_extract_text(resolved)
            text_for_summary = text
            embeddings_count = await _embed_chunks(
                db, metadata, text, gateway, workspace_id=resolved.workspace_id
            )

        elif resolved.kind == "image":
            blob = await _download_bytes(resolved)
            vresult = await gateway.vision_image_limited(
                image_bytes=blob, workspace_id=resolved.workspace_id
            )
            text_for_summary = vresult.description
            metadata.ai_categories = list({*(metadata.ai_categories or []), *vresult.tags[:6]})

        elif resolved.kind == "video":
            annotations_count = await _annotate_video(db, metadata, resolved, gateway)
            text_for_summary = (
                f"Video file with {annotations_count} AI-detected moments."
            )

        elif resolved.kind == "audio":
            text_for_summary = f"Audio file: {resolved.file_name}."

        else:
            text_for_summary = resolved.file_name

        summary, tags, categories = await _summarise_and_tag(
            file_name=resolved.file_name,
            content=text_for_summary[:6000],
            gateway=gateway,
        )

        metadata.ai_summary = summary
        metadata.ai_tags = sorted({*(metadata.ai_tags or []), *tags})[:20]
        metadata.ai_categories = sorted({*(metadata.ai_categories or []), *categories})[:8]
        metadata.ai_status = AI_STATUS_DONE
        metadata.ai_processed_at = datetime.now(timezone.utc)
        await db.flush()

        return PipelineResult(
            metadata_id=str(metadata.id),
            source_type=source_type,
            source_id=source_id,
            summary=summary,
            tags=list(metadata.ai_tags),
            categories=list(metadata.ai_categories),
            embeddings_count=embeddings_count,
            annotations_count=annotations_count,
        )

    except Exception as exc:  # noqa: BLE001 — record failure and re-raise
        logger.exception(
            "File AI pipeline failed for %s:%s", source_type, source_id
        )
        metadata.ai_status = AI_STATUS_FAILED
        metadata.ai_error = str(exc)[:1000]
        await db.flush()
        raise


# ─── Bytes / text extraction ──────────────────────────────────────────────
def _is_text_kind(resolved: ResolvedFile) -> bool:
    ct = (resolved.content_type or "").lower()
    return ct.startswith("text/") or ct in {
        "application/json",
        "application/xml",
        "application/x-yaml",
    }


async def _download_bytes(resolved: ResolvedFile) -> bytes:
    """Pull file bytes via either a public/presigned URL or via the storage
    service when only an S3 key is known (compliance docs).

    SSRF safety: the URL is validated against an allowlist and the resolved
    host's IPs are checked for private/loopback/link-local ranges before any
    network call. The storage-key path is treated as trusted (we control it).
    """
    if resolved.file_url:
        await _assert_safe_url(resolved.file_url)
        async with httpx.AsyncClient(timeout=120, follow_redirects=False) as client:
            resp = await client.get(resolved.file_url)
            resp.raise_for_status()
            return resp.content
    if resolved.file_key:
        from aexy.services.storage_service import get_storage_service

        storage = get_storage_service()
        # Generate a short-lived presigned GET so we can fetch it via httpx.
        url = storage.generate_presigned_get_url(resolved.file_key, expires_in=600)
        if not url:
            raise ValueError(
                f"Storage service could not generate a presigned URL for {resolved.file_key}"
            )
        async with httpx.AsyncClient(timeout=120, follow_redirects=False) as client:
            resp = await client.get(url)
            resp.raise_for_status()
            return resp.content
    raise ValueError("Resolved file has neither file_url nor file_key")


# Hosts the pipeline is permitted to fetch from. Storage suffixes match
# presigned-URL hosts whose bucket-prefixed names vary by request.
_ALLOWED_FETCH_HOST_SUFFIXES: tuple[str, ...] = (
    ".amazonaws.com",
    ".cloudfront.net",
    ".r2.cloudflarestorage.com",
    ".aexy.io",
)


def _allowed_fetch_hosts() -> set[str]:
    """Hosts always allowed (verbatim). Includes the configured S3 endpoint
    so RustFS in dev (`http://rustfs:9000`) and any S3-compatible prod
    endpoint pass without manually maintaining a list.
    """
    from aexy.core.config import get_settings

    hosts = {"aexy-rustfs"}
    settings = get_settings()
    endpoint = (settings.s3_endpoint_url or "").strip()
    if endpoint:
        h = (urlparse(endpoint).hostname or "").lower()
        if h:
            hosts.add(h)
    return hosts


async def _assert_safe_url(url: str) -> None:
    """Reject URLs pointing at non-allowlisted hosts or non-public IPs.

    Two layers:
      1. The host (or its suffix) must be on the allowlist. Defends against
         a developer (or compromised resolver) handing us a private URL.
      2. After DNS, every returned address must be on a public range.
         Defends against DNS rebinding where a "public" hostname resolves
         to 169.254.169.254 / 10.0.0.0/8 / 127.0.0.1 / etc.

    Storage-service URLs flow through here too — that's fine because the
    configured S3 endpoint (`settings.s3_endpoint_url`) is added to the
    allowlist on the fly, and its IP is whatever the operator deployed.
    For an in-cluster RustFS, the host is allowlisted but its IP is private
    — so we skip the IP check for hostnames in the verbatim allowlist (a
    deliberate trust boundary: ops controls those names).
    """
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        raise ValueError(f"Unsupported URL scheme: {parsed.scheme!r}")
    host = (parsed.hostname or "").lower()
    if not host:
        raise ValueError("URL has no hostname")

    explicit_hosts = _allowed_fetch_hosts()
    is_explicit = host in explicit_hosts
    matches_suffix = any(host.endswith(suffix) for suffix in _ALLOWED_FETCH_HOST_SUFFIXES)
    if not is_explicit and not matches_suffix:
        raise ValueError(f"Refusing to fetch from non-allowlisted host {host!r}")

    # Trusted ops-controlled hosts (storage endpoints) skip the IP check —
    # they often resolve privately by design.
    if is_explicit:
        return

    try:
        infos = await asyncio.to_thread(
            socket.getaddrinfo, host, None, 0, socket.SOCK_STREAM
        )
    except socket.gaierror as exc:
        raise ValueError(f"DNS resolution failed for {host!r}: {exc}")

    for info in infos:
        ip_str = info[4][0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        if (
            ip.is_private
            or ip.is_loopback
            or ip.is_link_local
            or ip.is_multicast
            or ip.is_reserved
            or ip.is_unspecified
        ):
            raise ValueError(
                f"Refusing to fetch from {host!r}: resolves to non-public IP {ip_str}"
            )


async def _download_and_extract_text(resolved: ResolvedFile) -> str:
    raw = await _download_bytes(resolved)
    ct = (resolved.content_type or "").lower()
    name = (resolved.file_name or "").lower()

    if ct == "application/pdf" or name.endswith(".pdf"):
        return _extract_pdf(raw)
    if name.endswith(".docx") or ct.endswith("wordprocessingml.document"):
        return _extract_docx(raw)
    try:
        return raw.decode("utf-8", errors="ignore")
    except Exception:
        return ""


def _extract_pdf(raw: bytes) -> str:
    try:
        from pypdf import PdfReader

        reader = PdfReader(io.BytesIO(raw))
        return "\n".join((page.extract_text() or "") for page in reader.pages)
    except Exception as exc:
        logger.warning("PDF extraction failed: %s", exc)
        return ""


def _extract_docx(raw: bytes) -> str:
    try:
        from docx import Document  # python-docx

        doc = Document(io.BytesIO(raw))
        return "\n".join(p.text for p in doc.paragraphs)
    except Exception as exc:
        logger.warning("DOCX extraction failed: %s", exc)
        return ""


def _chunk_text(text: str) -> list[str]:
    text = text.strip()
    if not text:
        return []
    chunks: list[str] = []
    i = 0
    while i < len(text):
        end = min(i + CHUNK_SIZE_CHARS, len(text))
        if end < len(text):
            ws = text.rfind(" ", i + CHUNK_SIZE_CHARS // 2, end)
            if ws != -1:
                end = ws
        chunks.append(text[i:end].strip())
        if end >= len(text):
            break
        i = max(i + 1, end - CHUNK_OVERLAP_CHARS)
    return [c for c in chunks if c]


# ─── Embeddings ───────────────────────────────────────────────────────────
async def _embed_chunks(
    db: AsyncSession,
    metadata: FileMetadata,
    text: str,
    gateway: LLMGateway,
    *,
    workspace_id: str | None = None,
) -> int:
    chunks = _chunk_text(text)
    if not chunks:
        return 0

    await db.execute(
        delete(FileEmbedding).where(FileEmbedding.metadata_id == metadata.id)
    )

    embedder = gateway.embeddings
    inserted = 0
    for batch_start in range(0, len(chunks), EMBEDDING_BATCH_SIZE):
        batch = chunks[batch_start : batch_start + EMBEDDING_BATCH_SIZE]
        vectors = await gateway.embed_batch_limited(
            batch, workspace_id=workspace_id
        )
        for offset, (chunk, vec) in enumerate(zip(batch, vectors, strict=False)):
            db.add(
                FileEmbedding(
                    metadata_id=metadata.id,
                    chunk_index=batch_start + offset,
                    chunk_text=chunk,
                    embedding=vec,
                    embedding_model=embedder.model_name,
                )
            )
            inserted += 1
        await db.flush()
    return inserted


# ─── Summary + tags ───────────────────────────────────────────────────────
async def _summarise_and_tag(
    *, file_name: str, content: str, gateway: LLMGateway
) -> tuple[str, list[str], list[str]]:
    prompt = (
        "You are tagging a file for a developer-focused knowledge base. "
        f"File name: {file_name}\n\n"
        f"Content / description (may be partial):\n{content}\n\n"
        "Reply with JSON only in this shape: "
        '{"summary": "1-3 sentence summary", "tags": ["..."], "categories": ["..."]}. '
        "Tags are short noun phrases (e.g. invoice, design-spec, sprint-2026q1). "
        "Categories are coarse buckets (e.g. financial, legal, product, engineering). "
        "Up to 8 tags and 3 categories."
    )
    request = AnalysisRequest(
        content=prompt, analysis_type=AnalysisType.TASK_DESCRIPTION
    )
    try:
        result = await gateway.provider.analyze(request)
        raw = result.raw_response or result.summary or ""
        parsed = _extract_json(raw) or {}
    except Exception as exc:
        logger.warning("LLM summary failed; falling back: %s", exc)
        parsed = {}

    summary = str(parsed.get("summary") or "").strip()
    if not summary:
        summary = (content or file_name)[:280]
    tags = [str(t).strip().lower() for t in (parsed.get("tags") or []) if t][:8]
    categories = [
        str(c).strip().lower() for c in (parsed.get("categories") or []) if c
    ][:3]
    return summary, tags, categories


def _extract_json(text: str) -> dict | None:
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


# ─── Video annotation (Qwen-VL) ────────────────────────────────────────────
async def _annotate_video(
    db: AsyncSession,
    metadata: FileMetadata,
    resolved: ResolvedFile,
    gateway: LLMGateway,
) -> int:
    raw = await _download_bytes(resolved)
    # ffmpeg is sync and CPU/IO-heavy; offload so we don't block the worker
    # event loop while a multi-minute video gets sampled.
    frames, ts_ms = await asyncio.to_thread(
        _sample_frames, raw, DEFAULT_SAMPLE_FPS, MAX_FRAMES_PER_CALL
    )
    if not frames:
        logger.warning("No frames sampled for video metadata=%s", metadata.id)
        return 0

    result = await gateway.vision_video_frames_limited(
        frame_bytes=frames,
        frame_timestamps_ms=ts_ms,
        sample_fps=DEFAULT_SAMPLE_FPS,
        max_annotations=DEFAULT_MAX_ANNOTATIONS,
        workspace_id=resolved.workspace_id,
    )

    # Replace prior auto-annotations (preserve manual ones).
    await db.execute(
        delete(VideoAnnotation).where(
            VideoAnnotation.metadata_id == metadata.id,
            VideoAnnotation.source == "qwen",
        )
    )
    for ann in result.annotations:
        db.add(
            VideoAnnotation(
                metadata_id=metadata.id,
                t_start_ms=int(ann.t_start_ms),
                t_end_ms=int(ann.t_end_ms),
                label=ann.label[:255],
                description=ann.description,
                tags=list(ann.tags or []),
                confidence=ann.confidence,
                source="qwen",
                bbox=ann.bbox,
            )
        )
    await db.flush()
    return len(result.annotations)


def _sample_frames(
    video_bytes: bytes, sample_fps: float, max_frames: int
) -> tuple[list[bytes], list[int]]:
    with tempfile.TemporaryDirectory() as tmpdir:
        in_path = f"{tmpdir}/in"
        with open(in_path, "wb") as fh:
            fh.write(video_bytes)
        out_pattern = f"{tmpdir}/frame_%04d.jpg"
        cmd = [
            "ffmpeg",
            "-y",
            "-loglevel",
            "error",
            "-i",
            in_path,
            "-vf",
            f"fps={sample_fps}",
            "-vframes",
            str(max_frames),
            out_pattern,
        ]
        try:
            subprocess.run(cmd, check=True, capture_output=True)
        except (subprocess.CalledProcessError, FileNotFoundError) as exc:
            logger.warning("ffmpeg frame sampling failed: %s", exc)
            return [], []

        from glob import glob
        from os.path import basename

        frames: list[bytes] = []
        ts_ms: list[int] = []
        step_ms = int(1000 / sample_fps)
        for path in sorted(glob(f"{tmpdir}/frame_*.jpg")):
            idx = int(basename(path).removeprefix("frame_").removesuffix(".jpg"))
            ts_ms.append((idx - 1) * step_ms)
            with open(path, "rb") as fh:
                frames.append(fh.read())
        return frames, ts_ms


