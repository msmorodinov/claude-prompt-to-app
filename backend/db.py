"""SQLite persistence for workshop sessions."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import aiosqlite

DB_PATH = Path(__file__).parent / "workshop.db"


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


async def save_session(
    session_id: str,
    title: str | None = None,
    db_path: str | Path = DB_PATH,
) -> None:
    async with aiosqlite.connect(str(db_path)) as db:
        await db.execute(
            "INSERT OR REPLACE INTO sessions (id, title) VALUES (?, ?)",
            (session_id, title),
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


async def get_sessions(db_path: str | Path = DB_PATH) -> list[dict[str, Any]]:
    async with aiosqlite.connect(str(db_path)) as db:
        db.row_factory = aiosqlite.Row
        cursor = await db.execute(
            "SELECT id, created_at, title FROM sessions ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]


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
