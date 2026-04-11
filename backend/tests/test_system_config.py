"""Tests for system_config module."""
import pytest
from backend.system_config import get_system_config, get_auth_env

pytestmark = pytest.mark.asyncio


class TestGetSystemConfig:
    async def test_empty_table_returns_defaults(self, tmp_db):
        config = await get_system_config(tmp_db)
        assert config["auth_mode"] == "max_oauth"
        assert config.get("api_key") is None

    async def test_reads_stored_values(self, tmp_db):
        from backend.system_config import set_auth_mode
        await set_auth_mode("api_key", "sk-ant-test123", tmp_db)
        config = await get_system_config(tmp_db)
        assert config["auth_mode"] == "api_key"
        assert config["api_key"] == "sk-ant-test123"


class TestGetAuthEnv:
    async def test_max_oauth_returns_empty(self, tmp_db):
        env = await get_auth_env(tmp_db)
        assert env == {}

    async def test_api_key_returns_env_var(self, tmp_db):
        from backend.system_config import set_auth_mode
        await set_auth_mode("api_key", "sk-ant-test123", tmp_db)
        env = await get_auth_env(tmp_db)
        assert env == {"ANTHROPIC_API_KEY": "sk-ant-test123"}

    async def test_api_key_mode_without_key_returns_empty(self, tmp_db):
        from backend.system_config import set_auth_mode
        await set_auth_mode("max_oauth", None, tmp_db)
        env = await get_auth_env(tmp_db)
        assert env == {}
