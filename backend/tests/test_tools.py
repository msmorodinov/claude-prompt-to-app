"""Tests for show/ask tool handlers."""

from __future__ import annotations

import asyncio

import pytest

from backend.tools import create_tools


@pytest.fixture
def tools(mock_session):
    return create_tools(mock_session)


@pytest.fixture
def show_tool(tools):
    return tools[0]


@pytest.fixture
def ask_tool(tools):
    return tools[1]


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
        async def delayed_answer():
            await asyncio.sleep(0.05)
            mock_session.resolve_ask({"q1": "yes"})

        asyncio.create_task(delayed_answer())
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
        async def delayed_answer():
            await asyncio.sleep(0.05)
            mock_session.resolve_ask({"q1": "A"})

        asyncio.create_task(delayed_answer())
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
        async def delayed_answer():
            await asyncio.sleep(0.05)
            mock_session.resolve_ask({"q1": "ok"})

        asyncio.create_task(delayed_answer())
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
        async def delayed_answer():
            await asyncio.sleep(0.05)
            mock_session.resolve_ask({"q1": "val"})

        asyncio.create_task(delayed_answer())
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
        async def delayed_answer():
            await asyncio.sleep(0.05)
            mock_session.resolve_ask({"q1": "val"})

        asyncio.create_task(delayed_answer())
        await ask_tool.handler(
            {
                "questions": [
                    {"type": "free_text", "id": "q1", "label": "Q?"}
                ]
            }
        )
        assert mock_session.pending_ask_id is None
        assert mock_session.pending_answers == {}
