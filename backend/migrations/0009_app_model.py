"""Add model column to apps table (opus|sonnet, default opus)."""

from __future__ import annotations

import aiosqlite

VERSION = 9


async def _column_exists(db: aiosqlite.Connection, table: str, column: str) -> bool:
    cursor = await db.execute(f"PRAGMA table_info({table})")
    cols = await cursor.fetchall()
    return any(c[1] == column for c in cols)


async def up(db: aiosqlite.Connection) -> None:
    if not await _column_exists(db, "apps", "model"):
        await db.execute(
            "ALTER TABLE apps ADD COLUMN model TEXT NOT NULL DEFAULT 'opus'"
        )


async def down(db: aiosqlite.Connection) -> None:
    pass
