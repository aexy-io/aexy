"""Deprecated shim — use `aexy.temporal.activities.file_metadata` instead.

The Drive-specific Temporal activities have been generalised. The
backwards-compatible shims (`extract_drive_file_metadata`,
`annotate_drive_video`) and the new `extract_file_ai_metadata` /
`backfill_workspace_file_metadata` all live in
`aexy.temporal.activities.file_metadata`. This module re-exports the
*input dataclasses only* so any pre-existing API callers that build the
old input shape can keep working for one release.

The activity decorators themselves are NOT re-exported here, because
Temporal registers activities by name and registering the same function
under two import paths would create duplicate-name errors at worker
startup.
"""

from __future__ import annotations

from aexy.temporal.activities.file_metadata import (
    AnnotateDriveVideoInput,
    ExtractDriveFileMetadataInput,
    ExtractFileMetadataInput,
)

__all__ = [
    "AnnotateDriveVideoInput",
    "ExtractDriveFileMetadataInput",
    "ExtractFileMetadataInput",
]
