"""Add type column to apps table and seed Steve Jobs persona."""

from __future__ import annotations

from pathlib import Path

import aiosqlite

VERSION = 8


async def _column_exists(db: aiosqlite.Connection, table: str, column: str) -> bool:
    cursor = await db.execute(f"PRAGMA table_info({table})")
    cols = await cursor.fetchall()
    return any(c[1] == column for c in cols)


async def up(db: aiosqlite.Connection) -> None:
    if not await _column_exists(db, "apps", "type"):
        await db.execute(
            "ALTER TABLE apps ADD COLUMN type TEXT NOT NULL DEFAULT 'app' "
            "CHECK (type IN ('app', 'persona'))"
        )

    # Seed Steve Jobs persona from file
    persona_path = Path(__file__).parents[1] / "personas" / "steve-jobs.md"
    if persona_path.exists():
        body = persona_path.read_text()
        # Check if already seeded
        cursor = await db.execute(
            "SELECT id FROM apps WHERE slug = 'steve-jobs'"
        )
        if not await cursor.fetchone():
            await db.execute(
                "INSERT INTO apps (slug, title, subtitle, is_active, type) "
                "VALUES (?, ?, ?, 1, 'persona')",
                ("steve-jobs", "Steve Jobs", "Product visionary & design perfectionist"),
            )
            row = await (await db.execute("SELECT last_insert_rowid()")).fetchone()
            app_id = row[0]

            await db.execute(
                "INSERT INTO prompt_versions (app_id, body, change_note) "
                "VALUES (?, ?, ?)",
                (app_id, body, "Initial preset persona"),
            )
            ver_row = await (await db.execute("SELECT last_insert_rowid()")).fetchone()
            version_id = ver_row[0]

            await db.execute(
                "UPDATE apps SET current_version_id = ? WHERE id = ?",
                (version_id, app_id),
            )


async def down(db: aiosqlite.Connection) -> None:
    pass
