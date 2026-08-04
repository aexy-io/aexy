"""Per-provider signature verification for inbound email webhooks.

WS-057: each of the four supported providers (AWS SES via SNS, SendGrid,
Mailgun, Postmark) has its own signing scheme. We verify those before
trusting the event payload — without this, an attacker can submit fake
Bounce / Complaint / Unsubscribe events that mutate `CampaignRecipient`
status and `EmailSubscriber.status` for any workspace whose message_id
they can guess (see WS-081 for the cross-tenant injection vector that
results when sig verification is absent).

WS-058: also validates SES `SubscribeURL` against the AWS hostname so a
crafted SubscriptionConfirmation can't trigger SSRF into internal
services.

By default (`webhooks_require_signing=True`) any provider with missing
config rejects the request — fail-closed. For local development you can
set `webhooks_require_signing=False` to fall back to accepting unsigned
events; the verifier logs a warning each time. Production must keep the
default.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
import json
import logging
import re
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

from aexy.core.config import get_settings

logger = logging.getLogger(__name__)


# Max allowed clock skew between provider timestamp and now. Anything older
# is a replay (WS-082). Matches the mailagent internal-auth window.
_MAX_TIMESTAMP_SKEW_SECONDS = 300


def _timestamp_within_skew(ts_str: str | None) -> bool:
    """Accept only Unix-epoch-seconds timestamps within the replay window."""
    if not ts_str:
        return False
    try:
        ts = float(ts_str)
    except (TypeError, ValueError):
        return False
    now = datetime.now(timezone.utc).timestamp()
    return abs(now - ts) <= _MAX_TIMESTAMP_SKEW_SECONDS


def _missing_config(provider: str) -> bool:
    """Decide whether to accept (dev) or reject (prod) when keys are unset.

    Returns True when the caller should treat the request as VERIFIED despite
    missing config (dev mode), False when it should be rejected. In prod this
    is always False, so a forgotten secret fails closed rather than letting
    forged events through silently.
    """
    require = get_settings().webhooks_require_signing
    if require:
        logger.error(
            "Email webhook from %s rejected: missing settings.%s_webhook_* and "
            "webhooks_require_signing=True. Configure the provider secret to accept events.",
            provider,
            provider.lower(),
        )
        return False
    logger.warning(
        "Email webhook from %s accepted without signature verification — "
        "missing settings.%s_webhook_* and webhooks_require_signing=False. "
        "Do not run this configuration in production.",
        provider,
        provider.lower(),
    )
    return True


# ---------------------------------------------------------------------------
# AWS SES via SNS
# ---------------------------------------------------------------------------

# Only AWS SNS hosts may be auto-confirmed. The SubscribeURL is attacker-
# controlled when the SubscriptionConfirmation message itself isn't signed,
# so we also enforce a hostname allowlist as a belt-and-suspenders check.
_SNS_HOST_PATTERN = re.compile(r"^sns\.[a-z0-9-]+\.amazonaws\.com$", re.IGNORECASE)


def is_safe_sns_subscribe_url(url: str) -> bool:
    """Reject anything that isn't a real AWS SNS confirm endpoint (WS-058)."""
    if not url:
        return False
    parsed = urlparse(url)
    if parsed.scheme != "https":
        return False
    host = parsed.hostname or ""
    return bool(_SNS_HOST_PATTERN.match(host))


def is_allowed_sns_topic(topic_arn: str | None) -> bool:
    """Topic ARN must be in the configured allowlist.

    Without this, an attacker who is *also* allowed to publish to a different
    AWS account's SNS topic could pump events at our endpoint. The allowlist
    pins inbound events to topics we own.
    """
    if not topic_arn:
        return False
    allowlist = (get_settings().ses_sns_topic_arn_allowlist or "").strip()
    if not allowlist:
        return _missing_config("SES")
    allowed = {arn.strip() for arn in allowlist.split(",") if arn.strip()}
    return topic_arn in allowed


# In-process cache of fetched signing certs. SNS rotates these rarely; the
# URL itself encodes the cert version, so caching by URL is safe.
_sns_cert_cache: dict[str, Any] = {}


def _is_safe_sns_cert_url(url: str | None) -> bool:
    """Accept only HTTPS URLs hosted on real AWS SNS endpoints. Reusing the
    SubscribeURL host check — both URLs come from the same SNS hostname set."""
    if not url:
        return False
    return is_safe_sns_subscribe_url(url)


_SNS_FIELDS_BY_TYPE: dict[str, tuple[str, ...]] = {
    "Notification": ("Message", "MessageId", "Subject", "Timestamp", "TopicArn", "Type"),
    "SubscriptionConfirmation": (
        "Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type",
    ),
    "UnsubscribeConfirmation": (
        "Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type",
    ),
}


