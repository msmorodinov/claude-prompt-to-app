"""R2 (Cloudflare) S3-compatible storage client.

All operations use aioboto3 with credentials from env vars:
  R2_ENDPOINT_URL, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY,
  R2_REGION, R2_KEY_PREFIX, R2_PRESIGNED_URL_TTL

Key validation: validate_key_name() enforces flat namespace, prevents path traversal.
"""
from __future__ import annotations

import mimetypes
import os
import re
from datetime import datetime
from typing import Any, AsyncIterator

import aioboto3
from botocore.config import Config

# ---------------------------------------------------------------------------
# Key validation
# ---------------------------------------------------------------------------

_KEY_RE = re.compile(r'^[a-zA-Z0-9_][a-zA-Z0-9_.\-]*$')


def validate_key_name(name: str) -> str:
    """Validate a flat filename (no slashes). Returns name or raises ValueError."""
    if not name or len(name) > 80:
        raise ValueError(f"Key name must be 1-80 chars, got {len(name)!r}")
    if not _KEY_RE.match(name):
        raise ValueError(
            f"Key name {name!r} contains invalid characters. "
            "Only [a-zA-Z0-9_.-] allowed, must start with alphanumeric/underscore."
        )
    return name


# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

def _get_config() -> dict[str, Any]:
    """Read R2 config from environment (+ .env if python-dotenv available)."""
    try:
        from dotenv import load_dotenv  # type: ignore[import-untyped]
        env_path = os.path.join(os.path.dirname(__file__), ".env")
        if os.path.exists(env_path):
            load_dotenv(env_path)
    except ImportError:
        pass

    return {
        "endpoint_url": os.environ.get("R2_ENDPOINT_URL", ""),
        "bucket": os.environ.get("R2_BUCKET", "prompt2app"),
        "access_key_id": os.environ.get("R2_ACCESS_KEY_ID", ""),
        "secret_access_key": os.environ.get("R2_SECRET_ACCESS_KEY", ""),
        "region": os.environ.get("R2_REGION", "auto"),
        "key_prefix": os.environ.get("R2_KEY_PREFIX", "dev/"),
        "presigned_ttl": int(os.environ.get("R2_PRESIGNED_URL_TTL", "300")),
    }


def _session_cfg() -> dict[str, Any]:
    cfg = _get_config()
    return {
        "aws_access_key_id": cfg["access_key_id"],
        "aws_secret_access_key": cfg["secret_access_key"],
        "endpoint_url": cfg["endpoint_url"],
        "region_name": cfg["region"],
        "config": Config(signature_version="s3v4", retries={"max_attempts": 3}),
    }


def is_configured() -> bool:
    """Return True if required R2 env vars are set."""
    cfg = _get_config()
    return bool(cfg["endpoint_url"] and cfg["access_key_id"] and cfg["secret_access_key"])


# ---------------------------------------------------------------------------
# Core async operations
# ---------------------------------------------------------------------------

async def put_object(key: str, body: bytes, content_type: str | None = None) -> None:
    """Upload bytes to R2. key is the full path (including prefix)."""
    cfg = _get_config()
    if content_type is None:
        guessed, _ = mimetypes.guess_type(key)
        content_type = guessed or "application/octet-stream"

    session = aioboto3.Session()
    async with session.client("s3", **_session_cfg()) as s3:
        await s3.put_object(
            Bucket=cfg["bucket"],
            Key=key,
            Body=body,
            ContentType=content_type,
        )


async def get_object(key: str) -> bytes:
    """Download bytes from R2. Raises if key doesn't exist."""
    cfg = _get_config()
    session = aioboto3.Session()
    async with session.client("s3", **_session_cfg()) as s3:
        resp = await s3.get_object(Bucket=cfg["bucket"], Key=key)
        return await resp["Body"].read()


async def list_prefix(prefix: str) -> list[dict[str, Any]]:
    """List objects under prefix. Returns list of {key, size, last_modified}."""
    cfg = _get_config()
    session = aioboto3.Session()
    results: list[dict[str, Any]] = []
    async with session.client("s3", **_session_cfg()) as s3:
        paginator = s3.get_paginator("list_objects_v2")
        async for page in paginator.paginate(Bucket=cfg["bucket"], Prefix=prefix):
            for obj in page.get("Contents", []):
                results.append({
                    "key": obj["Key"],
                    "size": obj["Size"],
                    "last_modified": obj["LastModified"],
                })
    return results


