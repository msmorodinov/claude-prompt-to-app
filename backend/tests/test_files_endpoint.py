"""Tests for /sessions/{sid}/files and /sessions/{sid}/files.zip endpoints."""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, patch

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient

from backend.auth import create_user, generate_token, hash_pin
from backend.db import init_db, save_session
from backend.server import app, sessions


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest_asyncio.fixture
async def auth_client():
    """HTTP client with a real DB (shared with conftest pattern)."""
    await init_db()
    transport = ASGITransport(app=app)
    async with AsyncClient(transport=transport, base_url="http://test") as c:
        yield c


@pytest_asyncio.fixture
async def owner_user():
    """Create a regular user with unique email per test run."""
    await init_db()
    token = generate_token()
    uid = uuid.uuid4().hex[:8]
    user = await create_user(
        email=f"owner-{uid}@test.com",
        pin_hash=hash_pin("1234"),
        token=token,
        is_admin=False,
    )
    user["token"] = token
    return user


@pytest_asyncio.fixture
async def other_user():
    """Create a second regular user with unique email per test run."""
    await init_db()
    token = generate_token()
    uid = uuid.uuid4().hex[:8]
    user = await create_user(
        email=f"other-{uid}@test.com",
        pin_hash=hash_pin("5678"),
        token=token,
        is_admin=False,
    )
    user["token"] = token
    return user


@pytest_asyncio.fixture
async def admin_user():
    """Create an admin user with unique email per test run."""
    await init_db()
    token = generate_token()
    uid = uuid.uuid4().hex[:8]
    user = await create_user(
        email=f"admin-{uid}@test.com",
        pin_hash=hash_pin("9999"),
        token=token,
        is_admin=True,
    )
    user["token"] = token
    return user


@pytest_asyncio.fixture
async def carousel_session(owner_user):
    """Create a carousel session owned by owner_user."""
    await init_db()
    s = sessions.create(user_id=owner_user["id"], mode="carousel")
    await save_session(s.session_id, user_id=owner_user["id"], mode="carousel")
    yield s
    sessions.remove(s.session_id)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

_FAKE_OBJECTS = [
    {
        "key": "dev/sessions/SID/slide_01.png",
        "size": 90000,
        "last_modified": datetime(2026, 4, 22, 12, 0, 0, tzinfo=timezone.utc),
    },
    {
        "key": "dev/sessions/SID/slide_02.png",
        "size": 90450,
        "last_modified": datetime(2026, 4, 22, 12, 1, 0, tzinfo=timezone.utc),
    },
]


def _patched_objects(sid: str) -> list[dict]:
    return [
        {**o, "key": o["key"].replace("SID", sid)}
        for o in _FAKE_OBJECTS
    ]


# ---------------------------------------------------------------------------
# Tests: GET /sessions/{sid}/files
# ---------------------------------------------------------------------------


class TestListFiles:
    @pytest.mark.asyncio
    async def test_list_files_owner_200(self, auth_client, owner_user, carousel_session):
        """Owner gets a valid file listing."""
        sid = carousel_session.session_id
        objs = _patched_objects(sid)

        with patch("backend.storage_r2.list_prefix", new=AsyncMock(return_value=objs)):
            resp = await auth_client.get(
                f"/sessions/{sid}/files",
                headers={"Authorization": f"Bearer {owner_user['token']}"},
            )

        assert resp.status_code == 200, resp.text
        data = resp.json()
        assert data["count"] == 2
        assert data["total_size"] == 180450
        names = [f["name"] for f in data["files"]]
        assert "slide_01.png" in names
        assert "slide_02.png" in names

    @pytest.mark.asyncio
    async def test_list_files_non_owner_403(self, auth_client, other_user, carousel_session):
        """Non-owner gets 403."""
        sid = carousel_session.session_id
        with patch("backend.storage_r2.list_prefix", new=AsyncMock(return_value=[])):
            resp = await auth_client.get(
                f"/sessions/{sid}/files",
                headers={"Authorization": f"Bearer {other_user['token']}"},
            )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_list_files_admin_200(self, auth_client, admin_user, carousel_session):
        """Admin can see any session's files."""
        sid = carousel_session.session_id
        objs = _patched_objects(sid)

        with patch("backend.storage_r2.list_prefix", new=AsyncMock(return_value=objs)):
            resp = await auth_client.get(
                f"/sessions/{sid}/files",
                headers={"Authorization": f"Bearer {admin_user['token']}"},
            )
        assert resp.status_code == 200
        assert resp.json()["count"] == 2

    @pytest.mark.asyncio
    async def test_list_files_not_found_404(self, auth_client, owner_user):
        """Non-existent session returns 404."""
        resp = await auth_client.get(
            "/sessions/doesnotexist/files",
            headers={"Authorization": f"Bearer {owner_user['token']}"},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_list_files_unauthenticated_401(self, auth_client, carousel_session):
        """No token → 401."""
        sid = carousel_session.session_id
        resp = await auth_client.get(f"/sessions/{sid}/files")
        assert resp.status_code == 401


# ---------------------------------------------------------------------------
# Tests: GET /sessions/{sid}/files.zip
# ---------------------------------------------------------------------------


async def _fake_zip_gen():
    yield b"PK"  # minimal fake zip content


class TestZipDownload:
    @pytest.mark.asyncio
    async def test_zip_download_owner_200(self, auth_client, owner_user, carousel_session):
        """Owner gets a ZIP with correct headers."""
        sid = carousel_session.session_id
        objs = _patched_objects(sid)

        with (
            patch("backend.storage_r2.list_prefix", new=AsyncMock(return_value=objs)),
            patch(
                "backend.storage_r2.stream_zip_from_prefix",
                return_value=_fake_zip_gen(),
            ),
        ):
            resp = await auth_client.get(
                f"/sessions/{sid}/files.zip",
                headers={"Authorization": f"Bearer {owner_user['token']}"},
            )

        assert resp.status_code == 200
        assert "application/zip" in resp.headers.get("content-type", "")
        assert f"carousel-{sid}.zip" in resp.headers.get("content-disposition", "")

    @pytest.mark.asyncio
    async def test_zip_respects_max_bytes(self, auth_client, owner_user, carousel_session):
        """Files exceeding MAX_ZIP_BYTES cap return 413."""
        import backend.storage_r2 as storage_r2

        sid = carousel_session.session_id
        big_objects = [
            {
                "key": f"dev/sessions/{sid}/slide_01.png",
                "size": storage_r2.MAX_ZIP_BYTES + 1,
                "last_modified": datetime(2026, 4, 22, tzinfo=timezone.utc),
            }
        ]

        with patch("backend.storage_r2.list_prefix", new=AsyncMock(return_value=big_objects)):
            resp = await auth_client.get(
                f"/sessions/{sid}/files.zip",
                headers={"Authorization": f"Bearer {owner_user['token']}"},
            )

        assert resp.status_code == 413

    @pytest.mark.asyncio
    async def test_zip_non_owner_403(self, auth_client, other_user, carousel_session):
        """Non-owner cannot download ZIP."""
        sid = carousel_session.session_id
        with patch("backend.storage_r2.list_prefix", new=AsyncMock(return_value=[])):
            resp = await auth_client.get(
                f"/sessions/{sid}/files.zip",
                headers={"Authorization": f"Bearer {other_user['token']}"},
            )
        assert resp.status_code == 403
