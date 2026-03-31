"""SQLite persistence for sessions and apps."""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

import aiosqlite

DB_PATH = Path(__file__).parent / "sessions.db"

_SLUG_RE = re.compile(r"^[a-z0-9][a-z0-9-]*[a-z0-9]$")
MAX_BODY_LENGTH = 50_000


async def _get_db(db_path: str | Path = DB_PATH) -> aiosqlite.Connection:
    db = await aiosqlite.connect(str(db_path))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys = ON")
    await db.execute("PRAGMA journal_mode = WAL")
    return db


async def _column_exists(db: aiosqlite.Connection, table: str, column: str) -> bool:
    cursor = await db.execute(f"PRAGMA table_info({table})")
    cols = await cursor.fetchall()
    return any(c[1] == column for c in cols)


async def init_db(db_path: str | Path = DB_PATH) -> None:
    db = await _get_db(db_path)
    try:
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
    finally:
        await db.close()


async def _migrate(db: aiosqlite.Connection) -> None:
    row = await (await db.execute("PRAGMA user_version")).fetchone()
    version = row[0] if row else 0

    if version < 1:
        if not await _column_exists(db, "sessions", "user_id"):
            await db.execute(
                "ALTER TABLE sessions ADD COLUMN user_id TEXT DEFAULT 'anonymous'"
            )
        if not await _column_exists(db, "sessions", "status"):
            await db.execute(
                "ALTER TABLE sessions ADD COLUMN status TEXT DEFAULT 'idle'"
            )
        if not await _column_exists(db, "sessions", "message_count"):
            await db.execute(
                "ALTER TABLE sessions ADD COLUMN message_count INTEGER DEFAULT 0"
            )
        await db.execute("PRAGMA user_version = 1")
        await db.commit()

    if version < 2:
        # 1. Create tables
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

        # 2. Indexes
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_prompt_versions_app_id ON prompt_versions(app_id)"
        )
        await db.execute(
            "CREATE INDEX IF NOT EXISTS idx_messages_session_id ON messages(session_id)"
        )

        # 3. Add columns to sessions (safe for retry)
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

        # 4. Seed from prompt.md
        from backend.prompt_config import load_prompt

        prompt_path = Path(__file__).parent / "prompt.md"
        if prompt_path.exists():
            meta, body = load_prompt()
            title = meta.get("title", "Default App")
            subtitle = meta.get("subtitle", "")
        else:
            title, subtitle, body = "Default App", "", "You are a helpful assistant."

        # Only seed if no apps exist (idempotent)
        cursor = await db.execute("SELECT COUNT(*) FROM apps")
        count_row = await cursor.fetchone()
        if count_row[0] == 0:
            await db.execute(
                "INSERT INTO apps (slug, title, subtitle) VALUES (?, ?, ?)",
                ("default", title, subtitle),
            )
            app_row = await (await db.execute("SELECT last_insert_rowid()")).fetchone()
            app_id = app_row[0]

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

            # 5. Backfill existing sessions
            await db.execute(
                "UPDATE sessions SET app_id = ?, prompt_version_id = ? WHERE app_id IS NULL",
                (app_id, version_id),
            )

        await db.execute("PRAGMA user_version = 2")
        await db.commit()


# --- App CRUD ---


def validate_app_fields(
    slug: str | None = None,
    title: str | None = None,
    body: str | None = None,
) -> list[str]:
    """Return list of validation error messages. Empty list = valid."""
    errors: list[str] = []
    if slug is not None:
        if len(slug) < 2 or not _SLUG_RE.match(slug):
            errors.append(
                "slug must be 2+ chars, lowercase alphanumeric and hyphens, "
                "no leading/trailing hyphen"
            )
    if title is not None:
        if not title.strip():
            errors.append("title must not be empty")
    if body is not None:
        if not body.strip():
            errors.append("body must not be empty")
        if len(body) > MAX_BODY_LENGTH:
            errors.append(f"body must be under {MAX_BODY_LENGTH} characters")
    return errors


