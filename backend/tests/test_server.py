"""Integration tests for FastAPI endpoints."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from unittest.mock import AsyncMock, patch

import pytest

from server import _parse_mcp_list


class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_health(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


class TestEnvironmentEndpoint:
    @pytest.mark.asyncio
    async def test_environment_returns_structure(self, client):
        resp = await client.get("/api/environment")
        assert resp.status_code == 200
        data = resp.json()
        assert "display_widgets" in data
        assert "input_widgets" in data
        assert "tools" in data
        assert len(data["display_widgets"]) == 13  # 11 base + image_gallery + file_download
        assert len(data["input_widgets"]) == 8  # 7 base + image_select
        assert len(data["tools"]) == 6

    @pytest.mark.asyncio
    async def test_environment_widget_fields(self, client):
        resp = await client.get("/api/environment")
        data = resp.json()
        widget = data["display_widgets"][0]
        assert "type" in widget
        assert "required" in widget
        assert "optional" in widget
        assert isinstance(widget["required"], list)

    @pytest.mark.asyncio
    async def test_environment_tool_fields(self, client):
        resp = await client.get("/api/environment")
        data = resp.json()
        tool = data["tools"][0]
        assert "name" in tool
        assert "description" in tool
        assert "behavior" in tool


class TestChatEndpoint:
    @pytest.mark.asyncio
    @patch("backend.server.run_agent", new_callable=AsyncMock)
    async def test_chat_creates_session(self, mock_agent, client):
        resp = await client.post("/chat", json={"message": "hello"})
        assert resp.status_code == 200
        data = resp.json()
        assert "session_id" in data
        assert len(data["session_id"]) == 12

    @pytest.mark.asyncio
    @patch("backend.server.run_agent", new_callable=AsyncMock)
    async def test_chat_reuses_session(self, mock_agent, client, session):
        resp = await client.post(
            "/chat",
            json={"message": "continue", "session_id": session.session_id},
        )
        assert resp.status_code == 200
        assert resp.json()["session_id"] == session.session_id

    @pytest.mark.asyncio
    async def test_chat_invalid_session(self, client):
        resp = await client.post(
            "/chat",
            json={"message": "hi", "session_id": "nonexistent"},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    @patch("backend.server.run_agent", new_callable=AsyncMock)
    async def test_chat_returns_409_when_agent_running(self, mock_agent, client, session):
        session.agent_task = asyncio.create_task(asyncio.sleep(10))
        resp = await client.post(
            "/chat",
            json={"message": "second", "session_id": session.session_id},
        )
        assert resp.status_code == 409
        mock_agent.assert_not_called()
        session.agent_task.cancel()
        with suppress(asyncio.CancelledError):
            await session.agent_task

    @pytest.mark.asyncio
    @patch("backend.server.run_agent", new_callable=AsyncMock)
    async def test_chat_stores_agent_task(self, mock_agent, client, session):
        resp = await client.post(
            "/chat",
            json={"message": "hello", "session_id": session.session_id},
        )
        assert resp.status_code == 200
        assert session.agent_task is not None


class TestStreamEndpoint:
    @pytest.mark.asyncio
    async def test_stream_returns_sse(self, client, session):
        session.push_sse("done", {})
        resp = await client.get(
            "/stream",
            params={"session_id": session.session_id},
        )
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

    @pytest.mark.asyncio
    async def test_stream_invalid_session(self, client):
        resp = await client.get("/stream", params={"session_id": "invalid"})
        assert resp.status_code == 404


class TestAnswersEndpoint:
    @pytest.mark.asyncio
    async def test_answers_resolves_pending_ask(self, client, session):
        session.start_ask("ask-001")
        resp = await client.post(
            "/answers",
            json={
                "session_id": session.session_id,
                "ask_id": "ask-001",
                "answers": {"q1": "yes"},
            },
        )
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}
        assert session.pending_ask_event.is_set()
        assert session.pending_answers == {"q1": "yes"}

    @pytest.mark.asyncio
    async def test_answers_missing_fields(self, client):
        resp = await client.post("/answers", json={})
        assert resp.status_code == 400

    @pytest.mark.asyncio
    async def test_answers_wrong_session(self, client):
        resp = await client.post(
            "/answers",
            json={
                "session_id": "nonexistent",
                "ask_id": "ask-001",
                "answers": {},
            },
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_answers_stale_ask_resumes_agent(self, client, session):
        """Mismatched ask_id with no running agent → resume session (stale ask)."""
        session.start_ask("ask-001")
        resp = await client.post(
            "/answers",
            json={
                "session_id": session.session_id,
                "ask_id": "wrong-id",
                "answers": {"q1": "answer"},
            },
        )
        assert resp.status_code == 200
        assert resp.json().get("resumed") is True

    @pytest.mark.asyncio
    async def test_answers_wrong_ask_id_agent_running(self, client, session):
        """Mismatched ask_id with running agent → 409."""
        session.start_ask("ask-001")
        # Simulate a running agent task
        loop = asyncio.get_event_loop()
        session.agent_task = loop.create_future()
        resp = await client.post(
            "/answers",
            json={
                "session_id": session.session_id,
                "ask_id": "wrong-id",
                "answers": {},
            },
        )
        assert resp.status_code == 409
        # Cleanup: cancel the future so it doesn't leak
        session.agent_task.cancel()
        with suppress(asyncio.CancelledError):
            await session.agent_task


class TestCreateSession:
    @pytest.mark.asyncio
    async def test_create_session_app_builder_mode(self, client):
        """POST /sessions/create with mode='app-builder' creates builder session."""
        resp = await client.post(
            "/sessions/create",
            json={"mode": "app-builder"},
            headers={"X-User-Id": "test-user"},
        )
        assert resp.status_code == 200
        data = resp.json()
        assert "session_id" in data

    @pytest.mark.asyncio
    async def test_create_session_invalid_mode(self, client):
        """POST /sessions/create with invalid mode returns 422."""
        resp = await client.post(
            "/sessions/create",
            json={"mode": "superuser"},
            headers={"X-User-Id": "test-user"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_edit_app_id_requires_builder_mode(self, client):
        """edit_app_id without mode='app-builder' returns 400."""
        resp = await client.post(
            "/sessions/create",
            json={"edit_app_id": 1},
            headers={"X-User-Id": "test-user"},
        )
        assert resp.status_code == 400


class TestDeleteSession:
    @pytest.mark.asyncio
    async def test_delete_session_success(self, client, session):
        resp = await client.delete(
            f"/sessions/{session.session_id}",
            headers={"X-User-Id": session.user_id},
        )
        assert resp.status_code == 204

    @pytest.mark.asyncio
    async def test_delete_session_wrong_user(self, client, session):
        resp = await client.delete(
            f"/sessions/{session.session_id}",
            headers={"X-User-Id": "other-user"},
        )
        assert resp.status_code == 403

    @pytest.mark.asyncio
    async def test_delete_session_not_found(self, client):
        resp = await client.delete(
            "/sessions/nonexistent",
            headers={"X-User-Id": "someone"},
        )
        assert resp.status_code == 404

    @pytest.mark.asyncio
    async def test_delete_session_cleans_up_in_memory(self, client, session):
        from backend.server import sessions as mgr
        assert mgr.get(session.session_id) is not None
        await client.delete(
            f"/sessions/{session.session_id}",
            headers={"X-User-Id": session.user_id},
        )
        assert mgr.get(session.session_id) is None


@pytest.mark.asyncio
async def test_mcp_servers_endpoint(client):
    """GET /api/mcp-servers returns parsed MCP server list."""
    mock_proc = AsyncMock()
    mock_proc.communicate.return_value = (b"server1: cmd1 - \xe2\x9c\x93 Connected\n", b"")
    mock_proc.returncode = 0
    with patch("server.asyncio.create_subprocess_exec", return_value=mock_proc), \
         patch("server.shutil.which", return_value="/usr/bin/claude"):
        resp = await client.get("/api/mcp-servers")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data) == 1
    assert data[0]["name"] == "server1"
    assert data[0]["status"] == "connected"


def test_parse_mcp_list_connected():
    output = "Checking MCP server health...\n\nclaude.ai Deepwiki: https://mcp.deepwiki.com/mcp - ✓ Connected\n"
    result = _parse_mcp_list(output)
    assert len(result) == 1
    assert result[0] == {
        "name": "claude.ai Deepwiki",
        "command": "https://mcp.deepwiki.com/mcp",
        "status": "connected",
    }


def test_parse_mcp_list_needs_auth():
    output = "claude.ai Gmail: https://gmail.mcp.claude.com/mcp - ! Needs authentication\n"
    result = _parse_mcp_list(output)
    assert len(result) == 1
    assert result[0]["status"] == "needs_auth"


def test_parse_mcp_list_mixed():
    output = (
        "Checking MCP server health...\n\n"
        "server1: cmd1 - ✓ Connected\n"
        "server2: cmd2 - ! Needs authentication\n"
        "server3: cmd3 - ✗ Failed\n"
    )
    result = _parse_mcp_list(output)
    assert len(result) == 3
    assert result[0]["status"] == "connected"
    assert result[1]["status"] == "needs_auth"
    assert result[2]["status"] == "error"


def test_parse_mcp_list_empty():
    assert _parse_mcp_list("") == []
    assert _parse_mcp_list("Checking MCP server health...\n") == []


class TestSystemStatus:
    @pytest.mark.asyncio
    async def test_returns_all_fields(self, client):
        resp = await client.get("/admin/system-status")
        assert resp.status_code == 200
        data = resp.json()
        assert "auth" in data
        assert "cli" in data
        assert "server" in data
        assert "sessions" in data
        assert data["auth"]["mode"] == "max_oauth"
        assert data["auth"]["has_credentials"] is True
        assert isinstance(data["server"]["uptime_seconds"], (int, float))
        assert isinstance(data["sessions"]["active"], int)
        assert isinstance(data["sessions"]["total"], int)


class TestAuthManagement:
    @pytest.mark.asyncio
    async def test_set_api_key_mode(self, client):
        resp = await client.post(
            "/admin/auth/mode",
            json={"mode": "api_key", "api_key": "sk-ant-test123"},
        )
        assert resp.status_code == 200
        status = await client.get("/admin/system-status")
        assert status.json()["auth"]["mode"] == "api_key"

    @pytest.mark.asyncio
    async def test_set_max_oauth_mode(self, client):
        await client.post(
            "/admin/auth/mode",
            json={"mode": "api_key", "api_key": "sk-ant-test123"},
        )
        resp = await client.post(
            "/admin/auth/mode",
            json={"mode": "max_oauth"},
        )
        assert resp.status_code == 200
        status = await client.get("/admin/system-status")
        assert status.json()["auth"]["mode"] == "max_oauth"

    @pytest.mark.asyncio
    async def test_api_key_mode_requires_key(self, client):
        resp = await client.post(
            "/admin/auth/mode",
            json={"mode": "api_key"},
        )
        assert resp.status_code == 422

    @pytest.mark.asyncio
    async def test_delete_api_key(self, client):
        await client.post(
            "/admin/auth/mode",
            json={"mode": "api_key", "api_key": "sk-ant-test123"},
        )
        resp = await client.delete("/admin/auth/api-key")
        assert resp.status_code == 200
        status = await client.get("/admin/system-status")
        assert status.json()["auth"]["mode"] == "max_oauth"


class TestCorsConfig:
    """CORS must include production origin to prevent deploy-drift regression."""

    def test_production_origin_in_cors(self):
        from backend.server import app

        cors_mw = next(
            m for m in app.user_middleware
            if m.cls.__name__ == "CORSMiddleware"
        )
        origins = cors_mw.kwargs["allow_origins"]
        assert "https://prompt2app.novaco.io" in origins
