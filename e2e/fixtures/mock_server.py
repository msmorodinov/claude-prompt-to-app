"""Test server that uses mock agent instead of real Claude SDK.

Run: python -m e2e.fixtures.mock_server
From project root.
"""

import asyncio
import json
import sys
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

    # Step 3: Show all renamed display widgets
    session.push_sse(
        "assistant_message",
        {
            "blocks": [
                {
                    "type": "data_table",
                    "columns": ["Name", "Position", "Price", "Weakness"],
                    "rows": [
                        ["Acme Corp", "Fast and cheap", "Free", "No API"],
                        ["Globex", "Enterprise-grade", "$$$", "Slow"],
                        ["Initech", "AI-powered", "$$", "Buggy"],
                    ],
                    "highlights": {
                        "table_stakes": ["Speed", "Easy onboarding"],
                        "white_space": ["Compliance", "Local integrations"],
                    },
                },
                {
                    "type": "comparison",
                    "left": {"label": "Draft", "content": "We make a platform for brands"},
                    "right": {"label": "Final", "content": "We help FMCG brand managers launch compliant products 3x faster"},
                    "note": "Much more specific and verifiable",
                },
                {
                    "type": "category_list",
                    "categories": [
                        {"label": "Agreed", "items": ["Customer = brand managers", "Gap = compliance"], "style": "success"},
                        {"label": "Contradicted", "items": ["Core bet: Alice says go deep, Bob says expand"], "style": "warning"},
                        {"label": "Surprises", "items": ["Nobody mentioned speed"]},
                    ],
                },
                {
                    "type": "quote_highlight",
                    "quote": "Nobody is doing compliance properly in this space.",
                    "attribution": "Founder",
                    "note": "This is the key insight.",
                },
            ]
        },
    )

    await asyncio.sleep(0.1)

    # Step 4: Second ask — slider_scale + tag_input
    ask_id_2 = "mock-ask-2"
    session.push_sse(
        "ask_message",
        {
            "id": ask_id_2,
            "preamble": "A couple more things before we wrap up.",
            "questions": [
                {
                    "type": "slider_scale",
                    "id": "pmf_confidence",
                    "label": "How confident are you in product-market fit?",
                    "min": 1,
                    "max": 10,
                    "step": 1,
                    "min_label": "Not at all",
                    "max_label": "Absolutely",
                },
                {
                    "type": "tag_input",
                    "id": "brand_words",
                    "label": "5 words that describe your brand",
                    "min_tags": 1,
                    "max_tags": 5,
                    "placeholder": "Type a word and press Enter",
                },
            ],
        },
    )

    session.start_ask(ask_id_2)
    try:
        await asyncio.wait_for(session.pending_ask_event.wait(), timeout=300)
    except asyncio.TimeoutError:
        session.push_sse("error", {"message": "Timeout"})
        session.clear_ask()
        return

    answers_2 = session.pending_answers
    session.clear_ask()
    session.push_sse("user_message", {"answers": answers_2})

    await asyncio.sleep(0.1)

    # Step 5: Final result with copyable, timer, metric bars
    session.push_sse(
        "assistant_message",
        {
            "blocks": [
                {
                    "type": "final_result",
                    "content": "We help FMCG brand managers launch products faster.",
                },
                {
                    "type": "copyable",
                    "label": "Share with your team",
                    "content": "Our positioning: We help FMCG brand managers launch compliant products 3x faster.",
                },
                {
                    "type": "timer",
                    "seconds": 5,
                    "label": "Review your statement",
                },
                {
                    "type": "metric_bars",
                    "metrics": [
                        {"label": "Specificity", "value": 8, "max": 10},
                        {"label": "Verifiability", "value": 7, "max": 10},
                        {"label": "Compression", "value": 9, "max": 10},
                        {"label": "Differentiation", "value": 8, "max": 10},
                    ],
                },
                {
                    "type": "progress",
                    "label": "Workshop complete",
                    "percent": 100,
                },
            ]
        },
    )

    session.push_sse("done", {})


app = FastAPI(title="Mock Workshop")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

sessions = SessionManager()


@app.post("/sessions/create")
async def create_session() -> dict:
    session = sessions.create()
    return {"session_id": session.session_id}


@app.get("/sessions/{session_id}")
async def load_session(session_id: str) -> list:
    return []


@app.get("/config")
async def config() -> dict:
    return {"title": "Test App"}


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

    if session.agent_running:
        raise HTTPException(status_code=409, detail="Agent is already running")

    session.agent_task = asyncio.create_task(run_mock_agent(session, message))
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
    parser.add_argument("--port", type=int, default=4911)
    args = parser.parse_args()
    uvicorn.run(app, host="0.0.0.0", port=args.port)
