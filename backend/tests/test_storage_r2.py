"""Tests for storage_r2 module.

Tests that require live R2 connection are skipped when R2_ENDPOINT_URL is not set
or when the SKIP_R2_TESTS env var is set (CI without credentials).
"""
from __future__ import annotations

import os
import uuid

import pytest

from backend.storage_r2 import validate_key_name, is_configured, session_prefix, session_key

# ---------------------------------------------------------------------------
# Unit tests (no R2 connection needed)
# ---------------------------------------------------------------------------


class TestValidateKeyName:
    def test_valid_names(self):
        assert validate_key_name("slide_01.html") == "slide_01.html"
        assert validate_key_name("slide_01.png") == "slide_01.png"
        assert validate_key_name("scratchpad.md") == "scratchpad.md"
        assert validate_key_name("file123") == "file123"
        assert validate_key_name("a") == "a"

    def test_reject_path_traversal(self):
        with pytest.raises(ValueError):
            validate_key_name("../etc/passwd")

    def test_reject_slash(self):
        with pytest.raises(ValueError):
            validate_key_name("sessions/slide_01.html")

    def test_reject_empty(self):
        with pytest.raises(ValueError):
            validate_key_name("")

    def test_reject_too_long(self):
        with pytest.raises(ValueError):
            validate_key_name("a" * 81)

    def test_reject_leading_dash(self):
        with pytest.raises(ValueError):
            validate_key_name("-slide.html")

    def test_reject_spaces(self):
        with pytest.raises(ValueError):
            validate_key_name("my slide.html")

    def test_reject_null_byte(self):
        with pytest.raises(ValueError):
            validate_key_name("slide\x00.html")


class TestSessionPrefix:
    def test_uses_env_prefix(self, monkeypatch):
        monkeypatch.setenv("R2_KEY_PREFIX", "dev/")
        sid = "abc123"
        assert session_prefix(sid) == "dev/sessions/abc123/"

    def test_session_key(self, monkeypatch):
        monkeypatch.setenv("R2_KEY_PREFIX", "prod/")
        assert session_key("sid1", "slide_01.html") == "prod/sessions/sid1/slide_01.html"

    def test_session_key_rejects_traversal(self, monkeypatch):
        monkeypatch.setenv("R2_KEY_PREFIX", "dev/")
        with pytest.raises(ValueError):
            session_key("sid1", "../other-session/file.html")


# ---------------------------------------------------------------------------
# Integration tests (require R2 connection)
# ---------------------------------------------------------------------------

def _r2_available() -> bool:
    if os.environ.get("SKIP_R2_TESTS"):
        return False
    return is_configured()


r2_skip = pytest.mark.skipif(not _r2_available(), reason="R2 not configured or SKIP_R2_TESTS set")


@r2_skip
@pytest.mark.asyncio
async def test_r2_ping():
    from backend.storage_r2 import ping
    result = await ping()
    assert result is True


@r2_skip
@pytest.mark.asyncio
async def test_r2_put_get_delete():
    from backend.storage_r2 import put_object, get_object, list_prefix, delete_prefix

    sid = f"test-{uuid.uuid4().hex[:8]}"
    prefix = f"dev/sessions/{sid}/"
    key = f"{prefix}hello.txt"

    try:
        await put_object(key, b"hello world", content_type="text/plain")
        data = await get_object(key)
        assert data == b"hello world"

        objects = await list_prefix(prefix)
        assert any(o["key"] == key for o in objects)
    finally:
        await delete_prefix(prefix)

    # Verify deleted
    objects = await list_prefix(prefix)
    assert len(objects) == 0


@r2_skip
@pytest.mark.asyncio
async def test_r2_presigned_url():
    from backend.storage_r2 import put_object, generate_presigned_url, delete_prefix

    sid = f"test-{uuid.uuid4().hex[:8]}"
    prefix = f"dev/sessions/{sid}/"
    key = f"{prefix}test.txt"

    try:
        await put_object(key, b"presign test", content_type="text/plain")
        url = await generate_presigned_url(key, expires=60)
        assert url.startswith("https://")
        assert "X-Amz-Signature" in url or "x-amz-signature" in url.lower()
    finally:
        await delete_prefix(prefix)


@r2_skip
@pytest.mark.asyncio
async def test_r2_list_empty_prefix():
    from backend.storage_r2 import list_prefix

    objects = await list_prefix("dev/sessions/nonexistent-prefix-xyz/")
    assert objects == []