async def get_active_apps(db_path: str | Path = DB_PATH) -> list[dict[str, Any]]:
    """Active apps for user-facing selector."""
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT id, slug, title, subtitle FROM apps "
            "WHERE is_active = 1 ORDER BY created_at ASC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def get_app_by_id(app_id: int, db_path: str | Path = DB_PATH) -> dict[str, Any] | None:
    """Single app by ID."""
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT id, slug, title, subtitle, is_active, current_version_id, "
            "created_at, updated_at FROM apps WHERE id = ?",
            (app_id,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


async def get_default_app(db_path: str | Path = DB_PATH) -> dict[str, Any] | None:
    """First active app. Fallback for backward compat."""
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT id, slug, title, subtitle, is_active, current_version_id "
            "FROM apps WHERE is_active = 1 ORDER BY id ASC LIMIT 1"
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


async def get_all_apps_admin(db_path: str | Path = DB_PATH) -> list[dict[str, Any]]:
    """All apps with version_count for admin list."""
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT a.id, a.slug, a.title, a.subtitle, a.is_active, "
            "a.current_version_id, a.created_at, a.updated_at, "
            "COUNT(pv.id) as version_count "
            "FROM apps a LEFT JOIN prompt_versions pv ON pv.app_id = a.id "
            "GROUP BY a.id ORDER BY a.created_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def create_app(
    slug: str, title: str, subtitle: str, body: str,
    db_path: str | Path = DB_PATH,
) -> dict[str, Any]:
    """Create app + first version. Returns {id, slug, current_version_id}."""
    db = await _get_db(db_path)
    try:
        await db.execute(
            "INSERT INTO apps (slug, title, subtitle) VALUES (?, ?, ?)",
            (slug, title, subtitle),
        )
        app_row = await (await db.execute("SELECT last_insert_rowid()")).fetchone()
        app_id = app_row[0]

        await db.execute(
            "INSERT INTO prompt_versions (app_id, body, change_note) VALUES (?, ?, ?)",
            (app_id, body, "Initial version"),
        )
        ver_row = await (await db.execute("SELECT last_insert_rowid()")).fetchone()
        version_id = ver_row[0]

        await db.execute(
            "UPDATE apps SET current_version_id = ? WHERE id = ?",
            (version_id, app_id),
        )
        await db.commit()
        return {"id": app_id, "slug": slug, "current_version_id": version_id}
    finally:
        await db.close()


async def update_app(
    app_id: int,
    *,
    title: str | None = None,
    subtitle: str | None = None,
    body: str | None = None,
    change_note: str = "",
    is_active: bool | None = None,
    db_path: str | Path = DB_PATH,
) -> dict[str, Any]:
    """Update app metadata and/or create new version if body changed.
    Always sets updated_at = CURRENT_TIMESTAMP.
    Returns {id, slug, current_version_id}."""
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT id, slug, current_version_id FROM apps WHERE id = ?",
            (app_id,),
        )
        app_row = await cursor.fetchone()
        if not app_row:
            raise ValueError(f"App {app_id} not found")

        new_version_id = app_row["current_version_id"]

        # Create new version if body changed
        if body is not None:
            # Check if body actually differs from current version
            if app_row["current_version_id"]:
                cur = await db.execute(
                    "SELECT body FROM prompt_versions WHERE id = ?",
                    (app_row["current_version_id"],),
                )
                current_ver = await cur.fetchone()
                body_changed = current_ver is None or current_ver["body"] != body
            else:
                body_changed = True

            if body_changed:
                await db.execute(
                    "INSERT INTO prompt_versions (app_id, body, change_note) VALUES (?, ?, ?)",
                    (app_id, body, change_note),
                )
                ver_row = await (await db.execute("SELECT last_insert_rowid()")).fetchone()
                new_version_id = ver_row[0]

        # Build metadata update
        updates: list[str] = ["updated_at = CURRENT_TIMESTAMP"]
        params: list[Any] = []
        if title is not None:
            updates.append("title = ?")
            params.append(title)
        if subtitle is not None:
            updates.append("subtitle = ?")
            params.append(subtitle)
        if is_active is not None:
            updates.append("is_active = ?")
            params.append(1 if is_active else 0)
        if new_version_id != app_row["current_version_id"]:
            updates.append("current_version_id = ?")
            params.append(new_version_id)

        params.append(app_id)
        await db.execute(
            f"UPDATE apps SET {', '.join(updates)} WHERE id = ?",
            tuple(params),
        )
        await db.commit()
        return {"id": app_id, "slug": app_row["slug"], "current_version_id": new_version_id}
    finally:
        await db.close()


async def get_app_config_from_db(
    app_id: int | None = None,
    db_path: str | Path = DB_PATH,
) -> dict[str, Any]:
    """Return {title, subtitle} for /config endpoint."""
    db = await _get_db(db_path)
    try:
        if app_id is not None:
            cursor = await db.execute(
                "SELECT title, subtitle FROM apps WHERE id = ?", (app_id,)
            )
        else:
            cursor = await db.execute(
                "SELECT title, subtitle FROM apps WHERE is_active = 1 ORDER BY id ASC LIMIT 1"
            )
        row = await cursor.fetchone()
        if not row:
            return {"title": "App"}
        result: dict[str, Any] = {"title": row["title"]}
        if row["subtitle"]:
            result["subtitle"] = row["subtitle"]
        return result
    finally:
        await db.close()


