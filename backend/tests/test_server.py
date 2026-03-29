"""Integration tests for FastAPI endpoints."""

from __future__ import annotations

from unittest.mock import AsyncMock, patch

import pytest


class TestHealthEndpoint:
    @pytest.mark.asyncio
    async def test_health(self, client):
        resp = await client.get("/health")
        assert resp.status_code == 200
        assert resp.json() == {"status": "ok"}


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
    async def test_answers_wrong_ask_id(self, client, session):
        session.start_ask("ask-001")
        resp = await client.post(
            "/answers",
            json={
                "session_id": session.session_id,
                "ask_id": "wrong-id",
                "answers": {},
            },
        )
        assert resp.status_code == 409
