"""System configuration: auth mode, API key storage, auth env builder."""
from pathlib import Path

import aiosqlite

from backend.db import DB_PATH, _get_db


async def get_system_config(db_path: str | Path = DB_PATH) -> dict:
    """Read all system config. Returns defaults for missing keys."""
    db = await _get_db(db_path)
    try:
        cursor = await db.execute("SELECT key, value FROM system_config")
        rows = await cursor.fetchall()
        config = {row["key"]: row["value"] for row in rows}
        return {
            "auth_mode": config.get("auth_mode", "max_oauth"),
            "api_key": config.get("api_key"),
        }
    finally:
        await db.close()


async def set_auth_mode(
    mode: str, api_key: str | None = None, db_path: str | Path = DB_PATH
) -> None:
    """Set auth mode and optionally store API key."""
    db = await _get_db(db_path)
    try:
        await db.execute(
            "INSERT OR REPLACE INTO system_config (key, value) VALUES ('auth_mode', ?)",
            (mode,),
        )
        if mode == "api_key" and api_key:
            await db.execute(
                "INSERT OR REPLACE INTO system_config (key, value) VALUES ('api_key', ?)",
                (api_key,),
            )
        elif mode == "max_oauth":
            await db.execute("DELETE FROM system_config WHERE key = 'api_key'")
        await db.commit()
    finally:
        await db.close()


async def delete_api_key(db_path: str | Path = DB_PATH) -> None:
    """Remove API key and reset to max_oauth."""
    await set_auth_mode("max_oauth", db_path=db_path)


async def get_auth_env(db_path: str | Path = DB_PATH) -> dict[str, str]:
    """Return env vars dict for ClaudeAgentOptions.env."""
    config = await get_system_config(db_path)
    if config["auth_mode"] == "api_key" and config.get("api_key"):
        return {"ANTHROPIC_API_KEY": config["api_key"]}
    return {}
