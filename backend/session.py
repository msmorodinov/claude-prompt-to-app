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
    sse_queue: asyncio.Queue[dict[str, Any]] = field(default_factory=asyncio.Queue)
    pending_ask_id: str | None = None
    pending_ask_event: asyncio.Event = field(default_factory=asyncio.Event)
    pending_answers: dict[str, Any] = field(default_factory=dict)
    history: list[dict[str, Any]] = field(default_factory=list)
    _event_seq: int = 0
    _recent_hashes: dict[str, float] = field(default_factory=dict)

    def push_sse(self, event_type: str, data: dict[str, Any]) -> None:
        now = time.monotonic()

        if event_type != "ping":
            event_hash = hashlib.md5(
                f"{event_type}:{json.dumps(data, sort_keys=True)}".encode()
            ).hexdigest()

            last_seen = self._recent_hashes.get(event_hash)
            if last_seen is not None and (now - last_seen) < DEDUP_WINDOW_SECONDS:
                logger.warning("Skipping duplicate SSE event: %s", event_type)
                return

            self._recent_hashes[event_hash] = now

            stale = [
                h for h, ts in self._recent_hashes.items()
                if (now - ts) > DEDUP_CLEANUP_SECONDS
            ]
            for h in stale:
                del self._recent_hashes[h]

        self._event_seq += 1
        logger.info("SSE #%d: %s", self._event_seq, event_type)
        self.sse_queue.put_nowait({"event": event_type, "data": data})

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

    def add_to_history(self, role: str, content: dict[str, Any]) -> None:
        self.history.append({"role": role, "content": content})


class SessionManager:
    """Manages multiple concurrent sessions (single-user but keyed by ID)."""

    def __init__(self) -> None:
        self._sessions: dict[str, SessionState] = {}

    def create(self) -> SessionState:
        session = SessionState()
        self._sessions[session.session_id] = session
        return session

    def get(self, session_id: str) -> SessionState | None:
        return self._sessions.get(session_id)

    def remove(self, session_id: str) -> None:
        self._sessions.pop(session_id, None)

    def list_ids(self) -> list[str]:
        return list(self._sessions.keys())
