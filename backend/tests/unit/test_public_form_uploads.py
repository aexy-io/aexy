"""Tests for staged file uploads on public (unauthenticated) forms.

The public form page uploads a file field's contents *before* the form is
submitted and then references the stored object by a signed token. The signature
is what stops a submitter from naming an arbitrary storage key in
``field_values``: attachments on a form-created ticket are readable through that
ticket's public share link, so an accepted forged key would be an exfiltration
primitive.

Covered here: signature round-trip, every way a bad reference must be rejected,
and the size/MIME rules a field can impose.
"""

from types import SimpleNamespace

import pytest

from aexy.services.public_form_upload_service import (
    MAX_UPLOADS_PER_FIELD,
    PublicUploadError,
    content_type_allowed,
    extract_attachments,
    max_upload_bytes,
    sign_upload_ref,
    stage_upload,
    verify_upload_ref,
)


FORM_ID = "form-1"
FIELD_KEY = "attachments"


def _field(field_key=FIELD_KEY, field_type="file", rules=None, visible=True):
    return SimpleNamespace(
        field_key=field_key,
        field_type=field_type,
        validation_rules=rules or {},
        is_visible=visible,
    )


def _meta(**overrides):
    meta = {
        "id": "att-1",
        "filename": "screenshot.png",
        "size": 1234,
        "type": "image/png",
        "key": f"public-form-uploads/{FORM_ID}/abc_screenshot.png",
        "form_id": FORM_ID,
        "field_key": FIELD_KEY,
    }
    meta.update(overrides)
    return meta


# ==================== Signing ====================


def test_signed_ref_round_trips():
    meta = _meta()
    assert verify_upload_ref(sign_upload_ref(meta)) == meta


@pytest.mark.parametrize(
    "ref",
    [
        "",
        "nodot",
        ".",
        "payload.",
        ".signature",
        "not-base64.not-base64",
    ],
)
def test_malformed_refs_are_rejected(ref):
    assert verify_upload_ref(ref) is None


def test_tampered_payload_is_rejected():
    ref = sign_upload_ref(_meta())
    payload, _, signature = ref.rpartition(".")
    # Re-sign nothing: keep the original signature but swap the payload for one
    # pointing at another tenant's object.
    forged = sign_upload_ref(_meta(key="ticket-attachments/other/secret.pdf"))
    forged_payload = forged.rpartition(".")[0]
    assert forged_payload != payload
    assert verify_upload_ref(f"{forged_payload}.{signature}") is None


def test_unsigned_ref_is_rejected():
    assert verify_upload_ref("some-plain-storage-key") is None


# ==================== extract_attachments ====================


def test_valid_ref_becomes_an_attachment_and_leaves_the_filename_behind():
    ref = sign_upload_ref(_meta())
    values, attachments = extract_attachments(
        form_id=FORM_ID,
        fields=[_field()],
        field_values={"title": "Bug", FIELD_KEY: ref},
    )

    assert values["title"] == "Bug"
    # The stored value is human-readable, not the opaque ref.
    assert values[FIELD_KEY] == "screenshot.png"
    assert len(attachments) == 1
    assert attachments[0]["key"] == _meta()["key"]
    assert attachments[0]["field_key"] == FIELD_KEY


def test_forged_key_is_dropped():
    """A raw storage key must not be attachable — see module docstring."""
    values, attachments = extract_attachments(
        form_id=FORM_ID,
        fields=[_field()],
        field_values={FIELD_KEY: "ticket-attachments/other-ticket/payroll.pdf"},
    )
    assert attachments == []
    assert values[FIELD_KEY] == ""


def test_ref_from_another_form_is_dropped():
    ref = sign_upload_ref(_meta(form_id="other-form"))
    _, attachments = extract_attachments(
        form_id=FORM_ID, fields=[_field()], field_values={FIELD_KEY: ref}
    )
    assert attachments == []