async def delete_prefix(prefix: str) -> int:
    """Delete all objects under prefix. Returns count deleted."""
    cfg = _get_config()
    objects = await list_prefix(prefix)
    if not objects:
        return 0

    session = aioboto3.Session()
    async with session.client("s3", **_session_cfg()) as s3:
        delete_list = [{"Key": obj["key"]} for obj in objects]
        await s3.delete_objects(
            Bucket=cfg["bucket"],
            Delete={"Objects": delete_list},
        )
    return len(objects)


async def generate_presigned_url(key: str, expires: int | None = None) -> str:
    """Generate presigned GET URL for key. expires defaults to R2_PRESIGNED_URL_TTL."""
    cfg = _get_config()
    ttl = expires if expires is not None else cfg["presigned_ttl"]

    session = aioboto3.Session()
    async with session.client("s3", **_session_cfg()) as s3:
        url = await s3.generate_presigned_url(
            "get_object",
            Params={"Bucket": cfg["bucket"], "Key": key},
            ExpiresIn=ttl,
        )
    return url


# ---------------------------------------------------------------------------
# Higher-level helpers
# ---------------------------------------------------------------------------

def session_prefix(sid: str) -> str:
    """Return the R2 key prefix for a session, e.g. 'dev/sessions/{sid}/'."""
    cfg = _get_config()
    return f"{cfg['key_prefix']}sessions/{sid}/"


def session_key(sid: str, name: str) -> str:
    """Build full R2 key from session id + validated filename."""
    validate_key_name(name)
    return session_prefix(sid) + name


async def ping() -> bool:
    """Health check: can we reach the bucket? Returns True or raises."""
    cfg = _get_config()
    session = aioboto3.Session()
    async with session.client("s3", **_session_cfg()) as s3:
        await s3.head_bucket(Bucket=cfg["bucket"])
    return True


async def ensure_scratchpad(sid: str) -> None:
    """Create scratchpad.md in session prefix if it doesn't exist."""
    key = session_key(sid, "scratchpad.md")
    cfg = _get_config()
    try:
        session = aioboto3.Session()
        async with session.client("s3", **_session_cfg()) as s3:
            await s3.head_object(Bucket=cfg["bucket"], Key=key)
        # Already exists — nothing to do
    except Exception:
        await put_object(key, b"", content_type="text/markdown")


# ---------------------------------------------------------------------------
# ZIP streaming
# ---------------------------------------------------------------------------

MAX_ZIP_BYTES = 50_000_000  # 50 MB hard cap


async def stream_zip_from_prefix(prefix: str, ext_filter: str = ".png") -> AsyncIterator[bytes]:
    """Async generator yielding ZIP bytes for all matching objects under prefix.

    Uses zipstream-ng for streaming (no in-memory BytesIO).
    Aborts with error if total size exceeds MAX_ZIP_BYTES.
    """
    import zipstream  # type: ignore[import-untyped]

    objects = await list_prefix(prefix)
    matching = [o for o in objects if o["key"].endswith(ext_filter)]

    total = sum(o["size"] for o in matching)
    if total > MAX_ZIP_BYTES:
        raise ValueError(
            f"ZIP would be {total // 1_000_000} MB, exceeds {MAX_ZIP_BYTES // 1_000_000} MB limit"
        )

    zs = zipstream.ZipStream(compress_type=zipstream.ZIP_STORED)

    for obj in sorted(matching, key=lambda o: o["key"]):
        name = obj["key"].split("/")[-1]
        data = await get_object(obj["key"])
        zs.add(data, arcname=name)

    async for chunk in zs:
        yield chunk


# ---------------------------------------------------------------------------
# URL rewriting for history payloads
# ---------------------------------------------------------------------------

async def rewrite_media_urls(history: list[dict], sid: str) -> None:
    """In-place rewrite: for carousel widgets, replace 'file' with presigned 'url'.

    Handles image_gallery, image_select, file_download widgets in SSE history.
    """
    cfg = _get_config()
    prefix = session_prefix(sid)

    for message in history:
        payload = message.get("payload", {})
        blocks = payload.get("blocks", []) or payload.get("questions", [])
        for block in blocks:
            widget_type = block.get("type")
            if widget_type in ("image_gallery", "image_select"):
                for img in block.get("images", []):
                    fname = img.get("file")
                    if fname and not img.get("url"):
                        key = f"{prefix}{validate_key_name(fname)}"
                        try:
                            img["url"] = await generate_presigned_url(key)
                        except Exception:
                            pass  # Leave without url — frontend shows placeholder
            elif widget_type == "file_download":
                # file_download uses backend /sessions/{sid}/files.zip — no presign needed
                pass
