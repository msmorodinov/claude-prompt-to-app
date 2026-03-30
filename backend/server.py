"""FastAPI server: SSE streaming, /chat, /answers endpoints."""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from starlette.responses import StreamingResponse

from backend.agent import run_agent
from backend.db import (
    get_all_sessions_admin,
    get_session,
    get_sessions_by_user,
    init_db,
    save_message,
    save_session,
)
from backend.session import SessionManager

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

APP_CONFIG_PATH = Path(__file__).parent / "app.json"


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Prompt-to-App", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:4920",
        "http://localhost:4921",
        "http://100.96.19.118:4920",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions = SessionManager()

_SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
}

TERMINAL_EVENTS = frozenset(("done", "error"))


async def _sse_generator(queue: asyncio.Queue[dict]) -> ...:
    """Yield SSE-formatted events from a queue, with 30s keepalive pings."""
    while True:
        try:
            event = await asyncio.wait_for(queue.get(), timeout=30.0)
            yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"
            if event["event"] in TERMINAL_EVENTS:
                break
        except asyncio.TimeoutError:
            yield ": ping\n\n"


def _sse_response(queue: asyncio.Queue[dict]) -> StreamingResponse:
    return StreamingResponse(
        _sse_generator(queue),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


def _get_user_id(request: Request) -> str:
    return request.headers.get("x-user-id", "anonymous")


@app.post("/chat")
async def chat(request: Request) -> dict:
    body = await request.json()
    message = body.get("message", "")
    session_id = body.get("session_id")
    user_id = _get_user_id(request)

    if session_id:
        session = sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
        if session.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not your session")
    else:
        session = sessions.create(user_id=user_id)

    if session.agent_running:
        raise HTTPException(status_code=409, detail="Agent is already running")

    session.add_to_history("user", {"text": message})
    await save_message(session.session_id, "user", {"text": message})
    session.agent_task = asyncio.create_task(run_agent(session, message))

    return {"session_id": session.session_id}


@app.get("/stream")
async def stream(session_id: str) -> StreamingResponse:
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")
    return _sse_response(session.sse_queue)


@app.post("/answers")
async def submit_answers(request: Request) -> dict:
    body = await request.json()
    session_id = body.get("session_id")
    ask_id = body.get("ask_id")
    answers = body.get("answers", {})
    user_id = _get_user_id(request)

    if not session_id or not ask_id:
        raise HTTPException(status_code=400, detail="session_id and ask_id required")

    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your session")

    if session.pending_ask_id != ask_id:
        raise HTTPException(status_code=409, detail="No matching pending ask")

    session.resolve_ask(answers)
    return {"status": "ok"}


@app.post("/sessions/create")
async def create_session(request: Request) -> dict:
    user_id = _get_user_id(request)
    session = sessions.create(user_id=user_id)
    await save_session(session.session_id, user_id=user_id)
    return {"session_id": session.session_id}


@app.get("/sessions")
async def list_sessions(request: Request) -> list:
    user_id = _get_user_id(request)
    return await get_sessions_by_user(user_id)


@app.get("/sessions/{session_id}")
async def load_session_history(session_id: str, request: Request) -> list:
    user_id = _get_user_id(request)
    live = sessions.get(session_id)
    if live and live.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your session")
    return await get_session(session_id)


# --- Admin endpoints ---


@app.get("/admin/sessions")
async def admin_list_sessions() -> list:
    """All sessions with status info for admin dashboard."""
    # Merge in-memory status for active sessions
    db_sessions = await get_all_sessions_admin()
    active_ids = {s.session_id: s for s in sessions.list_all()}
    for row in db_sessions:
        live = active_ids.get(row["id"])
        if live:
            row["status"] = live.status
    return db_sessions


@app.get("/admin/sessions/{session_id}/stream")
async def admin_session_stream(session_id: str) -> StreamingResponse:
    """Read-only SSE stream for admin monitoring."""
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    admin_queue = session.add_admin_queue()

    async def event_generator():
        try:
            async for chunk in _sse_generator(admin_queue):
                yield chunk
        finally:
            session.remove_admin_queue(admin_queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


@app.get("/admin/sessions/{session_id}/history")
async def admin_session_history(session_id: str) -> list:
    """Full message history for admin view."""
    return await get_session(session_id)


@app.get("/config")
async def config() -> dict:
    try:
        return json.loads(APP_CONFIG_PATH.read_text())
    except FileNotFoundError:
        return {"title": "App"}


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


if __name__ == "__main__":
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4910)
    args = parser.parse_args()
    uvicorn.run(app, host="0.0.0.0", port=args.port)
