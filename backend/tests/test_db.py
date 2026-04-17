"""Tests for SQLite persistence."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from backend.db import (
    create_app,
    delete_session,
    get_all_apps_admin,
    get_all_sessions_admin,
    get_app_by_id,
    get_session,
    get_session_meta,
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
    async def test_migration_v6_removes_app_builder_from_apps(self, db_path):
        """Migration v6 removes App Builder from the apps table (it's now a system mode)."""
        await init_db(db_path)
        import aiosqlite

        db = await aiosqlite.connect(str(db_path))
        db.row_factory = aiosqlite.Row
        try:
            cursor = await db.execute("SELECT slug FROM apps WHERE slug = 'app-builder'")
            row = await cursor.fetchone()
            assert row is None, "app-builder should not be in apps table after migration v6"
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


class TestSessionAppName:
    @pytest.mark.asyncio
    async def test_sessions_include_app_name(self, db_path):
        """get_sessions_by_user should return app_name from joined apps table."""
        await init_db(db_path)
        app_result = await create_app(
            "my-app", "My App Title", "", "Prompt body", db_path=db_path
        )
        app_id = app_result["id"]
        await save_session("sess-a", user_id="user-1", app_id=app_id, db_path=db_path)
        sessions = await get_sessions_by_user("user-1", db_path)
        assert len(sessions) == 1
        assert sessions[0]["app_name"] == "My App Title"
        assert sessions[0]["app_id"] == app_id

    @pytest.mark.asyncio
    async def test_sessions_app_name_null_without_app(self, db_path):
        """Sessions without app_id should have app_name = None."""
        await init_db(db_path)
        await save_session("sess-b", user_id="user-2", db_path=db_path)
        sessions = await get_sessions_by_user("user-2", db_path)
        assert len(sessions) == 1
        assert sessions[0]["app_name"] is None

    @pytest.mark.asyncio
    async def test_admin_sessions_include_app_name(self, db_path):
        """get_all_sessions_admin should return app_name from joined apps table."""
        await init_db(db_path)
        app_result = await create_app(
            "admin-app", "Admin App Title", "", "Prompt body", db_path=db_path
        )
        app_id = app_result["id"]
        await save_session("sess-c", user_id="user-3", app_id=app_id, db_path=db_path)
        sessions = await get_all_sessions_admin(db_path)
        # Filter to just our test session
        our = [s for s in sessions if s["id"] == "sess-c"]
        assert len(our) == 1
        assert our[0]["app_name"] == "Admin App Title"
        assert our[0]["app_id"] == app_id


class TestSessionMode:
    @pytest.mark.asyncio
    async def test_save_session_with_mode(self, tmp_path):
        """save_session persists mode field."""
        db_path = tmp_path / "test.db"
        await init_db(db_path)
        await save_session("s1", user_id="u1", mode="app-builder", db_path=db_path)
        meta = await get_session_meta("s1", db_path=db_path)
        assert meta is not None
        assert meta["mode"] == "app-builder"

    @pytest.mark.asyncio
    async def test_save_session_default_mode(self, tmp_path):
        """save_session defaults mode to 'normal'."""
        db_path = tmp_path / "test.db"
        await init_db(db_path)
        await save_session("s2", user_id="u1", db_path=db_path)
        meta = await get_session_meta("s2", db_path=db_path)
        assert meta is not None
        assert meta["mode"] == "normal"


class TestMigrationV6:
    @pytest.mark.asyncio
    async def test_migration_v6_removes_app_builder(self, tmp_path):
        """Migration v6 removes App Builder from apps, sets mode on its sessions."""
        db_path = tmp_path / "test.db"
        await init_db(db_path)
        apps = await get_all_apps_admin(db_path=db_path)
        slugs = [a["slug"] for a in apps]
        assert "app-builder" not in slugs
        await save_session("test-s", user_id="u1", db_path=db_path)
        meta = await get_session_meta("test-s", db_path=db_path)
        assert meta["mode"] == "normal"


class TestDeleteSession:
    @pytest.mark.asyncio
    async def test_delete_session_removes_session_and_messages(self, db_path):
        await init_db(db_path)
        await save_session("s1", user_id="user1", db_path=db_path)
        await save_message("s1", "user", {"text": "hello"}, db_path=db_path)
        await save_message("s1", "assistant", {"text": "hi"}, db_path=db_path)

        deleted = await delete_session("s1", "user1", db_path=db_path)
        assert deleted is True

        # Session gone — get_session returns messages list, empty after delete
        session = await get_session("s1", db_path=db_path)
        assert session == []

        # Messages gone too
        rows = await get_sessions_by_user("user1", db_path=db_path)
        assert len(rows) == 0

    @pytest.mark.asyncio
    async def test_delete_session_wrong_user(self, db_path):
        await init_db(db_path)
        await save_session("s1", user_id="user1", db_path=db_path)

        deleted = await delete_session("s1", "user2", db_path=db_path)
        assert deleted is False

        # Session still exists — get_sessions_by_user should still return it
        rows = await get_sessions_by_user("user1", db_path=db_path)
        assert len(rows) == 1

    @pytest.mark.asyncio
    async def test_delete_session_not_found(self, db_path):
        await init_db(db_path)

        deleted = await delete_session("nonexistent", "user1", db_path=db_path)
        assert deleted is False


class TestAppModel:
    @pytest.mark.asyncio
    async def test_create_app_default_model_opus(self, db_path):
        from backend.db import create_app, get_app_by_id, init_db as _init
        await _init(db_path)
        result = await create_app(
            "m-default", "Default Model", "", "Prompt", db_path=db_path
        )
        app = await get_app_by_id(result["id"], db_path)
        assert app["model"] == "opus"

    @pytest.mark.asyncio
    async def test_create_app_explicit_sonnet(self, db_path):
        from backend.db import create_app, get_app_by_id, init_db as _init
        await _init(db_path)
        result = await create_app(
            "m-sonnet", "Sonnet App", "", "Prompt", model="sonnet", db_path=db_path
        )
        app = await get_app_by_id(result["id"], db_path)
        assert app["model"] == "sonnet"

    @pytest.mark.asyncio
    async def test_update_app_model(self, db_path):
        from backend.db import create_app, get_app_by_id, init_db as _init, update_app
        await _init(db_path)
        result = await create_app(
            "m-update", "Update Me", "", "Prompt", db_path=db_path
        )
        await update_app(result["id"], model="sonnet", db_path=db_path)
        app = await get_app_by_id(result["id"], db_path)
        assert app["model"] == "sonnet"

    @pytest.mark.asyncio
    async def test_validate_app_fields_rejects_invalid_model(self):
        from backend.db import validate_app_fields
        errors = validate_app_fields(model="gpt-5")
        assert any("model must be one of" in e for e in errors)

    @pytest.mark.asyncio
    async def test_validate_app_fields_accepts_opus_and_sonnet(self):
        from backend.db import validate_app_fields
        assert validate_app_fields(model="opus") == []
        assert validate_app_fields(model="sonnet") == []

    @pytest.mark.asyncio
    async def test_get_active_apps_includes_model(self, db_path):
        from backend.db import create_app, get_active_apps, init_db as _init
        await _init(db_path)
        await create_app("m-active", "Active", "", "Prompt", model="sonnet", db_path=db_path)
        apps = await get_active_apps(db_path)
        slugs = {a["slug"]: a["model"] for a in apps}
        assert slugs.get("m-active") == "sonnet"

    @pytest.mark.asyncio
    async def test_config_returns_model(self, db_path):
        from backend.db import create_app, get_app_config_from_db, init_db as _init
        await _init(db_path)
        result = await create_app(
            "m-cfg", "Cfg", "Sub", "Prompt", model="sonnet", db_path=db_path
        )
        cfg = await get_app_config_from_db(result["id"], db_path)
        assert cfg["model"] == "sonnet"
        assert cfg["title"] == "Cfg"
