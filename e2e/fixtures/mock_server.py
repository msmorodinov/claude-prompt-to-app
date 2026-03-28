"""Test server that uses mock agent instead of real Claude SDK.

Run: python -m e2e.fixtures.mock_server
From project root.
"""

import asyncio
import json
import sys
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from backend.session import SessionManager, SessionState


async def run_mock_agent(session: SessionState, message: str) -> None:
    """Simulate a Claude agent with canned responses."""
    await asyncio.sleep(0.1)

    # Step 1: Show welcome text
    session.push_sse(
        "assistant_message",
        {
            "blocks": [
                {
                    "type": "text",
                    "content": "Welcome to the Positioning Workshop! Let's find your unique position.",
                },
                {
                    "type": "section_header",
                    "title": "GETTING STARTED",
                    "subtitle": "Tell me about your company",
                },
            ]
        },
    )

    await asyncio.sleep(0.1)

    # Step 2: Ask initial questions
    ask_id = "mock-ask-1"
    session.push_sse(
        "ask_message",
        {
            "id": ask_id,
            "preamble": "I need to understand your business first.",
            "questions": [
                {
                    "type": "free_text",
                    "id": "company_desc",
                    "label": "What does your company do?",
                    "placeholder": "We build...",
                    "multiline": True,
                },
                {
                    "type": "single_select",
                    "id": "stage",
                    "label": "What stage is your company?",
                    "options": ["Pre-seed", "Seed", "Series A+"],
                },
            ],
        },
    )

    # Wait for user answer
    session.start_ask(ask_id)
    try:
        await asyncio.wait_for(session.pending_ask_event.wait(), timeout=300)
    except asyncio.TimeoutError:
        session.push_sse("error", {"message": "Timeout"})
        session.clear_ask()
        return

    answers = session.pending_answers
    session.clear_ask()
    session.push_sse("user_message", {"answers": answers})

    await asyncio.sleep(0.2)

    # Step 3: Final result
    session.push_sse(
        "assistant_message",
        {
            "blocks": [
                {
                    "type": "final_result",
                    "content": "We help FMCG brand managers launch products faster.",
                },
            ]
        },
    )

    session.push_sse("done", {})


@asynccontextmanager
async def lifespan(app: FastAPI):
    yield


app = FastAPI(title="Mock Workshop", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
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

    asyncio.create_task(run_mock_agent(session, message))
    return {"session_id": session.session_id}


@app.get("/stream")
async def stream(session_id: str) -> EventSourceResponse:
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    async def event_generator():
        while True:
            try:
                event = await asyncio.wait_for(
                    session.sse_queue.get(), timeout=30.0
                )
                yield {
                    "event": event["event"],
                    "data": json.dumps(event["data"]),
                }
                if event["event"] in ("done", "error"):
                    break
            except asyncio.TimeoutError:
                yield {"event": "ping", "data": "{}"}

    return EventSourceResponse(event_generator())


@app.post("/answers")
async def answers(request: Request) -> dict:
    body = await request.json()
    session_id = body.get("session_id")
    ask_id = body.get("ask_id")
    user_answers = body.get("answers", {})

    if not session_id or not ask_id:
        raise HTTPException(status_code=400, detail="Missing fields")

    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.pending_ask_id != ask_id:
        raise HTTPException(status_code=409, detail="No matching ask")

    session.resolve_ask(user_answers)
    return {"status": "ok"}


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=8001)
    args = parser.parse_args()
    uvicorn.run(app, host="0.0.0.0", port=args.port)
