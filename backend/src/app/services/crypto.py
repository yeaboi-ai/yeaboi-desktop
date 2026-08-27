"""AES-256-GCM encryption for BYOK API keys.

Keys are encrypted before DB write and decrypted on read.
The encryption secret comes from the AI_KEY_ENCRYPTION_SECRET env var.
"""

import base64
import logging
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

logger = logging.getLogger(__name__)


def _get_key() -> bytes:
    """Return the 32-byte encryption key from env, or a dev fallback."""
    secret = os.getenv("AI_KEY_ENCRYPTION_SECRET", "dev-encryption-key-change-in-prod!")
    # Ensure exactly 32 bytes (SHA-256 of the secret)
    import hashlib

    return hashlib.sha256(secret.encode()).digest()


def encrypt_api_key(plaintext: str) -> str:
    """Encrypt an API key. Returns base64(nonce + ciphertext)."""
    key = _get_key()
    aesgcm = AESGCM(key)
    nonce = os.urandom(12)  # 96-bit nonce for GCM
    ciphertext = aesgcm.encrypt(nonce, plaintext.encode(), None)
    return base64.b64encode(nonce + ciphertext).decode()


def decrypt_api_key(encrypted: str) -> str:
    """Decrypt an API key from base64(nonce + ciphertext)."""
    key = _get_key()
    raw = base64.b64decode(encrypted)
    nonce = raw[:12]
    ciphertext = raw[12:]
    aesgcm = AESGCM(key)
    return aesgcm.decrypt(nonce, ciphertext, None).decode()


def mask_api_key(key: str) -> str:
    """Mask an API key for display: sk-ant-...****"""
    if not key or len(key) < 8:
        return "****"
    return key[:7] + "..." + "****"