def _canonical_sns_string(payload: dict) -> bytes | None:
    """Build the canonical string-to-sign per AWS SNS message-validation spec."""
    msg_type = payload.get("Type")
    fields = _SNS_FIELDS_BY_TYPE.get(msg_type or "")
    if not fields:
        return None
    parts: list[str] = []
    for field in fields:
        # "Subject" is optional — skip if absent (per AWS spec).
        if field == "Subject" and "Subject" not in payload:
            continue
        value = payload.get(field)
        if value is None:
            return None
        parts.append(field)
        parts.append(str(value))
    return ("\n".join(parts) + "\n").encode("utf-8")


def verify_sns_message_signature(payload: dict) -> bool:
    """Verify the SNS message envelope signature (WS-082).

    Without this, an attacker who knows / guesses an allow-listed `TopicArn`
    can POST forged Notification bodies to /ses and mutate
    `CampaignRecipient` / `EmailSubscriber` state. The TopicArn allowlist on
    its own is not sufficient — the field is attacker-controlled in the body.

    Returns True only when the SNS signature over the canonical message
    string verifies against the cert at `SigningCertURL`. Returns
    `_missing_config("SES")` (dev-mode) when no SES topic allowlist is set
    so signature verification is skipped in tandem with allowlist gating.
    """
    # In dev (no allowlist configured), we already short-circuit topic
    # checking; do the same for signature to keep the modes consistent.
    if not (get_settings().ses_sns_topic_arn_allowlist or "").strip():
        return _missing_config("SES")

    sig_url = payload.get("SigningCertURL")
    if not _is_safe_sns_cert_url(sig_url):
        logger.warning("Rejected SNS message: unsafe SigningCertURL: %s", sig_url)
        return False

    signature_b64 = payload.get("Signature")
    sig_version = str(payload.get("SignatureVersion") or "")
    if not signature_b64 or sig_version not in ("1", "2"):
        return False

    canonical = _canonical_sns_string(payload)
    if canonical is None:
        return False

    try:
        from cryptography.hazmat.primitives import hashes
        from cryptography.hazmat.primitives.asymmetric import padding
        from cryptography.x509 import load_pem_x509_certificate
    except ImportError:
        logger.error("cryptography package missing; cannot verify SNS signature")
        return False

    cert = _sns_cert_cache.get(sig_url)
    if cert is None:
        try:
            import httpx
            resp = httpx.get(sig_url, timeout=5.0)
            resp.raise_for_status()
            cert = load_pem_x509_certificate(resp.content)
            _sns_cert_cache[sig_url] = cert
        except Exception as exc:
            logger.warning("Failed to fetch SNS signing cert from %s: %s", sig_url, exc)
            return False

    try:
        signature = base64.b64decode(signature_b64)
        algo = hashes.SHA256() if sig_version == "2" else hashes.SHA1()
        cert.public_key().verify(signature, canonical, padding.PKCS1v15(), algo)
        return True
    except Exception:
        return False


# ---------------------------------------------------------------------------
# SendGrid (Twilio Email Event Webhook signature)
# ---------------------------------------------------------------------------

def verify_sendgrid_signature(
    body: bytes,
    timestamp_header: str | None,
    signature_header: str | None,
) -> bool:
    """ECDSA verification of `X-Twilio-Email-Event-Webhook-Signature` over
    `timestamp + body`. Public key from settings.

    Returns True when configuration is missing (dev) — production
    deployments must set `sendgrid_webhook_public_key`.
    """
    public_key_b64 = get_settings().sendgrid_webhook_public_key.strip()
    if not public_key_b64:
        return _missing_config("SendGrid")
    if not timestamp_header or not signature_header:
        return False
    # WS-082: reject stale timestamps to block replay of captured payloads.
    if not _timestamp_within_skew(timestamp_header.strip()):
        logger.warning("SendGrid webhook rejected: timestamp outside %ds skew window", _MAX_TIMESTAMP_SKEW_SECONDS)
        return False
    try:
        from cryptography.hazmat.primitives.asymmetric import ec
        from cryptography.hazmat.primitives.serialization import load_der_public_key
        from cryptography.hazmat.primitives import hashes
        from cryptography.exceptions import InvalidSignature
    except ImportError:
        logger.error("cryptography package missing; cannot verify SendGrid signature")
        return False

    try:
        der = base64.b64decode(public_key_b64)
        public_key = load_der_public_key(der)
        signature = base64.b64decode(signature_header)
        payload = timestamp_header.encode("utf-8") + body
        try:
            public_key.verify(signature, payload, ec.ECDSA(hashes.SHA256()))
            return True
        except InvalidSignature:
            return False
    except Exception as exc:
        logger.exception("SendGrid signature verification failed: %s", exc)
        return False


# ---------------------------------------------------------------------------
# Mailgun (HMAC over timestamp + token)
# ---------------------------------------------------------------------------

def verify_mailgun_signature(timestamp: str | None, token: str | None, signature: str | None) -> bool:
    """`HMAC-SHA256(signing_key, timestamp + token)` from Mailgun signature
    block. Returns True in dev mode when no signing key is configured."""
    signing_key = get_settings().mailgun_webhook_signing_key
    if not signing_key:
        return _missing_config("Mailgun")
    if not timestamp or not token or not signature:
        return False
    # WS-082: reject stale timestamps to block replay of captured payloads.
    if not _timestamp_within_skew(timestamp.strip()):
        logger.warning("Mailgun webhook rejected: timestamp outside %ds skew window", _MAX_TIMESTAMP_SKEW_SECONDS)
        return False
    expected = hmac.new(
        signing_key.encode("utf-8"),
        (timestamp + token).encode("utf-8"),
        hashlib.sha256,
    ).hexdigest()
    return hmac.compare_digest(expected, signature)


