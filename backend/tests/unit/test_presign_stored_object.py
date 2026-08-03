"""Tests for client-facing object URL resolution.

Uploads are written without a public-read ACL, and the canonical URL that used
to be persisted in ``task_attachments.file_url`` was not fetchable in
production: nothing served the configured public path, so every attachment link
404'd. URLs handed to a browser are now presigned per response, which is what
``presign_stored_object`` does.

The fallback path matters as much as the happy path: rows written before
``storage_key`` existed only carry the key inside ``file_url``, and those must
keep resolving after the backfill migration (and even without it).
"""

from types import SimpleNamespace

import pytest

from aexy.services import storage_service as storage_module
from aexy.services.storage_service import presign_stored_object

BUCKET = "aexy-storage"
KEY = "task-attachments/task-1/deadbeef_screenshot.png"
CANONICAL_URL = f"https://server.aexy.io/storage/{BUCKET}/{KEY}"


class FakeStorage:
    """Stands in for StorageService, recording what it was asked to presign."""

    def __init__(self, configured=True, presign_result="https://signed.example/x?sig=1"):
        self.bucket = BUCKET
        self._configured = configured
        self._presign_result = presign_result
        self.presigned_keys: list[str] = []

    def is_configured(self):
        return self._configured

    def key_from_url(self, url):
        marker = f"/{self.bucket}/"
        idx = url.find(marker)
        return url[idx + len(marker):] or None if idx >= 0 else None

    def generate_presigned_get_url(self, key, expires_in=3600):
        self.presigned_keys.append(key)
        return self._presign_result


@pytest.fixture
def fake_storage(monkeypatch):
    def _install(**kwargs):
        storage = FakeStorage(**kwargs)
        monkeypatch.setattr(storage_module, "get_storage_service", lambda: storage)
        return storage

    return _install


def test_presigns_from_the_storage_key(fake_storage):
    storage = fake_storage()
    url = presign_stored_object(KEY, CANONICAL_URL)

    assert url == "https://signed.example/x?sig=1"
    assert storage.presigned_keys == [KEY]


def test_legacy_row_without_a_storage_key_recovers_it_from_the_url(fake_storage):
    """Rows written before the storage_key column must still resolve."""
    storage = fake_storage()
    url = presign_stored_object(None, CANONICAL_URL)

    assert url == "https://signed.example/x?sig=1"
    assert storage.presigned_keys == [KEY]


def test_unconfigured_storage_returns_the_stored_url_unchanged(fake_storage):
    """Dev/test deployments have no storage; responses keep their shape."""
    storage = fake_storage(configured=False)
    assert presign_stored_object(KEY, CANONICAL_URL) == CANONICAL_URL
    assert storage.presigned_keys == []


def test_falls_back_to_the_stored_url_when_signing_fails(fake_storage):
    fake_storage(presign_result=None)
    assert presign_stored_object(KEY, CANONICAL_URL) == CANONICAL_URL


def test_unrecoverable_url_falls_back_rather_than_signing_garbage(fake_storage):
    storage = fake_storage()
    foreign = "https://elsewhere.example/some/other/path.png"
    assert presign_stored_object(None, foreign) == foreign
    assert storage.presigned_keys == []


def test_no_key_and_no_url_yields_none(fake_storage):
    fake_storage()
    assert presign_stored_object(None, None) is None


def test_never_returns_the_dead_unsigned_url_when_signing_is_possible(fake_storage):
    """The regression guard: the canonical URL must not reach the client."""
    fake_storage()
    for storage_key in (KEY, None):
        assert presign_stored_object(storage_key, CANONICAL_URL) != CANONICAL_URL


# ==================== Key recovery on the real service ====================


def test_real_key_from_url_round_trips_the_canonical_form():
    """`get_object_url` and `key_from_url` must stay exact inverses.

    The backfill migration derives storage_key from file_url on the same
    assumption, so a drift here would silently strand old attachments.

    Called unbound: constructing a StorageService would build a boto client from
    whatever endpoint the local .env happens to hold, and `key_from_url` depends
    on nothing but `self.bucket`.
    """
    key_from_url = storage_module.StorageService.key_from_url
    assert key_from_url(SimpleNamespace(bucket=BUCKET), CANONICAL_URL) == KEY

    # And the same derivation the SQL migration performs, for parity.
    assert CANONICAL_URL[CANONICAL_URL.index("task-attachments/"):] == KEY


def test_attachment_storage_key_prefers_the_column(monkeypatch):
    from aexy.services import task_attachment_service

    storage = FakeStorage()
    monkeypatch.setattr(
        task_attachment_service, "get_storage_service", lambda: storage
    )

    explicit = SimpleNamespace(storage_key=KEY, file_url="https://stale.example/x")
    assert task_attachment_service.attachment_storage_key(explicit) == KEY

    legacy = SimpleNamespace(storage_key=None, file_url=CANONICAL_URL)
    assert task_attachment_service.attachment_storage_key(legacy) == KEY
