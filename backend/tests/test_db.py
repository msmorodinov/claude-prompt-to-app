"""Tests for SQLite persistence."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from backend.db import get_session, get_sessions, init_db, save_message, save_session


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
        await save_session("sess-1", "Test Workshop", db_path)
        sessions = await get_sessions(db_path)
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
        await save_session("sess-1", "First", db_path)
        await save_session("sess-2", "Second", db_path)
        sessions = await get_sessions(db_path)
        assert len(sessions) == 2
        ids = {s["id"] for s in sessions}
        assert "sess-1" in ids
        assert "sess-2" in ids

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
