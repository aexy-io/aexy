"""Encryption utilities for sensitive data like credentials.

Credentials are stored in JSONB columns, so we use a special format:
- Encrypted: {"_encrypted": "gAAAAA...", "_version": 1}
- Unencrypted (legacy): {"api_key": "...", ...}

The service layer handles encryption/decryption transparently.
"""

import base64
import hashlib
import json
import logging
from typing import Any

from cryptography.fernet import Fernet, InvalidToken

from aexy.core.config import get_settings

logger = logging.getLogger(__name__)

# Encryption format version for future migrations
ENCRYPTION_VERSION = 1
ENCRYPTED_MARKER = "_encrypted"
VERSION_MARKER = "_version"


def _get_encryption_key() -> bytes:
    """Derive a Fernet-compatible key from the secret_key setting.

    Fernet requires a 32-byte base64-encoded key. We derive this
    from the application secret_key using SHA256.
    """
    settings = get_settings()
    # Use SHA256 to get a consistent 32-byte key from any length secret
    key_bytes = hashlib.sha256(settings.secret_key.encode()).digest()
    # Fernet expects base64-encoded key
    return base64.urlsafe_b64encode(key_bytes)


def get_fernet() -> Fernet:
    """Get a Fernet instance for encryption/decryption."""
    return Fernet(_get_encryption_key())


def encrypt_credentials(credentials: dict[str, Any]) -> dict[str, Any]:
    """Encrypt credentials dictionary for storage in JSONB.

    Args:
        credentials: Dictionary of credentials to encrypt

    Returns:
        Dictionary with encrypted data: {"_encrypted": "...", "_version": 1}
    """
    if not credentials:
        return {}

    # Don't re-encrypt already encrypted data
    if is_encrypted(credentials):
        return credentials

    fernet = get_fernet()
    json_bytes = json.dumps(credentials).encode('utf-8')
    encrypted = fernet.encrypt(json_bytes)

    return {
        ENCRYPTED_MARKER: encrypted.decode('utf-8'),
        VERSION_MARKER: ENCRYPTION_VERSION,
    }


def decrypt_credentials(stored: dict[str, Any]) -> dict[str, Any]:
    """Decrypt credentials from storage.

    Handles both encrypted and legacy unencrypted formats.

    Args:
        stored: Stored credentials (encrypted or plain)

    Returns:
        Decrypted credentials dictionary
    """
    if not stored:
        return {}

    # Check if this is encrypted format
    if not is_encrypted(stored):
        # Legacy unencrypted format - return as-is
        return stored

    encrypted_value = stored.get(ENCRYPTED_MARKER)
    if not encrypted_value:
        return {}

    fernet = get_fernet()
    try:
        decrypted = fernet.decrypt(encrypted_value.encode('utf-8'))
        return json.loads(decrypted.decode('utf-8'))
    except InvalidToken:
        logger.error("Failed to decrypt credentials - invalid token")
        return {}
    except json.JSONDecodeError:
        logger.error("Failed to parse decrypted credentials as JSON")
        return {}


def is_encrypted(value: dict[str, Any] | None) -> bool:
    """Check if credentials are in encrypted format.

    Args:
        value: Credentials dictionary

    Returns:
        True if credentials are encrypted, False otherwise
    """
    if not isinstance(value, dict):
        return False
    return ENCRYPTED_MARKER in value and VERSION_MARKER in value


def has_credentials(stored: dict[str, Any] | None) -> bool:
    """Check if credentials are configured (encrypted or not).

    Args:
        stored: Stored credentials

    Returns:
        True if credentials exist and are non-empty
    """
    if not stored:
        return False

    if is_encrypted(stored):
        # Has encrypted data
        return bool(stored.get(ENCRYPTED_MARKER))

    # Legacy format - check if there are any real keys
    return len(stored) > 0
