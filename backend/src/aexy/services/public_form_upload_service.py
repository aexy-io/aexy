"""Staged file uploads for public (unauthenticated) form submissions.

A public form page can't call the workspace-scoped attachment endpoints, so a
``file`` field uploads through ``POST /public/forms/{token}/uploads`` *before*
the form is submitted, and the submit call echoes back the reference it got.

References are HMAC-signed with ``SECRET_KEY``. Without a signature a submitter
could name any storage key in ``field_values`` and have it attached to their own
ticket, then read it back through that ticket's public share link.
"""

import base64
import hashlib
import hmac
import json
import logging
import re
from typing import Any
from uuid import uuid4

from aexy.core.config import settings
from aexy.services.storage_service import get_storage_service

logger = logging.getLogger(__name__)

PUBLIC_FORM_UPLOADS_PREFIX = "public-form-uploads"

# Cap on values accepted per file field, so one signed ref can't be replayed
# hundreds of times into a single submission.
MAX_UPLOADS_PER_FIELD = 10

_SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._-]+")


class PublicUploadError(ValueError):
    """A staged upload was rejected. ``code`` maps to an HTTP status at the API."""

    def __init__(self, code: str, message: str):
        super().__init__(message)
        self.code = code
        self.message = message


def _b64url_encode(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def _b64url_decode(value: str) -> bytes:
    return base64.urlsafe_b64decode(value + "=" * (-len(value) % 4))


def _signature(payload: str) -> str:
    digest = hmac.new(
        settings.secret_key.encode(), payload.encode(), hashlib.sha256
    ).digest()
    return _b64url_encode(digest)


def sign_upload_ref(meta: dict[str, Any]) -> str:
    """Encode upload metadata into a tamper-proof ``payload.signature`` string."""
    payload = _b64url_encode(
        json.dumps(meta, sort_keys=True, separators=(",", ":")).encode()
    )
    return f"{payload}.{_signature(payload)}"


def verify_upload_ref(ref: str) -> dict[str, Any] | None:
    """Decode a signed reference, or None if it's malformed or tampered with."""
    if not isinstance(ref, str) or "." not in ref:
        return None
    payload, _, signature = ref.rpartition(".")
    if not payload or not signature:
        return None
    if not hmac.compare_digest(signature, _signature(payload)):
        return None
    try:
        # binascii.Error, UnicodeDecodeError and JSONDecodeError are all ValueError.
        meta = json.loads(_b64url_decode(payload))
    except ValueError:
        return None
    return meta if isinstance(meta, dict) else None


def max_upload_bytes(rules: dict[str, Any] | None) -> int:
    """Byte cap for a file field: its own limit, bounded by the deployment cap."""
    global_cap = settings.ticket_max_attachment_mb * 1024 * 1024
    try:
        field_cap = int((rules or {}).get("max_file_size_mb") or 0) * 1024 * 1024
    except (TypeError, ValueError):
        field_cap = 0
    return min(field_cap, global_cap) if field_cap > 0 else global_cap


def content_type_allowed(
    content_type: str | None, filename: str, allowed: list[Any]
) -> bool:
    """Match a file against a field's ``allowed_file_types``.

    The form builder collects this as a free-text comma-separated list, so real
    forms hold a mix of MIME types (``image/png``), wildcards (``image/*``) and
    bare extensions (``.png`` / ``png``). All three are honoured.
    """
    ctype = (content_type or "").split(";")[0].strip().lower()
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    for entry in allowed:
        rule = str(entry).strip().lower().lstrip(".")
        if not rule:
            continue
        if "/" in rule:
            if rule.endswith("/*"):
                if ctype and ctype.startswith(rule[:-1]):
                    return True
            elif ctype and ctype == rule:
                return True
        elif ext and ext == rule:
            return True
    return False


def stage_upload(
    *,
    form_id: str,
    field_key: str,
    filename: str,
    content_type: str | None,
    fileobj: Any,
    size: int,
    validation_rules: dict[str, Any] | None,
) -> dict[str, Any]:
    """Validate one file against a field's rules and stream it to storage.

    Returns the attachment metadata plus the signed ``ref`` the submit call
    echoes back. Raises :class:`PublicUploadError` on rejection.
    """
    rules = validation_rules or {}
    name = filename or "attachment"

    if size <= 0:
        raise PublicUploadError("empty", "The selected file is empty")

    max_bytes = max_upload_bytes(rules)
    if size > max_bytes:
        raise PublicUploadError(
            "too_large", f"File exceeds the {max_bytes // (1024 * 1024)} MB limit"
        )

    allowed = rules.get("allowed_file_types") or []
    if allowed and not content_type_allowed(content_type, name, allowed):
        raise PublicUploadError(
            "unsupported_type",
            "File type not allowed. Accepted types: "
            + ", ".join(str(a) for a in allowed),
        )

    storage = get_storage_service()
    if not storage.is_configured():
        raise PublicUploadError(
            "storage_unconfigured",
            "File storage is not configured on this deployment",
        )

    safe_name = _SAFE_FILENAME_RE.sub("_", name) or "attachment"
    key = f"{PUBLIC_FORM_UPLOADS_PREFIX}/{form_id}/{uuid4().hex}_{safe_name}"
    ctype = (content_type or "").split(";")[0].strip() or "application/octet-stream"

    if not storage.upload_fileobj(key, fileobj, ctype):
        raise PublicUploadError("upload_failed", "Failed to store the uploaded file")

    meta = {
        "id": str(uuid4()),
        "filename": name,
        "size": size,
        "type": ctype,
        "key": key,
        "form_id": str(form_id),
        "field_key": field_key,
    }
    return {**meta, "ref": sign_upload_ref(meta)}


def extract_attachments(
    *,
    form_id: str,
    fields: list[Any],
    field_values: dict[str, Any],
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    """Swap signed upload refs in ``field_values`` for attachment metadata.

    Returns the rewritten field values — each file field left holding plain
    filenames, which is what the ticket and submission detail views render —
    plus the attachment rows to persist alongside them.

    Unsigned, tampered or foreign refs are dropped rather than raising: a forged
    storage key would otherwise become readable through the submission's public
    share link.
    """
    file_fields = [f for f in fields if str(f.field_type) == "file"]
    if not file_fields:
        return field_values, []

    values = dict(field_values)
    attachments: list[dict[str, Any]] = []

    for field in file_fields:
        field_key = field.field_key
        raw = values.get(field_key)
        if raw is None or raw == "":
            continue

        refs = raw if isinstance(raw, list) else [raw]
        names: list[str] = []
        for ref in refs[:MAX_UPLOADS_PER_FIELD]:
            meta = verify_upload_ref(ref) if isinstance(ref, str) else None
            if (
                not meta
                or not meta.get("key")
                or meta.get("form_id") != str(form_id)
                or meta.get("field_key") != field_key
            ):
                logger.warning(
                    "Dropping unverified file reference on form %s field %s",
                    form_id,
                    field_key,
                )
                continue
            name = meta.get("filename") or "attachment"
            attachments.append(
                {
                    "id": meta.get("id") or str(uuid4()),
                    "filename": name,
                    "size": meta.get("size") or 0,
                    "type": meta.get("type") or "application/octet-stream",
                    "key": meta["key"],
                    "field_key": field_key,
                }
            )
            names.append(name)

        values[field_key] = names if isinstance(raw, list) else (names[0] if names else "")

    return values, attachments
