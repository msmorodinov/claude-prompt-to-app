"""Tests for show/ask/save_app tool handlers."""

from __future__ import annotations

import asyncio
import tempfile
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

from backend.db import init_db
from backend.tools import create_tools


def _find_tool(tools: list, name: str):
    """Find a tool by name in the tools list."""
    for t in tools:
        if t.name == name:
            return t
    raise KeyError(f"Tool '{name}' not found in {[t.name for t in tools]}")


@pytest.fixture(autouse=True)
def _mock_save_message():
    with patch("backend.tools.save_message", new_callable=AsyncMock):
        yield


@pytest.fixture
def tools(mock_session):
    return create_tools(mock_session, mock_session.session_id)


@pytest.fixture
def show_tool(tools):
    return _find_tool(tools, "show")


@pytest.fixture
def ask_tool(tools):
    return _find_tool(tools, "ask")


@pytest.fixture
def tools_with_save(mock_session):
    return create_tools(mock_session, mock_session.session_id, include_save_app=True)


@pytest.fixture
def save_app_tool(tools_with_save):
    return _find_tool(tools_with_save, "save_app")


def _answer_later(session, answers, delay=0.05):
    """Schedule answers to be resolved after a short delay."""

    async def _resolve():
        await asyncio.sleep(delay)
        session.resolve_ask(answers)

    asyncio.create_task(_resolve())


class TestShowTool:
    @pytest.mark.asyncio
    async def test_show_puts_event_on_queue(self, show_tool, mock_session):
        result = await show_tool.handler(
            {"blocks": [{"type": "text", "content": "Hello"}]}
        )
        assert "Displayed 1 block(s)" in result["content"][0]["text"]
        event = mock_session.sse_queue.get_nowait()
        assert event["event"] == "assistant_message"
        assert event["data"]["blocks"] == [{"type": "text", "content": "Hello"}]

    @pytest.mark.asyncio
    async def test_show_adds_to_history(self, show_tool, mock_session):
        await show_tool.handler(
            {"blocks": [{"type": "text", "content": "Test"}]}
        )
        assert len(mock_session.history) == 1
        assert mock_session.history[0]["role"] == "assistant"

    @pytest.mark.asyncio
    async def test_show_empty_blocks(self, show_tool, mock_session):
        result = await show_tool.handler({"blocks": []})
        assert "Displayed 0 block(s)" in result["content"][0]["text"]

    @pytest.mark.asyncio
    async def test_show_multiple_blocks(self, show_tool, mock_session):
        blocks = [
            {"type": "text", "content": "One"},
            {"type": "section_header", "title": "Two"},
        ]
        result = await show_tool.handler({"blocks": blocks})
        assert "Displayed 2 block(s)" in result["content"][0]["text"]


class TestAskTool:
    @pytest.mark.asyncio
    async def test_ask_blocks_until_answered(self, ask_tool, mock_session):
        _answer_later(mock_session, {"q1": "yes"})
        result = await ask_tool.handler(
            {
                "questions": [
                    {
                        "type": "single_select",
                        "id": "q1",
                        "label": "Pick one",
                        "options": ["A", "B"],
                    }
                ]
            }
        )
        assert "Pick one: yes" in result["content"][0]["text"]

    @pytest.mark.asyncio
    async def test_ask_sends_sse_event(self, ask_tool, mock_session):
        _answer_later(mock_session, {"q1": "A"})
        await ask_tool.handler(
            {
                "questions": [
                    {"type": "free_text", "id": "q1", "label": "Name?"}
                ]
            }
        )
        event = mock_session.sse_queue.get_nowait()
        assert event["event"] == "ask_message"
        assert "questions" in event["data"]

    @pytest.mark.asyncio
    async def test_ask_with_preamble(self, ask_tool, mock_session):
        _answer_later(mock_session, {"q1": "ok"})
        await ask_tool.handler(
            {
                "preamble": "Let me ask you something",
                "questions": [
                    {"type": "free_text", "id": "q1", "label": "What?"}
                ],
            }
        )
        event = mock_session.sse_queue.get_nowait()
        assert event["data"]["preamble"] == "Let me ask you something"

    @pytest.mark.asyncio
    async def test_ask_records_in_history(self, ask_tool, mock_session):
        _answer_later(mock_session, {"q1": "val"})
        await ask_tool.handler(
            {
                "questions": [
                    {"type": "free_text", "id": "q1", "label": "Q?"}
                ]
            }
        )
        assert len(mock_session.history) == 2
        assert mock_session.history[0]["role"] == "assistant"
        assert mock_session.history[1]["role"] == "user"

    @pytest.mark.asyncio
    async def test_ask_clears_pending_state(self, ask_tool, mock_session):
        _answer_later(mock_session, {"q1": "val"})
        await ask_tool.handler(
            {
                "questions": [
                    {"type": "free_text", "id": "q1", "label": "Q?"}
                ]
            }
        )
        assert mock_session.pending_ask_id is None
        assert mock_session.pending_answers == {}


class TestSaveAppTool:
    @pytest.fixture(autouse=True)
    async def _setup_db(self):
        with tempfile.NamedTemporaryFile(suffix=".db", delete=False) as f:
            db_path = Path(f.name)
        await init_db(db_path)
        with patch("backend.tools.create_app") as mock_create:
            mock_create.return_value = {"id": 99, "slug": "test-app", "current_version_id": 1}
            self._mock_create = mock_create
            self._db_path = db_path
            yield

    @pytest.mark.asyncio
    async def test_save_app_valid(self, save_app_tool):
        result = await save_app_tool.handler({
            "slug": "my-app",
            "title": "My App",
            "body": "You are a helpful assistant.",
        })
        text = result["content"][0]["text"]
        assert "My App" in text
        assert "draft" in text
        assert "is_error" not in result

    @pytest.mark.asyncio
    async def test_save_app_bad_slug(self, save_app_tool):
        result = await save_app_tool.handler({
            "slug": "X",
            "title": "Bad",
            "body": "Some body",
        })
        assert result["is_error"] is True
        assert "slug" in result["content"][0]["text"].lower()

    @pytest.mark.asyncio
    async def test_save_app_empty_body(self, save_app_tool):
        result = await save_app_tool.handler({
            "slug": "ok-slug",
            "title": "OK",
            "body": "",
        })
        assert result["is_error"] is True
        assert "body" in result["content"][0]["text"].lower()

    @pytest.mark.asyncio
    async def test_save_app_duplicate_slug(self, save_app_tool):
        self._mock_create.side_effect = Exception("UNIQUE constraint failed: apps.slug")
        result = await save_app_tool.handler({
            "slug": "dup-slug",
            "title": "Dup",
            "body": "Some prompt content here.",
        })
        assert result["is_error"] is True
        assert "already exists" in result["content"][0]["text"]

    def test_include_save_app_false(self, mock_session):
        tools = create_tools(mock_session, "sid")
        names = [t.name for t in tools]
        assert "save_app" not in names

    def test_include_save_app_true(self, mock_session):
        tools = create_tools(mock_session, "sid", include_save_app=True)
        names = [t.name for t in tools]
        assert "save_app" in names
