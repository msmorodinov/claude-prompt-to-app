"""Tests for SQLite persistence."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from backend.db import (
    create_app,
    get_app_by_id,
    get_session,
    get_sessions_by_user,
    init_db,
    save_message,
    save_session,
    update_session_title,
)


@pytest.fixture
def db_path():
    """Create a temporary database file for each test."""
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        return Path(f.name)


class TestDatabase:
    @pytest.mark.asyncio
    async def test_init_creates_tables(self, db_path):
        await init_db(db_path)
        # Second init should not fail (IF NOT EXISTS)
        await init_db(db_path)

    @pytest.mark.asyncio
    async def test_save_and_get_session(self, db_path):
        await init_db(db_path)
        await save_session("sess-1", user_id="user-1", title="Test Workshop", db_path=db_path)
        sessions = await get_sessions_by_user("user-1", db_path)
        assert len(sessions) == 1
        assert sessions[0]["id"] == "sess-1"
        assert sessions[0]["title"] == "Test Workshop"

    @pytest.mark.asyncio
    async def test_save_message_and_get(self, db_path):
        await init_db(db_path)
        await save_session("sess-1", db_path=db_path)
        await save_message("sess-1", "user", {"text": "hello"}, db_path)
        await save_message(
            "sess-1", "assistant", {"blocks": [{"type": "text"}]}, db_path
        )
        messages = await get_session("sess-1", db_path)
        assert len(messages) == 2
        assert messages[0]["role"] == "user"
        assert messages[0]["content"] == {"text": "hello"}
        assert messages[1]["role"] == "assistant"

    @pytest.mark.asyncio
    async def test_get_sessions_returns_list(self, db_path):
        await init_db(db_path)
        await save_session("sess-1", user_id="user-1", title="First", db_path=db_path)
        await save_session("sess-2", user_id="user-1", title="Second", db_path=db_path)
        sessions = await get_sessions_by_user("user-1", db_path)
        assert len(sessions) == 2
        ids = {s["id"] for s in sessions}
        assert "sess-1" in ids
        assert "sess-2" in ids

    @pytest.mark.asyncio
    async def test_get_sessions_includes_status_and_count(self, db_path):
        await init_db(db_path)
        await save_session("sess-1", user_id="user-1", db_path=db_path)
        sessions = await get_sessions_by_user("user-1", db_path)
        assert "status" in sessions[0]
        assert "message_count" in sessions[0]

    @pytest.mark.asyncio
    async def test_get_session_empty(self, db_path):
        await init_db(db_path)
        messages = await get_session("nonexistent", db_path)
        assert messages == []

    @pytest.mark.asyncio
    async def test_messages_ordered_by_insert(self, db_path):
        await init_db(db_path)
        await save_session("sess-1", db_path=db_path)
        await save_message("sess-1", "user", {"text": "first"}, db_path)
        await save_message("sess-1", "assistant", {"text": "second"}, db_path)
        await save_message("sess-1", "user", {"text": "third"}, db_path)
        messages = await get_session("sess-1", db_path)
        assert [m["content"]["text"] for m in messages] == [
            "first",
            "second",
            "third",
        ]

    @pytest.mark.asyncio
    async def test_update_session_title(self, db_path):
        await init_db(db_path)
        await save_session("sess-1", user_id="user-1", db_path=db_path)
        await update_session_title("sess-1", "Auto Title", db_path)
        sessions = await get_sessions_by_user("user-1", db_path)
        assert sessions[0]["title"] == "Auto Title"

    @pytest.mark.asyncio
    async def test_update_session_title_does_not_overwrite(self, db_path):
        await init_db(db_path)
        await save_session("sess-1", user_id="user-1", title="Original", db_path=db_path)
        await update_session_title("sess-1", "Should Not Overwrite", db_path)
        sessions = await get_sessions_by_user("user-1", db_path)
        assert sessions[0]["title"] == "Original"

    @pytest.mark.asyncio
    async def test_sessions_filtered_by_user(self, db_path):
        await init_db(db_path)
        await save_session("sess-1", user_id="user-1", db_path=db_path)
        await save_session("sess-2", user_id="user-2", db_path=db_path)
        sessions = await get_sessions_by_user("user-1", db_path)
        assert len(sessions) == 1
        assert sessions[0]["id"] == "sess-1"


class TestAppCrud:
    @pytest.mark.asyncio
    async def test_migration_seeds_app_builder(self, db_path):
        await init_db(db_path)
        import aiosqlite

        db = await aiosqlite.connect(str(db_path))
        db.row_factory = aiosqlite.Row
        try:
            cursor = await db.execute("SELECT slug, is_active FROM apps WHERE slug = 'app-builder'")
            row = await cursor.fetchone()
            assert row is not None
            assert row["slug"] == "app-builder"
            assert row["is_active"] == 1
        finally:
            await db.close()

    @pytest.mark.asyncio
    async def test_create_app_inactive(self, db_path):
        await init_db(db_path)
        result = await create_app(
            "test-inactive", "Test Inactive", "sub", "Prompt body",
            is_active=False, db_path=db_path,
        )
        app = await get_app_by_id(result["id"], db_path)
        assert app is not None
        assert app["is_active"] == 0

    @pytest.mark.asyncio
    async def test_create_app_active_by_default(self, db_path):
        await init_db(db_path)
        result = await create_app(
            "test-active", "Test Active", "sub", "Prompt body",
            db_path=db_path,
        )
        app = await get_app_by_id(result["id"], db_path)
        assert app is not None
        assert app["is_active"] == 1
