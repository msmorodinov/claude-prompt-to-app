"""User authentication: email + PIN registration/login, token management."""

from __future__ import annotations

import hashlib
import hmac
import logging
import os
import re
import secrets
import uuid
from pathlib import Path
from typing import Any

import aiosqlite

from backend.db import DB_PATH

logger = logging.getLogger(__name__)

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
_PIN_RE = re.compile(r"^\d{4,6}$")
_PBKDF2_ITERATIONS = 260_000


# --- PIN hashing (stdlib only, OWASP-compliant PBKDF2) ---


def hash_pin(pin: str) -> str:
    salt = os.urandom(16)
    dk = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, _PBKDF2_ITERATIONS)
    return f"{salt.hex()}${dk.hex()}"


def verify_pin(pin: str, stored: str) -> bool:
    try:
        salt_hex, hash_hex = stored.split("$", 1)
        salt = bytes.fromhex(salt_hex)
        expected = bytes.fromhex(hash_hex)
    except (ValueError, IndexError):
        return False
    dk = hashlib.pbkdf2_hmac("sha256", pin.encode(), salt, _PBKDF2_ITERATIONS)
    return hmac.compare_digest(dk, expected)


def generate_token() -> str:
    return secrets.token_hex(32)


# --- Validation ---


def validate_email(email: str) -> str:
    email = email.strip().lower()
    if not _EMAIL_RE.match(email):
        raise ValueError("Invalid email format")
    return email


def validate_pin(pin: str) -> str:
    if not _PIN_RE.match(pin):
        raise ValueError("PIN must be 4-6 digits")
    return pin


# --- Database helpers ---


async def _get_db(db_path: str | Path = DB_PATH) -> aiosqlite.Connection:
    db = await aiosqlite.connect(str(db_path))
    db.row_factory = aiosqlite.Row
    await db.execute("PRAGMA foreign_keys = ON")
    await db.execute("PRAGMA journal_mode = WAL")
    return db


async def get_user_by_token(
    token: str, *, db_path: str | Path = DB_PATH
) -> dict[str, Any] | None:
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT id, email, is_admin, created_at FROM users WHERE token = ?",
            (token,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


async def get_user_by_email(
    email: str, *, db_path: str | Path = DB_PATH
) -> dict[str, Any] | None:
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT id, email, pin_hash, token, is_admin, created_at FROM users WHERE email = ?",
            (email,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


async def create_user(
    email: str,
    pin_hash: str,
    token: str,
    *,
    is_admin: bool = False,
    db_path: str | Path = DB_PATH,
) -> dict[str, Any]:
    user_id = uuid.uuid4().hex[:12]
    db = await _get_db(db_path)
    try:
        await db.execute(
            "INSERT INTO users (id, email, pin_hash, token, is_admin) VALUES (?, ?, ?, ?, ?)",
            (user_id, email, pin_hash, token, int(is_admin)),
        )
        await db.commit()
        return {
            "id": user_id,
            "email": email,
            "is_admin": is_admin,
            "token": token,
        }
    finally:
        await db.close()


async def _is_first_user(db_path: str | Path = DB_PATH) -> bool:
    db = await _get_db(db_path)
    try:
        cursor = await db.execute("SELECT COUNT(*) FROM users")
        row = await cursor.fetchone()
        return row[0] == 0
    finally:
        await db.close()


async def login_or_register(
    email: str, pin: str, *, db_path: str | Path = DB_PATH
) -> tuple[dict[str, Any], bool]:
    """Login or register. Returns (user_dict_with_token, is_new_user)."""
    email = validate_email(email)
    pin = validate_pin(pin)

    existing = await get_user_by_email(email, db_path=db_path)
    if existing:
        if not verify_pin(pin, existing["pin_hash"]):
            raise PermissionError("Invalid PIN")
        return {
            "id": existing["id"],
            "email": existing["email"],
            "is_admin": bool(existing["is_admin"]),
            "token": existing["token"],
        }, False

    # New user — first user becomes admin
    is_admin = await _is_first_user(db_path)
    token = generate_token()
    pin_hashed = hash_pin(pin)
    user = await create_user(
        email, pin_hashed, token, is_admin=is_admin, db_path=db_path
    )
    return user, True


async def get_all_users(
    *, db_path: str | Path = DB_PATH
) -> list[dict[str, Any]]:
    db = await _get_db(db_path)
    try:
        cursor = await db.execute(
            "SELECT id, email, is_admin, created_at FROM users ORDER BY created_at"
        )
        return [dict(r) for r in await cursor.fetchall()]
    finally:
        await db.close()


async def update_user_admin(
    user_id: str, is_admin: bool, *, db_path: str | Path = DB_PATH
) -> dict[str, Any] | None:
    db = await _get_db(db_path)
    try:
        await db.execute(
            "UPDATE users SET is_admin = ? WHERE id = ?",
            (int(is_admin), user_id),
        )
        await db.commit()
        cursor = await db.execute(
            "SELECT id, email, is_admin, created_at FROM users WHERE id = ?",
            (user_id,),
        )
        row = await cursor.fetchone()
        return dict(row) if row else None
    finally:
        await db.close()


# --- FastAPI dependencies ---

from fastapi import HTTPException, Request  # noqa: E402


async def get_current_user(request: Request) -> dict[str, Any]:
    """Extract and validate Bearer token. Returns user dict. Raises 401."""
    auth = request.headers.get("authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Authentication required")
    token = auth[7:]
    user = await get_user_by_token(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid token")
    return user


async def require_admin(request: Request) -> dict[str, Any]:
    """Like get_current_user but also checks is_admin. Raises 403."""
    user = await get_current_user(request)
    if not user["is_admin"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user
