"""Task attachments are read through the API, not from object storage.

A presigned URL only resolves if the storage backend is published on a hostname
the browser can reach. On a self-hosted deployment that is an extra proxy hop,
and when it is missing every attachment link returns the *backend's* 404 —
which reads like a deleted file rather than an unrouted bucket. Reads now go
through `/api/v1/task-attachments/{id}`, which the backend serves over the
internal storage connection it already holds.
"""

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from aexy.core.config import settings
from aexy.services import task_attachment_service as tas
from aexy.services.storage_service import content_disposition, parse_byte_range

KEY = "task-attachments/task-1/deadbeef_screenshot.png"
BODY = b"0123456789"


def _attachment(**overrides):
    base = dict(
        id="att-1",
        task_id="task-1",
        file_name="screenshot.png",
        file_url=f"https://server.aexy.io/storage/aexy-storage/{KEY}",
        storage_key=KEY,
        file_size=len(BODY),
        content_type="image/png",
        uploaded_by_id=None,
        uploaded_at=datetime(2026, 8, 20, tzinfo=timezone.utc),
    )
    base.update(overrides)
    return SimpleNamespace(**base)


class FakeStorage:
    """Serves one object, and records the ranges it was asked for."""

    def __init__(self, objects=None):
        self.objects = objects if objects is not None else {KEY: BODY}
        self.ranges: list[tuple[int, int | None] | None] = []

    def is_configured(self):
        return True

    def key_from_url(self, url):
        marker = "/aexy-storage/"
        idx = url.find(marker)
        return url[idx + len(marker):] or None if idx >= 0 else None

    def get_object_stream(self, key, byte_range=None, chunk_size=None):
        self.ranges.append(byte_range)
        blob = self.objects.get(key)
        if blob is None:
            return None
        if byte_range is None:
            return {
                "iter": iter([blob]),
                "content_type": "image/png",
                "content_length": len(blob),
                "content_range": None,
            }
        start, end = byte_range
        last = len(blob) - 1 if end is None else min(end, len(blob) - 1)
        chunk = blob[start:last + 1]
        return {
            "iter": iter([chunk]),
            "content_type": "image/png",
            "content_length": len(chunk),
            "content_range": f"bytes {start}-{last}/{len(blob)}",
        }


@pytest.fixture
def fake_storage(monkeypatch):
    def _install(**kwargs):
        storage = FakeStorage(**kwargs)
        monkeypatch.setattr(tas, "get_storage_service", lambda: storage)
        return storage

    return _install


# ─── The URL handed to clients ──────────────────────────────────────────────

def test_response_url_points_at_the_api_not_at_storage():
    body = tas.attachment_to_response(_attachment())
    assert body.file_url == (
        f"{settings.backend_url.rstrip('/')}{settings.api_v1_prefix}/task-attachments/att-1"
    )
    # The stored canonical location is bookkeeping; it must not be served.
    assert "aexy-storage" not in body.file_url


def test_response_url_survives_a_task_moving_out_of_its_sprint():
    """The read route is keyed on the attachment alone, so nothing about where
    the task lives can invalidate a URL already handed out."""
    in_sprint = tas.attachment_to_response(_attachment())
    in_backlog = tas.attachment_to_response(_attachment())
    assert in_sprint.file_url == in_backlog.file_url


# ─── Serving the bytes ──────────────────────────────────────────────────────

def test_streams_the_object(fake_storage):
    fake_storage()
    resp = tas.stream_attachment_object(_attachment())
    assert resp.status_code == 200
    assert resp.headers["content-length"] == str(len(BODY))
    # An upload's content type is chosen by whoever uploaded it.
    assert resp.headers["x-content-type-options"] == "nosniff"
    assert resp.headers["cache-control"] == "private, no-store"


def test_range_request_returns_206(fake_storage):
    storage = fake_storage()
    resp = tas.stream_attachment_object(_attachment(), range_header="bytes=2-5")
    assert resp.status_code == 206
    assert resp.headers["content-range"] == "bytes 2-5/10"
    assert storage.ranges == [(2, 5)]


def test_unsupported_range_form_falls_back_to_the_whole_object(fake_storage):
    storage = fake_storage()
    resp = tas.stream_attachment_object(_attachment(), range_header="bytes=-4")
    assert resp.status_code == 200
    assert storage.ranges == [None]


def test_legacy_row_without_a_storage_key_recovers_it_from_the_url(fake_storage):
    """Rows predating `storage_key` carry the key only inside `file_url`."""
    storage = fake_storage()
    resp = tas.stream_attachment_object(_attachment(storage_key=None))
    assert resp.status_code == 200
    assert storage.ranges == [None]


