"""Pluggable storage backend for card attachments.

The Protocol exposes the minimal surface the router needs (put, get_url, delete).
Two concrete implementations:

* ``LocalDiskStorage`` — wraps the same UPLOAD_DIR the existing chat-attachment
  flow uses; correct for single-instance dev. Files are returned as direct
  ``/uploads/<key>`` URLs served by the existing ``StaticFiles`` mount.
* ``S3Storage`` — boto3 against any S3-compatible bucket (AWS S3, Cloudflare R2,
  Wasabi, MinIO). ``get_url`` returns a presigned GET; if ``s3_public_base_url``
  is configured we hand out a permanent CDN-style URL instead of presigning.

The router calls ``get_storage()`` per request, so swapping backends is a
config change with no model migration. Uploads from prior runs continue to
resolve through their stored ``storage_key`` against whichever backend is
active — keys produced by LocalDisk and S3 are equivalent strings, just
resolved differently.
"""

from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import Protocol

from ..config import get_settings

logger = logging.getLogger(__name__)


class AttachmentStorage(Protocol):
    async def put(self, content: bytes, *, mime_type: str, suffix: str, prefix: str = "cards") -> str:
        """Persist bytes under ``prefix/`` and return an opaque ``storage_key``."""
        ...

    async def get_url(self, key: str, *, ttl: int = 3600) -> str:
        """Return a URL the client can fetch within ``ttl`` seconds."""
        ...

    async def delete(self, key: str) -> None:
        """Best-effort delete; storage drift never breaks the DB delete."""
        ...


class LocalDiskStorage:
    """Disk-backed storage for dev / single-instance setups.

    Reuses the existing UPLOAD_DIR pattern from routers/attachments.py so the
    same /uploads/* StaticFiles mount serves both chat and card attachments.
    Multi-instance deploys should switch ``attachment_backend`` to ``s3``.
    """

    def __init__(self, base_dir: Path):
        self.base_dir = base_dir
        self.base_dir.mkdir(parents=True, exist_ok=True)

    async def put(self, content: bytes, *, mime_type: str, suffix: str, prefix: str = "cards") -> str:
        # mime_type is unused on disk; included to match the Protocol so callers
        # can be backend-agnostic. Keeping it parametric keeps S3 honest.
        del mime_type
        key = f"{prefix}/{uuid.uuid4().hex}{suffix}"
        path = self.base_dir / key
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_bytes(content)
        return key

    async def get_url(self, key: str, *, ttl: int = 3600) -> str:
        del ttl
        return f"/uploads/{key}"

    async def delete(self, key: str) -> None:
        path = self.base_dir / key
        try:
            path.unlink(missing_ok=True)
        except OSError as exc:
            logger.warning("LocalDiskStorage.delete failed for %s: %s", key, exc)


class S3Storage:
    """boto3-backed S3-compatible storage. Lazy-imports boto3 so dev installs
    that stay on local disk don't need the dep. Returns presigned GETs by
    default; if ``s3_public_base_url`` is configured we emit a permanent URL
    so a CDN can sit in front of the bucket.
    """

    def __init__(
        self,
        bucket: str,
        region: str,
        endpoint_url: str | None,
        access_key_id: str,
        secret_access_key: str,
        public_base_url: str | None,
    ):
        self.bucket = bucket
        self.public_base_url = public_base_url.rstrip("/") if public_base_url else None
        # Defer import so test runs and local-dev installs don't need boto3.
        import boto3  # type: ignore[import-untyped]

        kwargs: dict = {"aws_access_key_id": access_key_id, "aws_secret_access_key": secret_access_key}
        if region:
            kwargs["region_name"] = region
        if endpoint_url:
            kwargs["endpoint_url"] = endpoint_url
        self._client = boto3.client("s3", **kwargs)

    async def put(self, content: bytes, *, mime_type: str, suffix: str, prefix: str = "cards") -> str:
        key = f"{prefix}/{uuid.uuid4().hex}{suffix}"
        # boto3 is sync — we accept the (small) tradeoff of running it inline.
        # Worker-loop blocking only matters for very large uploads and we already
        # cap at 20MB. Switch to aioboto3 if this ever becomes a hotspot.
        self._client.put_object(Bucket=self.bucket, Key=key, Body=content, ContentType=mime_type)
        return key

    async def get_url(self, key: str, *, ttl: int = 3600) -> str:
        if self.public_base_url:
            return f"{self.public_base_url}/{key}"
        return self._client.generate_presigned_url(
            "get_object",
            Params={"Bucket": self.bucket, "Key": key},
            ExpiresIn=ttl,
        )

    async def delete(self, key: str) -> None:
        try:
            self._client.delete_object(Bucket=self.bucket, Key=key)
        except Exception as exc:  # noqa: BLE001 — best-effort
            logger.warning("S3Storage.delete failed for %s: %s", key, exc)


_storage_singleton: AttachmentStorage | None = None


def get_storage() -> AttachmentStorage:
    """Return the configured storage backend. Cached after first build."""
    global _storage_singleton
    if _storage_singleton is not None:
        return _storage_singleton

    settings = get_settings()
    backend = (settings.attachment_backend or "local").strip().lower()

    if backend == "s3":
        if not settings.s3_bucket:
            raise RuntimeError("attachment_backend=s3 but s3_bucket is unset")
        _storage_singleton = S3Storage(
            bucket=settings.s3_bucket,
            region=settings.s3_region,
            endpoint_url=settings.s3_endpoint_url or None,
            access_key_id=settings.s3_access_key_id,
            secret_access_key=settings.s3_secret_access_key,
            public_base_url=settings.s3_public_base_url or None,
        )
    else:
        _storage_singleton = LocalDiskStorage(Path(settings.upload_dir))

    return _storage_singleton


def reset_storage_for_tests() -> None:
    """Pytest fixtures call this after monkey-patching the upload dir."""
    global _storage_singleton
    _storage_singleton = None
