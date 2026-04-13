"""Tests for user authentication: PIN hashing, login/register, token validation."""

from __future__ import annotations

import tempfile
from pathlib import Path

import pytest

from backend.auth import (
    create_user,
    generate_token,
    get_all_users,
    get_user_by_email,
    get_user_by_token,
    hash_pin,
    login_or_register,
    update_user_admin,
    validate_email,
    validate_pin,
    verify_pin,
)
from backend.db import init_db


@pytest.fixture
def db_path():
    with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
        return Path(f.name)


class TestPinHashing:
    def test_hash_and_verify(self):
        hashed = hash_pin("1234")
        assert verify_pin("1234", hashed)

    def test_wrong_pin_fails(self):
        hashed = hash_pin("1234")
        assert not verify_pin("5678", hashed)

    def test_different_hashes_for_same_pin(self):
        h1 = hash_pin("1234")
        h2 = hash_pin("1234")
        assert h1 != h2  # different salts

    def test_verify_corrupted_hash(self):
        assert not verify_pin("1234", "invalid")

    def test_verify_empty_hash(self):
        assert not verify_pin("1234", "")


class TestValidation:
    def test_valid_email(self):
        assert validate_email("user@example.com") == "user@example.com"

    def test_email_normalized_to_lowercase(self):
        assert validate_email("User@Example.COM") == "user@example.com"

    def test_invalid_email_raises(self):
        with pytest.raises(ValueError):
            validate_email("not-an-email")

    def test_valid_pin_4_digits(self):
        assert validate_pin("1234") == "1234"

    def test_valid_pin_6_digits(self):
        assert validate_pin("123456") == "123456"

    def test_pin_too_short(self):
        with pytest.raises(ValueError):
            validate_pin("123")

    def test_pin_too_long(self):
        with pytest.raises(ValueError):
            validate_pin("1234567")

    def test_pin_non_numeric(self):
        with pytest.raises(ValueError):
            validate_pin("abcd")


class TestTokenGeneration:
    def test_token_length(self):
        token = generate_token()
        assert len(token) == 64  # 32 bytes hex

    def test_tokens_unique(self):
        t1 = generate_token()
        t2 = generate_token()
        assert t1 != t2


class TestUserCrud:
    @pytest.mark.asyncio
    async def test_create_and_get_by_email(self, db_path):
        await init_db(db_path)
        token = generate_token()
        user = await create_user(
            "test@example.com", hash_pin("1234"), token, db_path=db_path
        )
        assert user["email"] == "test@example.com"
        assert user["token"] == token

        found = await get_user_by_email("test@example.com", db_path=db_path)
        assert found is not None
        assert found["id"] == user["id"]

    @pytest.mark.asyncio
    async def test_get_by_token(self, db_path):
        await init_db(db_path)
        token = generate_token()
        user = await create_user(
            "test@example.com", hash_pin("1234"), token, db_path=db_path
        )
        found = await get_user_by_token(token, db_path=db_path)
        assert found is not None
        assert found["id"] == user["id"]

    @pytest.mark.asyncio
    async def test_get_by_invalid_token(self, db_path):
        await init_db(db_path)
        found = await get_user_by_token("nonexistent", db_path=db_path)
        assert found is None

    @pytest.mark.asyncio
    async def test_get_all_users(self, db_path):
        await init_db(db_path)
        await create_user("a@test.com", hash_pin("1111"), generate_token(), db_path=db_path)
        await create_user("b@test.com", hash_pin("2222"), generate_token(), db_path=db_path)
        users = await get_all_users(db_path=db_path)
        assert len(users) == 2

    @pytest.mark.asyncio
    async def test_update_admin_flag(self, db_path):
        await init_db(db_path)
        user = await create_user(
            "test@example.com", hash_pin("1234"), generate_token(), db_path=db_path
        )
        assert not user["is_admin"]
        updated = await update_user_admin(user["id"], True, db_path=db_path)
        assert updated is not None
        assert updated["is_admin"]


class TestLoginOrRegister:
    @pytest.mark.asyncio
    async def test_register_first_user_is_admin(self, db_path):
        await init_db(db_path)
        user, is_new = await login_or_register("admin@test.com", "1234", db_path=db_path)
        assert is_new
        assert user["is_admin"]

    @pytest.mark.asyncio
    async def test_register_second_user_not_admin(self, db_path):
        await init_db(db_path)
        await login_or_register("first@test.com", "1111", db_path=db_path)
        user, is_new = await login_or_register("second@test.com", "2222", db_path=db_path)
        assert is_new
        assert not user["is_admin"]

    @pytest.mark.asyncio
    async def test_login_existing_user(self, db_path):
        await init_db(db_path)
        user1, _ = await login_or_register("user@test.com", "1234", db_path=db_path)
        user2, is_new = await login_or_register("user@test.com", "1234", db_path=db_path)
        assert not is_new
        assert user1["id"] == user2["id"]
        assert user1["token"] == user2["token"]

    @pytest.mark.asyncio
    async def test_login_wrong_pin(self, db_path):
        await init_db(db_path)
        await login_or_register("user@test.com", "1234", db_path=db_path)
        with pytest.raises(PermissionError, match="Invalid PIN"):
            await login_or_register("user@test.com", "9999", db_path=db_path)

    @pytest.mark.asyncio
    async def test_invalid_email_rejected(self, db_path):
        await init_db(db_path)
        with pytest.raises(ValueError):
            await login_or_register("bad-email", "1234", db_path=db_path)

    @pytest.mark.asyncio
    async def test_invalid_pin_rejected(self, db_path):
        await init_db(db_path)
        with pytest.raises(ValueError):
            await login_or_register("user@test.com", "12", db_path=db_path)