# --- Version queries ---


async def get_app_versions(
    app_id: int, db_path: str | Path = DB_PATH
) -> list[dict[str, Any]]:
    """Version history for an app, newest first."""
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT id, change_note, created_at, SUBSTR(body, 1, 200) as body_preview "
            "FROM prompt_versions WHERE app_id = ? ORDER BY created_at DESC",
            (app_id,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def get_version_by_id(
    app_id: int, version_id: int, db_path: str | Path = DB_PATH
) -> dict[str, Any] | None:
    """Full version detail."""
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT id, app_id, body, change_note, created_at "
            "FROM prompt_versions WHERE id = ? AND app_id = ?",
            (version_id, app_id),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


async def get_prompt_body_by_version(
    version_id: int, db_path: str | Path = DB_PATH
) -> str | None:
    """Prompt text for a specific version. Used by agent."""
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT body FROM prompt_versions WHERE id = ?", (version_id,)
        )
        row = await cursor.fetchone()
        return row["body"] if row else None
    finally:
        await db.close()


# --- Session functions ---


async def save_session(
    session_id: str,
    user_id: str = "anonymous",
    title: str | None = None,
    app_id: int | None = None,
    prompt_version_id: int | None = None,
    db_path: str | Path = DB_PATH,
) -> None:
    db = await _get_db(db_path)
    try:
        await db.execute(
            "INSERT OR REPLACE INTO sessions (id, user_id, title, app_id, prompt_version_id) "
            "VALUES (?, ?, ?, ?, ?)",
            (session_id, user_id, title, app_id, prompt_version_id),
        )
        await db.commit()
    finally:
        await db.close()


async def update_session_status(
    session_id: str,
    status: str,
    db_path: str | Path = DB_PATH,
) -> None:
    db = await _get_db(db_path)
    try:
        await db.execute(
            "UPDATE sessions SET status = ? WHERE id = ?",
            (status, session_id),
        )
        await db.commit()
    finally:
        await db.close()


async def increment_message_count(
    session_id: str,
    db_path: str | Path = DB_PATH,
) -> None:
    db = await _get_db(db_path)
    try:
        await db.execute(
            "UPDATE sessions SET message_count = message_count + 1 WHERE id = ?",
            (session_id,),
        )
        await db.commit()
    finally:
        await db.close()


async def save_message(
    session_id: str,
    role: str,
    content: dict[str, Any],
    db_path: str | Path = DB_PATH,
) -> None:
    db = await _get_db(db_path)
    try:
        await db.execute(
            "INSERT INTO messages (session_id, role, content) VALUES (?, ?, ?)",
            (session_id, role, json.dumps(content)),
        )
        await db.commit()
    finally:
        await db.close()


async def update_session_title(
    session_id: str, title: str, db_path: str | Path = DB_PATH
) -> None:
    db = await _get_db(db_path)
    try:
        await db.execute(
            "UPDATE sessions SET title = ? WHERE id = ? AND (title IS NULL OR title = '')",
            (title, session_id),
        )
        await db.commit()
    finally:
        await db.close()


async def get_sessions_by_user(
    user_id: str, db_path: str | Path = DB_PATH
) -> list[dict[str, Any]]:
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT id, created_at, title, status, message_count "
            "FROM sessions WHERE user_id = ? ORDER BY created_at DESC",
            (user_id,),
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def get_all_sessions_admin(
    db_path: str | Path = DB_PATH,
) -> list[dict[str, Any]]:
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT id, user_id, status, message_count, created_at, title "
            "FROM sessions ORDER BY created_at DESC"
        )
        rows = await cursor.fetchall()
        return [dict(row) for row in rows]
    finally:
        await db.close()


async def get_session_owner(
    session_id: str, db_path: str | Path = DB_PATH
) -> str | None:
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT user_id FROM sessions WHERE id = ?", (session_id,)
        )
        row = await cursor.fetchone()
        return row[0] if row else None
    finally:
        await db.close()


async def get_session(
    session_id: str, db_path: str | Path = DB_PATH
) -> list[dict[str, Any]]:
    db = await _get_db(db_path)
    try:
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
    finally:
        await db.close()
