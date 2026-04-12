"""Tests for the migration runner."""

from __future__ import annotations

import pytest
import aiosqlite

from backend.migrate import get_current_version, run_migrations


@pytest.mark.asyncio
async def test_get_current_version_fresh_db(tmp_path):
    db_path = tmp_path / "test.db"
    async with aiosqlite.connect(str(db_path)) as db:
        version = await get_current_version(db)
        assert version == 0


@pytest.mark.asyncio
async def test_get_current_version_after_set(tmp_path):
    db_path = tmp_path / "test.db"
    async with aiosqlite.connect(str(db_path)) as db:
        await db.execute("PRAGMA user_version = 5")
        version = await get_current_version(db)
        assert version == 5


@pytest.mark.asyncio
async def test_run_migrations_applies_pending(tmp_path):
    """run_migrations applies all migrations from 0 to current max."""
    db_path = tmp_path / "test.db"
    async with aiosqlite.connect(str(db_path)) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                title TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        await db.commit()

        applied = await run_migrations(db)
        assert applied >= 6

        version = await get_current_version(db)
        assert version >= 6


@pytest.mark.asyncio
async def test_run_migrations_idempotent(tmp_path):
    """Running migrations twice applies zero the second time."""
    db_path = tmp_path / "test.db"
    async with aiosqlite.connect(str(db_path)) as db:
        await db.execute("""
            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                title TEXT
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
        """)
        await db.execute("""
            CREATE TABLE IF NOT EXISTS system_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        await db.commit()

        applied1 = await run_migrations(db)
        assert applied1 >= 6

        applied2 = await run_migrations(db)
        assert applied2 == 0


@pytest.mark.asyncio
async def test_run_migrations_skips_already_applied(tmp_path):
    """DB at version 5 only applies migration 6+."""
    db_path = tmp_path / "test.db"
    async with aiosqlite.connect(str(db_path)) as db:
        await db.execute("""
            CREATE TABLE sessions (
                id TEXT PRIMARY KEY,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                title TEXT,
                user_id TEXT DEFAULT 'anonymous',
                status TEXT DEFAULT 'idle',
                message_count INTEGER DEFAULT 0,
                app_id INTEGER DEFAULT NULL,
                prompt_version_id INTEGER DEFAULT NULL,
                user_display_name TEXT DEFAULT NULL,
                sdk_session_id TEXT DEFAULT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                session_id TEXT NOT NULL,
                role TEXT NOT NULL,
                content TEXT NOT NULL,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (session_id) REFERENCES sessions(id)
            )
        """)
        await db.execute("""
            CREATE TABLE system_config (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)
        await db.execute("""
            CREATE TABLE apps (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                slug TEXT UNIQUE NOT NULL COLLATE NOCASE,
                title TEXT NOT NULL,
                subtitle TEXT DEFAULT '',
                is_active INTEGER DEFAULT 1,
                current_version_id INTEGER,
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
            )
        """)
        await db.execute("""
            CREATE TABLE prompt_versions (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                app_id INTEGER NOT NULL,
                body TEXT NOT NULL,
                change_note TEXT DEFAULT '',
                created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (app_id) REFERENCES apps(id)
            )
        """)
        await db.execute("PRAGMA user_version = 5")
        await db.commit()

        applied = await run_migrations(db)
        assert applied == 1

        version = await get_current_version(db)
        assert version == 6
