"""Tests for SessionState and SessionManager."""

from __future__ import annotations

import asyncio
from contextlib import suppress
from unittest.mock import patch

import pytest

from backend.session import SessionManager, SessionState


class TestSessionState:
    def test_creates_with_unique_id(self):
        s1 = SessionState()
        s2 = SessionState()
        assert s1.session_id != s2.session_id
        assert len(s1.session_id) == 12

    def test_push_sse_puts_event_on_queue(self):
        s = SessionState()
        s.push_sse("test_event", {"key": "value"})
        assert not s.sse_queue.empty()
        event = s.sse_queue.get_nowait()
        assert event == {"event": "test_event", "data": {"key": "value"}}

    def test_start_ask_clears_event(self):
        s = SessionState()
        s.pending_ask_event.set()
        s.start_ask("ask-123")
        assert s.pending_ask_id == "ask-123"
        assert not s.pending_ask_event.is_set()
        assert s.pending_answers == {}

    def test_resolve_ask_sets_event_and_answers(self):
        s = SessionState()
        s.start_ask("ask-123")
        s.resolve_ask({"q1": "answer1"})
        assert s.pending_ask_event.is_set()
        assert s.pending_answers == {"q1": "answer1"}

    def test_clear_ask_resets_state(self):
        s = SessionState()
        s.start_ask("ask-123")
        s.resolve_ask({"q1": "answer1"})
        s.clear_ask()
        assert s.pending_ask_id is None
        assert s.pending_answers == {}

    def test_add_to_history(self):
        s = SessionState()
        s.add_to_history("user", {"text": "hello"})
        s.add_to_history("assistant", {"blocks": []})
        assert len(s.history) == 2
        assert s.history[0] == {"role": "user", "content": {"text": "hello"}}
        assert s.history[1] == {"role": "assistant", "content": {"blocks": []}}

    @pytest.mark.asyncio
    async def test_resolve_ask_unblocks_waiter(self):
        s = SessionState()
        s.start_ask("ask-123")

        async def delayed_resolve():
            await asyncio.sleep(0.05)
            s.resolve_ask({"q1": "yes"})

        asyncio.create_task(delayed_resolve())
        await asyncio.wait_for(s.pending_ask_event.wait(), timeout=2.0)
        assert s.pending_answers == {"q1": "yes"}

    def test_dedup_skips_duplicate_within_window(self):
        """Duplicate event within 10s window is skipped."""
        s = SessionState()
        s.push_sse("assistant_message", {"blocks": [{"type": "text", "content": "hi"}]})
        s.push_sse("assistant_message", {"blocks": [{"type": "text", "content": "hi"}]})
        assert s.sse_queue.qsize() == 1

    def test_dedup_allows_after_window(self):
        """Same event is allowed after the dedup window expires."""
        s = SessionState()
        data = {"blocks": [{"type": "text", "content": "hi"}]}

        # First push
        s.push_sse("assistant_message", data)
        assert s.sse_queue.qsize() == 1

        # Simulate time passing beyond the 10s window
        with patch("backend.session.time.monotonic", return_value=100.0):
            # Set the first hash timestamp to 80.0 (20s ago)
            for h in list(s._recent_hashes):
                s._recent_hashes[h] = 80.0

            s.push_sse("assistant_message", data)
            assert s.sse_queue.qsize() == 2

    def test_dedup_allows_different_events(self):
        """Different events are not deduped."""
        s = SessionState()
        s.push_sse("assistant_message", {"blocks": [{"type": "text", "content": "hi"}]})
        s.push_sse("assistant_message", {"blocks": [{"type": "text", "content": "bye"}]})
        assert s.sse_queue.qsize() == 2

    def test_dedup_cleanup_removes_old_hashes(self):
        """Hashes older than 60s are cleaned up."""
        s = SessionState()
        # Manually seed old hash
        s._recent_hashes["old_hash"] = 0.0

        with patch("backend.session.time.monotonic", return_value=100.0):
            s.push_sse("test", {"key": "val"})
            # old_hash should be cleaned up
            assert "old_hash" not in s._recent_hashes

    def test_ping_events_bypass_dedup(self):
        """Ping events are never deduplicated."""
        s = SessionState()
        s.push_sse("ping", {})
        s.push_sse("ping", {})
        assert s.sse_queue.qsize() == 2

    def test_agent_running_false_initially(self):
        s = SessionState()
        assert s.agent_running is False

    @pytest.mark.asyncio
    async def test_agent_running_true_when_task_active(self):
        s = SessionState()
        s.agent_task = asyncio.create_task(asyncio.sleep(10))
        assert s.agent_running is True
        s.agent_task.cancel()
        with suppress(asyncio.CancelledError):
            await s.agent_task

    @pytest.mark.asyncio
    async def test_agent_running_false_when_task_done(self):
        s = SessionState()
        s.agent_task = asyncio.create_task(asyncio.sleep(0))
        await s.agent_task
        assert s.agent_running is False


class TestSessionManager:
    def test_session_state_mode_default(self):
        """SessionState defaults mode to 'normal'."""
        s = SessionState()
        assert s.mode == "normal"

    def test_session_state_mode_app_builder(self):
        """SessionState accepts mode='app-builder'."""
        s = SessionState(mode="app-builder")
        assert s.mode == "app-builder"

    def test_session_manager_create_with_mode(self):
        """SessionManager.create passes mode to SessionState."""
        mgr = SessionManager()
        s = mgr.create(mode="app-builder")
        assert s.mode == "app-builder"

    def test_session_manager_create_default_mode(self):
        """SessionManager.create defaults mode to 'normal'."""
        mgr = SessionManager()
        s = mgr.create()
        assert s.mode == "normal"

    def test_create_and_get(self):
        mgr = SessionManager()
        s = mgr.create()
        assert mgr.get(s.session_id) is s

    def test_get_nonexistent_returns_none(self):
        mgr = SessionManager()
        assert mgr.get("nonexistent") is None

    def test_remove(self):
        mgr = SessionManager()
        s = mgr.create()
        mgr.remove(s.session_id)
        assert mgr.get(s.session_id) is None

    def test_list_ids(self):
        mgr = SessionManager()
        s1 = mgr.create()
        s2 = mgr.create()
        ids = mgr.list_ids()
        assert s1.session_id in ids
        assert s2.session_id in ids
