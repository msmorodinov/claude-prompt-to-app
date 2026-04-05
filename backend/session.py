"""In-memory session state and SSE event deduplication."""

from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import time
import uuid
from dataclasses import dataclass, field
from typing import Any

logger = logging.getLogger(__name__)

DEDUP_WINDOW_SECONDS = 10.0
DEDUP_CLEANUP_SECONDS = 60.0


@dataclass
class SessionState:
    session_id: str = field(default_factory=lambda: uuid.uuid4().hex[:12])
    user_id: str = "anonymous"
    app_id: int | None = None
    prompt_version_id: int | None = None
    edit_app_id: int | None = None
    status: str = "idle"  # idle | active | waiting_input | done | error
    sse_queue: asyncio.Queue[dict[str, Any]] = field(default_factory=asyncio.Queue)
    pending_ask_id: str | None = None
    pending_ask_event: asyncio.Event = field(default_factory=asyncio.Event)
    pending_answers: dict[str, Any] = field(default_factory=dict)
    history: list[dict[str, Any]] = field(default_factory=list)
    sdk_session_id: str | None = None
    agent_task: asyncio.Task[None] | None = field(default=None, repr=False)
    _event_seq: int = 0
    _recent_hashes: dict[str, float] = field(default_factory=dict)
    _admin_queues: list[asyncio.Queue[dict[str, Any]]] = field(default_factory=list)

    @property
    def agent_running(self) -> bool:
        return self.agent_task is not None and not self.agent_task.done()

    @property
    def agent_dead(self) -> bool:
        return self.agent_task is not None and self.agent_task.done()

    @property
    def agent_error(self) -> BaseException | None:
        if self.agent_task is not None and self.agent_task.done():
            try:
                return self.agent_task.exception()
            except asyncio.CancelledError:
                return None
        return None

    async def cleanup_dead_agent(self) -> None:
        if self.pending_ask_id is not None:
            self.clear_ask()
        if self.status in ("active", "waiting_input"):
            await self.set_status("error")

    def _is_duplicate(self, event_type: str, data: dict[str, Any]) -> bool:
        """Check and record SSE event hash for deduplication."""
        if event_type == "ping":
            return False

        now = time.monotonic()
        event_hash = hashlib.md5(
            f"{event_type}:{json.dumps(data, sort_keys=True)}".encode()
        ).hexdigest()

        last_seen = self._recent_hashes.get(event_hash)
        if last_seen is not None and (now - last_seen) < DEDUP_WINDOW_SECONDS:
            logger.warning("Skipping duplicate SSE event: %s", event_type)
            return True

        self._recent_hashes[event_hash] = now

        # Periodic cleanup of stale hashes
        self._recent_hashes = {
            h: ts for h, ts in self._recent_hashes.items()
            if (now - ts) <= DEDUP_CLEANUP_SECONDS
        }
        return False

    def push_sse(self, event_type: str, data: dict[str, Any]) -> None:
        if self._is_duplicate(event_type, data):
            return

        self._event_seq += 1
        logger.info("SSE #%d: %s", self._event_seq, event_type)
        event = {"event": event_type, "data": data}
        self.sse_queue.put_nowait(event)
        for q in self._admin_queues:
            try:
                q.put_nowait(event)
            except asyncio.QueueFull:
                pass

    def start_ask(self, ask_id: str) -> None:
        self.pending_ask_id = ask_id
        self.pending_ask_event.clear()
        self.pending_answers = {}

    def resolve_ask(self, answers: dict[str, Any]) -> None:
        self.pending_answers = answers
        self.pending_ask_event.set()

    def clear_ask(self) -> None:
        self.pending_ask_id = None
        self.pending_answers = {}

    async def set_status(self, new_status: str) -> None:
        """Update in-memory status and persist to DB in one call."""
        from backend.db import update_session_status

        self.status = new_status
        await update_session_status(self.session_id, new_status)

    def add_to_history(self, role: str, content: dict[str, Any]) -> None:
        self.history.append({"role": role, "content": content})

    def add_admin_queue(self) -> asyncio.Queue[dict[str, Any]]:
        q: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=100)
        self._admin_queues.append(q)
        return q

    def remove_admin_queue(self, q: asyncio.Queue[dict[str, Any]]) -> None:
        try:
            self._admin_queues.remove(q)
        except ValueError:
            pass


class SessionManager:
    """Manages multiple concurrent sessions keyed by ID."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}

    def create(
        self,
        user_id: str = "anonymous",
        app_id: int | None = None,
        prompt_version_id: int | None = None,
        edit_app_id: int | None = None,
    ) -> SessionState:
        session = SessionState(
            user_id=user_id,
            app_id=app_id,
            prompt_version_id=prompt_version_id,
            edit_app_id=edit_app_id,
        )
        self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str) -> SessionState | None:
        return self._sessions.get(session_id)

    def remove(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def list_ids(self) -> list[str]:
        return list(self._sessions.keys())

    def list_all(self) -> list[SessionState]:
        return list(self._sessions.values())
