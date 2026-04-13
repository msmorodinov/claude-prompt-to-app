"""Add users table for email + PIN authentication."""

from __future__ import annotations

import aiosqlite

VERSION = 7


async def up(db: aiosqlite.Connection) -> None:
    await db.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id TEXT PRIMARY KEY,
            email TEXT UNIQUE NOT NULL COLLATE NOCASE,
            pin_hash TEXT NOT NULL,
            token TEXT UNIQUE NOT NULL,
            is_admin INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (datetime('now'))
        )
    """)
    await db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email ON users(email)"
    )
    await db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_users_token ON users(token)"
    )


async def down(db: aiosqlite.Connection) -> None:
    pass
