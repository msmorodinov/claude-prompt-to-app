"""Seed carousel-designer app from personas/carousel-design-system.md."""

from __future__ import annotations

import logging
import os
from pathlib import Path

import aiosqlite

VERSION = 10

logger = logging.getLogger(__name__)

_SEED_FILE = Path(__file__).parent.parent / "personas" / "carousel-design-system.md"


async def up(db: aiosqlite.Connection) -> None:
    # Guard: require seed file unless stub migrations are explicitly allowed
    if not _SEED_FILE.exists():
        allow_stub = os.environ.get("FORGE_ALLOW_STUB_MIGRATIONS", "")
        if allow_stub != "1":
            raise RuntimeError(
                f"Required seed file missing: {_SEED_FILE}. "
                "Set FORGE_ALLOW_STUB_MIGRATIONS=1 to skip (dev/test only)."
            )
        logger.warning("Seed file missing but FORGE_ALLOW_STUB_MIGRATIONS=1 — skipping carousel seed")
        return

    body = _SEED_FILE.read_text(encoding="utf-8")

    # Idempotent: only insert if slug doesn't exist
    cursor = await db.execute("SELECT id FROM apps WHERE slug = ?", ("carousel-designer",))
    existing = await cursor.fetchone()
    if existing:
        logger.info("carousel-designer app already exists (id=%d), skipping seed", existing[0])
        return

    # Insert app
    await db.execute(
        "INSERT INTO apps (slug, title, subtitle, is_active, type, model) VALUES (?, ?, ?, ?, ?, ?)",
        (
            "carousel-designer",
            "Instagram Carousel Designer",
            "Professional carousels — stop the scroll",
            1,
            "app",
            "opus",
        ),
    )
    app_row = await (await db.execute("SELECT last_insert_rowid()")).fetchone()
    app_id = app_row[0]

    # Insert first prompt version
    await db.execute(
        "INSERT INTO prompt_versions (app_id, body, change_note) VALUES (?, ?, ?)",
        (app_id, body, "Initial seed from carousel-design-system.md"),
    )
    ver_row = await (await db.execute("SELECT last_insert_rowid()")).fetchone()
    version_id = ver_row[0]

    # Link version to app
    await db.execute(
        "UPDATE apps SET current_version_id = ? WHERE id = ?",
        (version_id, app_id),
    )

    logger.info(
        "Seeded carousel-designer app (id=%d, version_id=%d)",
        app_id,
        version_id,
    )


async def down(db: aiosqlite.Connection) -> None:
    pass
