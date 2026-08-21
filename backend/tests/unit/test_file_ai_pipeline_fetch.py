"""How the AI pipeline gets a file's bytes.

It used to presign a URL and fetch it over HTTP, which routed our own bytes out
through whatever public hostname storage is published on. On a deployment where
that hostname doesn't reach storage, every extraction failed with a 404 that
said nothing about the real cause. The backend already holds an internal
storage connection, so it reads the object directly when it knows the key.
"""

import pytest

from aexy.services import file_ai_pipeline as pipeline
from aexy.services.file_metadata_service import ResolvedFile

BYTES = b"file-bytes"


def _resolved(**overrides) -> ResolvedFile:
    base = dict(
        file_url=None,
        file_key=None,
        file_name="shot.png",
        file_size_bytes=len(BYTES),
        content_type="image/png",
        workspace_id="ws-1",
        kind="image",
    )
    base.update(overrides)
    return ResolvedFile(**base)


class RecordingStorage:
    def __init__(self, objects):
        self.objects = objects
        self.reads: list[str] = []

    def get_object(self, key):
        self.reads.append(key)
        blob = self.objects.get(key)
        return (blob, "image/png") if blob is not None else None


@pytest.fixture
def storage(monkeypatch):
    def _install(objects=None):
        s = RecordingStorage(objects if objects is not None else {"k/shot.png": BYTES})
        monkeypatch.setattr(
            "aexy.services.storage_service.get_storage_service", lambda: s
        )
        return s

    return _install


@pytest.fixture
def no_http(monkeypatch):
    """Any HTTP call in these paths is the bug this guards against."""

    def _boom(*args, **kwargs):
        raise AssertionError("pipeline made an HTTP request instead of reading storage")

    monkeypatch.setattr(pipeline.httpx, "AsyncClient", _boom)


@pytest.mark.asyncio
async def test_reads_the_object_directly_when_the_key_is_known(storage, no_http):
    s = storage()
    got = await pipeline._download_bytes(_resolved(file_key="k/shot.png"))
    assert got == BYTES
    assert s.reads == ["k/shot.png"]


@pytest.mark.asyncio
async def test_key_wins_over_a_url_for_the_same_object(storage, no_http):
    """Resolvers hand back both. The URL points at a public host that may not
    route to storage at all; the key never leaves the internal network."""
    s = storage()
    got = await pipeline._download_bytes(
        _resolved(
            file_key="k/shot.png",
            file_url="https://server.aexy.io/storage/aexy-storage/k/shot.png",
        )
    )
    assert got == BYTES
    assert s.reads == ["k/shot.png"]


@pytest.mark.asyncio
async def test_missing_object_names_the_key_it_could_not_read(storage, no_http):
    storage(objects={})
    with pytest.raises(ValueError, match="k/gone.png"):
        await pipeline._download_bytes(_resolved(file_key="k/gone.png"))


@pytest.mark.asyncio
async def test_neither_key_nor_url_is_an_error(storage, no_http):
    storage()
    with pytest.raises(ValueError, match="neither"):
        await pipeline._download_bytes(_resolved())