# ---------------------------------------------------------------------------
# Postmark (HTTP Basic Auth — Postmark posts with a configured user/pass)
# ---------------------------------------------------------------------------

def verify_postmark_basic_auth(authorization_header: str | None) -> bool:
    """Postmark's "webhook secret" is HTTP Basic Auth credentials configured
    on the Postmark server. We compare timing-safely against the configured
    `user:pass`."""
    expected = get_settings().postmark_webhook_basic_auth.strip()
    if not expected:
        return _missing_config("Postmark")
    if not authorization_header or not authorization_header.lower().startswith("basic "):
        return False
    try:
        encoded = authorization_header.split(" ", 1)[1].strip()
        decoded = base64.b64decode(encoded).decode("utf-8")
    except Exception:
        return False
    return hmac.compare_digest(decoded, expected)


# ---------------------------------------------------------------------------
# Inbound mail (/webhooks/email/inbound)
# ---------------------------------------------------------------------------

def verify_inbound_email_request(
    *,
    authorization_header: str | None,
    token_header: str | None,
    token_query: str | None,
    form_fields: dict | None = None,
) -> bool:
    """Authenticate a post to the inbound-mail webhook.

    This endpoint is not an event feed — it *creates* tickets and sends an
    acknowledgement to the address named in the payload, so leaving it open is
    both a ticket-injection vector (spoof a partner domain and land in that
    partner's KAM queue) and an email reflector on the workspace's own sender.

    Three accepted proofs, in order of strength:

    1. Postmark Basic Auth, when configured — Postmark's own inbound scheme.
    2. Mailgun's HMAC signature block, when present in the form body — Mailgun
       Routes post the same ``timestamp``/``token``/``signature`` triple as its
       event webhooks.
    3. A shared token we put in the URL or a header. **SendGrid Inbound Parse
       does not sign its requests at all**, so for that provider this is the
       only thing that can authenticate a post.

    Falls through to ``_missing_config`` when nothing is configured, so a
    deployment that forgot to set a secret fails closed in production
    (``webhooks_require_signing`` defaults to True) rather than quietly
    accepting forged mail.
    """
    settings = get_settings()

    expected_token = (settings.inbound_email_webhook_token or "").strip()
    if expected_token:
        for candidate in (token_header, token_query):
            if candidate and hmac.compare_digest(candidate.strip(), expected_token):
                return True

    # Postmark inbound posts with the same Basic Auth credentials as its events.
    if (settings.postmark_webhook_basic_auth or "").strip():
        if authorization_header and verify_postmark_basic_auth(authorization_header):
            return True

    # Mailgun Routes carry a signature block in the form body.
    if (settings.mailgun_webhook_signing_key or "").strip() and form_fields:
        block = form_fields.get("signature")
        if isinstance(block, str):
            try:
                block = json.loads(block)
            except json.JSONDecodeError:
                block = None
        if not isinstance(block, dict):
            block = {
                "timestamp": form_fields.get("timestamp"),
                "token": form_fields.get("token"),
                "signature": form_fields.get("signature"),
            }
        if verify_mailgun_signature(
            block.get("timestamp"), block.get("token"), block.get("signature")
        ):
            return True

    if (
        expected_token
        or (settings.postmark_webhook_basic_auth or "").strip()
        or (settings.mailgun_webhook_signing_key or "").strip()
    ):
        # Something was configured and none of it matched — a real rejection,
        # not a missing-config situation.
        logger.warning("Inbound email webhook rejected: no accepted credential matched")
        return False

    return _missing_config("Inbound")


# ---------------------------------------------------------------------------
# Workspace resolution from signed payload (WS-081)
# ---------------------------------------------------------------------------

def workspace_id_from_sender(db_sync, sender_address: str | None) -> tuple[str | None, str | None]:
    """Resolve the (workspace_id, domain_id) tuple from the **signed** sender
    address rather than the caller-controlled `message_id` (WS-081).

    Once provider signature verification has succeeded, the `from` /
    `mail.source` field in the payload is trustworthy. Match its domain
    against our `SendingDomain` catalog to pin the event to a workspace
    without a `message_id` lookup oracle."""
    if not sender_address or "@" not in sender_address:
        return None, None
    domain = sender_address.rsplit("@", 1)[1].lower().strip().rstrip(">")
    if not domain:
        return None, None

    from sqlalchemy import select
    from aexy.models.email_infrastructure import SendingDomain

    result = db_sync.execute(
        select(SendingDomain).where(SendingDomain.domain == domain)
    )
    sd = result.scalar_one_or_none()
    if not sd:
        return None, None
    return str(sd.workspace_id), str(sd.id)