def test_ref_from_another_field_is_dropped():
    ref = sign_upload_ref(_meta(field_key="other_field"))
    _, attachments = extract_attachments(
        form_id=FORM_ID, fields=[_field()], field_values={FIELD_KEY: ref}
    )
    assert attachments == []


def test_ref_without_a_storage_key_is_dropped():
    ref = sign_upload_ref(_meta(key=""))
    _, attachments = extract_attachments(
        form_id=FORM_ID, fields=[_field()], field_values={FIELD_KEY: ref}
    )
    assert attachments == []


def test_replayed_refs_are_capped_per_field():
    ref = sign_upload_ref(_meta())
    values, attachments = extract_attachments(
        form_id=FORM_ID,
        fields=[_field()],
        field_values={FIELD_KEY: [ref] * (MAX_UPLOADS_PER_FIELD + 5)},
    )
    assert len(attachments) == MAX_UPLOADS_PER_FIELD
    assert len(values[FIELD_KEY]) == MAX_UPLOADS_PER_FIELD


def test_non_file_fields_are_untouched():
    values, attachments = extract_attachments(
        form_id=FORM_ID,
        fields=[_field(field_key="title", field_type="text")],
        field_values={"title": "Bug"},
    )
    assert values == {"title": "Bug"}
    assert attachments == []


def test_empty_file_field_is_untouched():
    values, attachments = extract_attachments(
        form_id=FORM_ID, fields=[_field()], field_values={FIELD_KEY: ""}
    )
    assert values[FIELD_KEY] == ""
    assert attachments == []


# ==================== Field rules ====================


def test_field_size_cap_applies_and_is_bounded_by_the_deployment_cap():
    assert max_upload_bytes({"max_file_size_mb": 10}) == 10 * 1024 * 1024
    # No field limit falls back to the deployment cap (default 100 MB).
    assert max_upload_bytes({}) > 10 * 1024 * 1024
    # Junk values fall back rather than raising.
    assert max_upload_bytes({"max_file_size_mb": "nonsense"}) == max_upload_bytes({})


@pytest.mark.parametrize(
    "ctype,filename,allowed,expected",
    [
        ("image/png", "a.png", ["image/png", "image/jpeg"], True),
        ("image/webp", "a.webp", ["image/png", "image/jpeg"], False),
        ("image/png", "a.png", ["image/*"], True),
        ("application/pdf", "a.pdf", ["image/*"], False),
        # The builder collects a free-text list, so bare extensions appear too.
        ("", "a.png", [".png"], True),
        ("", "a.png", ["png"], True),
        ("", "a.exe", ["png"], False),
        ("image/png", "a.png", [""], False),
    ],
)
def test_allowed_file_types_matching(ctype, filename, allowed, expected):
    assert content_type_allowed(ctype, filename, allowed) is expected


def test_stage_upload_rejects_empty_files():
    with pytest.raises(PublicUploadError) as exc:
        stage_upload(
            form_id=FORM_ID,
            field_key=FIELD_KEY,
            filename="a.png",
            content_type="image/png",
            fileobj=None,
            size=0,
            validation_rules={},
        )
    assert exc.value.code == "empty"


def test_stage_upload_rejects_oversized_files():
    with pytest.raises(PublicUploadError) as exc:
        stage_upload(
            form_id=FORM_ID,
            field_key=FIELD_KEY,
            filename="a.png",
            content_type="image/png",
            fileobj=None,
            size=11 * 1024 * 1024,
            validation_rules={"max_file_size_mb": 10},
        )
    assert exc.value.code == "too_large"


def test_stage_upload_rejects_disallowed_types():
    with pytest.raises(PublicUploadError) as exc:
        stage_upload(
            form_id=FORM_ID,
            field_key=FIELD_KEY,
            filename="payload.exe",
            content_type="application/x-msdownload",
            fileobj=None,
            size=100,
            validation_rules={"allowed_file_types": ["image/png", "image/jpeg"]},
        )
    assert exc.value.code == "unsupported_type"