def test_missing_object_is_a_404_not_a_500(fake_storage):
    fake_storage(objects={})
    with pytest.raises(HTTPException) as exc:
        tas.stream_attachment_object(_attachment())
    assert exc.value.status_code == 404


def test_row_with_no_recoverable_key_is_a_404(fake_storage):
    fake_storage()
    with pytest.raises(HTTPException) as exc:
        tas.stream_attachment_object(_attachment(storage_key=None, file_url=""))
    assert exc.value.status_code == 404


def test_quote_in_filename_cannot_break_out_of_the_header(fake_storage):
    fake_storage()
    resp = tas.stream_attachment_object(_attachment(file_name='a"; x="y.png'))
    assert resp.headers["content-disposition"].startswith('inline; filename="a; x=y.png";')


@pytest.mark.parametrize(
    "name",
    [
        # The one that actually broke production. macOS writes U+202F, a narrow
        # no-break space, before AM/PM — so this is every screenshot dragged off
        # a Mac, not an unusual name at all.
        "Screenshot 2026-08-20 at 3.46.22\u202fPM.png",
        "बीमा-दावा.pdf",   # Devanagari
        "report—final.pdf",                                    # em dash
        "chart 📊.png",                                     # emoji
        "résumé.docx",                                    # latin-1 representable, still not ASCII
        "notes\u00a0draft.txt",                             # non-breaking space
    ],
)
def test_a_name_the_header_cannot_encode_does_not_500(fake_storage, name):
    """Header values are latin-1. Interpolating the name raw raised
    UnicodeEncodeError while the response was being built, which surfaced as a
    500 with no CORS headers — reported by the browser as a CORS failure."""
    fake_storage()
    resp = tas.stream_attachment_object(_attachment(file_name=name))
    assert resp.status_code == 200
    # The thing that used to blow up: every header must survive the wire.
    for key, value in resp.headers.items():
        key.encode("latin-1")
        value.encode("latin-1")


def test_the_real_name_is_still_carried(fake_storage):
    fake_storage()
    resp = tas.stream_attachment_object(_attachment(file_name="बीमा.pdf"))
    disposition = resp.headers["content-disposition"]
    # RFC 5987 form carries the true name; the plain form is the fallback.
    assert "filename*=UTF-8''%E0%A4%AC%E0%A5%80%E0%A4%AE%E0%A4%BE.pdf" in disposition
    assert 'filename="____.pdf"' in disposition


# ─── Range parsing ──────────────────────────────────────────────────────────

@pytest.mark.parametrize(
    "header,expected",
    [
        ("bytes=0-99", (0, 99)),
        ("bytes=100-", (100, None)),
        ("bytes=0-99, 200-299", (0, 99)),   # multi-range: serve the first
        (None, None),
        ("", None),
        ("items=0-99", None),
        ("bytes=-500", None),               # suffix range: unsupported
        ("bytes=abc-def", None),
        ("bytes=50-10", None),              # end before start
    ],
)
def test_parse_byte_range(header, expected):
    assert parse_byte_range(header) == expected


# ─── Content-Disposition ────────────────────────

def test_content_disposition_keeps_an_ascii_name_readable():
    assert content_disposition("report.pdf") == (
        'inline; filename="report.pdf"; filename*=UTF-8\'\'report.pdf'
    )


def test_content_disposition_honours_the_disposition_type():
    assert content_disposition("report.pdf", "attachment").startswith("attachment; ")


def test_content_disposition_substitutes_rather_than_drops():
    """Non-ASCII characters become underscores, so the plain form keeps the
    name's shape — its extension in particular, which is what a client uses to
    pick an application when it ignores the encoded form."""
    assert 'filename="____.pdf"' in content_disposition("बीमा.pdf")


def test_content_disposition_never_leaves_the_plain_form_empty():
    """An empty plain form reads to some clients as "no name given", and they
    fall back to the URL's last segment — which on these routes is a bare id."""
    for blank in (None, "", "   "):
        assert 'filename="attachment"' in content_disposition(blank)


def test_a_mac_screenshot_name_stays_readable():
    """The character that broke this is invisible, so the plain form must still
    read as the name somebody recognises rather than as damage."""
    header = content_disposition("Screenshot 2026-08-20 at 3.46.22\u202fPM.png")
    assert 'filename="Screenshot 2026-08-20 at 3.46.22_PM.png"' in header
    assert "filename*=UTF-8''Screenshot%202026-08-20%20at%203.46.22%E2%80%AFPM.png" in header
