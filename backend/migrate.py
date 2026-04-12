"""Lightweight migration runner using PRAGMA user_version."""

from __future__ import annotations

import importlib
import logging
from pathlib import Path

import aiosqlite

logger = logging.getLogger(__name__)

MIGRATIONS_DIR = Path(__file__).parent / "migrations"


async def get_current_version(db: aiosqlite.Connection) -> int:
    """Return the current schema version from PRAGMA user_version."""
    row = await (await db.execute("PRAGMA user_version")).fetchone()
    return row[0] if row else 0


async def run_migrations(db: aiosqlite.Connection) -> int:
    """Run all pending migrations in order. Returns count of applied migrations."""
    current = await get_current_version(db)
    applied = 0

    migration_files = sorted(
        f for f in MIGRATIONS_DIR.glob("*.py") if not f.name.startswith("_")
    )

    for fpath in migration_files:
        mod = importlib.import_module(f"backend.migrations.{fpath.stem}")
        if mod.VERSION <= current:
            continue
        if mod.VERSION != current + 1:
            raise RuntimeError(
                f"Migration gap: at version {current}, "
                f"found {fpath.name} with VERSION={mod.VERSION}"
            )

        logger.info("Applying migration %s (version %d)", fpath.name, mod.VERSION)
        await mod.up(db)
        await db.execute(f"PRAGMA user_version = {int(mod.VERSION)}")
        await db.commit()
        current = mod.VERSION
        applied += 1

    if applied:
        logger.info("Applied %d migration(s), now at version %d", applied, current)

    return applied
