"""SQLite persistence for sessions."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import aiosqlite

DB_PATH = Path(__file__).parent / "sessions.db"


async def init_db(db_path: str | Path = DB_PATH) -> None:
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
        await db.commit()
        await _migrate(db)


async def _migrate(db: aiosqlite.Connection) -> None:
    row = await (await db.execute("PRAGMA user_version")).fetchone()
    version = row[0] if row else 0

    if version < 1:
        # Add user_id, status, message_count columns to sessions
        await db.execute(
            "ALTER TABLE sessions ADD COLUMN user_id TEXT DEFAULT 'anonymous'"
        )
        await db.execute(
            "ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'idle'"
        )
        await db.execute(
            "ALTER TABLE sessions ADD COLUMN message_count INTEGER DEFAULT 0"
        )
        await db.execute("PRAGMA user_version = 1")
        await db.commit()


async def save_session(
    session_id: str,
    user_id: str = "anonymous",
    title: str | None = None,
    db_path: str | Path = DB_PATH,
) -> None:
    async with aiosqlite.connect(str(db_path)) as db:
        await db.execute(
            "INSERT OR REPLACE INTO sessions (id, user_id, title) VALUES (?, ?, ?)",
            (session_id, user_id, title),
        )
        await db.commit()


async def update_session_status(
    session_id: str,
    status: str,
    db_path: str | Path = DB_PATH,
) -> None:
    async with aiosqlite.connect(str(db_path)) as db:
        await db.execute(
            "UPDATE sessions SET status = ? WHERE id = ?",
            (status, session_id),
        )
        await db.commit()


async def increment_message_count(
    session_id: str,
    db_path: str | Path = DB_PATH,
) -> None:
    async with aiosqlite.connect(str(db_path)) as db:
        await db.execute(
            "UPDATE sessions SET message_count = message_count + 1 WHERE id = ?",
            (session_id,),
        )
        await db.commit()


async def save_message(
    session_id: str,
    role: str,
    content: dict[str, Any],
    db_path: str | Path = DB_PATH,
) -> None:
    async with aiosqlite.connect(str(db_path)) as db:
        await db.execute(
            "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
            (session_id, role, json.dumps(content)),
        )
        await db.commit()


async def update_session_title(
    session_id: str, title: str, db_path: str | Path = DB_PATH
) -> None:
    async with aiosqlite.connect(str(db_path)) as db:
        await db.execute(
            "UPDATE sessions SET title = ? WHERE id = ? AND (title IS NULL OR title = '')",
            (title, session_id),
        )
        await db.commit()


async def get_sessions_by_user(
    user_id: str, db_path: str | Path = DB_PATH
) -> list[dict[str, Any]]:
    async with aiosqlite.connect(str(db_path)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, created_at, title, status, message_count "
            "FROM sessions WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_all_sessions_admin(
    db_path: str | Path = DB_PATH,
) -> list[dict[str, Any]]:
    async with aiosqlite.connect(str(db_path)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, user_id, status, message_count, created_at, title "
            "FROM sessions ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


async def get_session_owner(
    session_id: str, db_path: str | Path = DB_PATH
) -> str | None:
    async with aiosqlite.connect(str(db_path)) as db:
        cursor = await db.execute(
            "SELECT user_id FROM sessions WHERE id = ?", (session_id,)
        )
        row = await cursor.fetchone()
        return row[0] if row else None


async def get_session(
    session_id: str, db_path: str | Path = DB_PATH
) -> list[dict[str, Any]]:
    async with aiosqlite.connect(str(db_path)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT role, content, created_at FROM messages WHERE session_id = ? ORDER BY id",
            (session_id,),
        )
        rows = await cursor.fetchall()
        return [
            {
                "role": row["role"],
                "content": json.loads(row["content"]),
                "created_at": row["created_at"],
            }
            for row in rows
        ]
