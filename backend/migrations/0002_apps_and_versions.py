"""Create apps, prompt_versions tables; add session columns; seed default app."""

from __future__ import annotations

from pathlib import Path

import aiosqlite

VERSION = 2


async def _column_exists(db: aiosqlite.Connection, table: str, column: str) -> bool:
    cursor = await db.execute(f"PRAGMA table_info({table})")
    cols = await cursor.fetchall()
    return any(c[1] == column for c in cols)


async def up(db: aiosqlite.Connection) -> None:
    await db.execute("""
        CREATE TABLE IF NOT EXISTS apps (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            slug TEXT UNIQUE NOT NULL COLLATE NOCASE,
            title TEXT NOT NULL,
            subtitle TEXT DEFAULT '',
            is_active INTEGER DEFAULT 1 CHECK (is_active IN (0, 1)),
            current_version_id INTEGER,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)
    await db.execute("""
        CREATE TABLE IF NOT EXISTS prompt_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            app_id INTEGER NOT NULL,
            body TEXT NOT NULL,
            change_note TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (app_id) REFERENCES apps(id)
        )
    """)

    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_prompt_versions_app_id ON prompt_versions(app_id)"
    )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)"
    )

    if not await _column_exists(db, "sessions", "app_id"):
        await db.execute(
            "ALTER TABLE sessions ADD COLUMN app_id INTEGER DEFAULT NULL"
        )
    if not await _column_exists(db, "sessions", "prompt_version_id"):
        await db.execute(
            "ALTER TABLE sessions ADD COLUMN prompt_version_id INTEGER DEFAULT NULL"
        )
    await db.execute(
        "CREATE INDEX IF NOT EXISTS idx_sessions_app_id ON sessions(app_id)"
    )

    from backend.prompt_config import load_prompt

    prompt_path = Path(__file__).parents[1] / "prompt.md"
    if prompt_path.exists():
        meta, body = load_prompt()
        title = meta.get("title", "Default App")
        subtitle = meta.get("subtitle", "")
    else:
        title, subtitle, body = "Default App", "", "You are a helpful assistant."

    await db.execute(
        "INSERT OR IGNORE INTO apps (slug, title, subtitle) VALUES (?, ?, ?)",
        ("default", title, subtitle),
    )
    cursor = await db.execute(
        "SELECT id, current_version_id FROM apps WHERE slug = 'default'"
    )
    default_app = await cursor.fetchone()
    if default_app and default_app[1] is None:
        app_id = default_app[0]
        await db.execute(
            "INSERT INTO prompt_versions (app_id, body, change_note) VALUES (?, ?, ?)",
            (app_id, body, "Seeded from prompt.md"),
        )
        ver_row = await (await db.execute("SELECT last_insert_rowid()")).fetchone()
        version_id = ver_row[0]
        await db.execute(
            "UPDATE apps SET current_version_id = ? WHERE id = ?",
            (version_id, app_id),
        )
        await db.execute(
            "UPDATE sessions SET app_id = ?, prompt_version_id = ? WHERE app_id IS NULL",
            (app_id, version_id),
        )


async def down(db: aiosqlite.Connection) -> None:
    pass
