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
from backend.db import get_session, get_sessions, init_db, save_message, save_session
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


@app.post("/chat")
async def chat(request: Request) -> dict:
    body = await request.json()
    message = body.get("message", "")
    session_id = body.get("session_id")

    if session_id:
        session = sessions.get(session_id)
        if not session:
            raise HTTPException(status_code=404, detail="Session not found")
    else:
        session = sessions.create()

    session.add_to_history("user", {"text": message})
    await save_message(session.session_id, "user", {"text": message})
    asyncio.create_task(run_agent(session, message))

    return {"session_id": session.session_id}


@app.get("/stream")
async def stream(session_id: str) -> StreamingResponse:
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(
                    session.sse_queue.get(), timeout=30.0
                )
                yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"
                if event["event"] in ("done", "error"):
                    break
            except asyncio.TimeoutError:
                yield ": ping\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@app.post("/answers")
async def submit_answers(request: Request) -> dict:
    body = await request.json()
    session_id = body.get("session_id")
    ask_id = body.get("ask_id")
    answers = body.get("answers", {})

    if not session_id or not ask_id:
        raise HTTPException(status_code=400, detail="session_id and ask_id required")

    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.pending_ask_id != ask_id:
        raise HTTPException(status_code=409, detail="No matching pending ask")

    session.resolve_ask(answers)
    return {"status": "ok"}


@app.post("/sessions/create")
async def create_session() -> dict:
    session = sessions.create()
    await save_session(session.session_id)
    return {"session_id": session.session_id}


@app.get("/sessions")
async def list_sessions() -> list:
    return await get_sessions()


@app.get("/sessions/{session_id}")
async def load_session_history(session_id: str) -> list:
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
