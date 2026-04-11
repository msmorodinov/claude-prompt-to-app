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
    meta = _session_meta.get(session.session_id, {})
    await asyncio.sleep(0.1)

    # Step 1: Show welcome text
    blocks_1 = [
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
    session.push_sse("assistant_message", {"blocks": blocks_1})
    meta["history"].append({"role": "assistant", "content": {"blocks": blocks_1}})

    await asyncio.sleep(0.1)

    # Step 2: Ask initial questions
    ask_id = "mock-ask-1"
    ask_data_1 = {
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
    }
    session.push_sse("ask_message", ask_data_1)
    meta["history"].append({"role": "assistant", "content": {"ask_id": ask_id, **ask_data_1}})

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
    meta["history"].append({"role": "user", "content": {"answers": answers}})

    await asyncio.sleep(0.2)

    # Step 3: Show all renamed display widgets
    blocks_3 = [
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
    session.push_sse("assistant_message", {"blocks": blocks_3})
    meta["history"].append({"role": "assistant", "content": {"blocks": blocks_3}})

    await asyncio.sleep(0.1)

    # Step 4: Second ask — slider_scale + tag_input
    ask_id_2 = "mock-ask-2"
    ask_data_2 = {
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
    }
    session.push_sse("ask_message", ask_data_2)
    meta["history"].append({"role": "assistant", "content": {"ask_id": ask_id_2, **ask_data_2}})

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
    meta["history"].append({"role": "user", "content": {"answers": answers_2}})

    await asyncio.sleep(0.1)

    # Step 5: Final result with copyable, timer, metric bars
    blocks_5 = [
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
    session.push_sse("assistant_message", {"blocks": blocks_5})
    meta["history"].append({"role": "assistant", "content": {"blocks": blocks_5}})

    meta["status"] = "done"
    meta["message_count"] += 1
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

# In-memory history store for mock server
_session_meta: dict[str, dict] = {}  # session_id -> {title, message_count, history}

# In-memory apps store for mock server
_apps: list[dict] = []
_app_id_counter = 0


def _get_user_id(request: Request) -> str:
    return request.headers.get("x-user-id", "anonymous")


@app.post("/test/reset")
async def test_reset() -> dict:
    """Reset all mock server state between tests."""
    global _app_id_counter
    _apps.clear()
    _app_id_counter = 0
    _session_meta.clear()
    for sid in list(sessions._sessions.keys()):
        sessions.remove(sid)
    return {"status": "reset"}


@app.post("/sessions/create")
async def create_session(request: Request) -> dict:
    user_id = _get_user_id(request)
    session = sessions.create(user_id=user_id)
    _session_meta[session.session_id] = {
        "title": None,
        "message_count": 0,
        "status": "idle",
        "history": [],
    }
    return {"session_id": session.session_id}


@app.get("/sessions")
async def list_sessions(request: Request) -> list:
    user_id = _get_user_id(request)
    return [
        {
            "id": s.session_id,
            "created_at": "2026-01-01T00:00:00",
            "title": _session_meta.get(s.session_id, {}).get("title"),
            "status": _session_meta.get(s.session_id, {}).get("status", "idle"),
            "message_count": _session_meta.get(s.session_id, {}).get("message_count", 0),
        }
        for s in sessions.list_all()
        if s.user_id == user_id
    ]


@app.get("/sessions/{session_id}")
async def load_session(session_id: str) -> list:
    meta = _session_meta.get(session_id, {})
    return meta.get("history", [])


@app.get("/config")
async def config() -> dict:
    return {"title": "Test App"}


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

    meta = _session_meta.setdefault(session.session_id, {
        "title": None, "message_count": 0, "status": "idle", "history": [],
    })
    meta["history"].append({"role": "user", "content": {"text": message}})
    meta["message_count"] += 1
    if meta["title"] is None:
        meta["title"] = message[:80]
    meta["status"] = "active"

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
    user_id = _get_user_id(request)

    if not session_id or not ask_id:
        raise HTTPException(status_code=400, detail="Missing fields")

    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    if session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your session")

    if session.pending_ask_id != ask_id:
        raise HTTPException(status_code=409, detail="No matching ask")

    session.resolve_ask(user_answers)
    return {"status": "ok"}


# --- Public app endpoints ---

@app.get("/apps")
async def list_public_apps() -> list:
    return [a for a in _apps if a.get("is_active")]


@app.get("/api/environment")
async def environment() -> dict:
    return {
        "widgets": {
            "display": ["text", "section_header", "data_table", "comparison",
                        "category_list", "quote_highlight", "metric_bars",
                        "copyable", "progress", "final_result", "timer"],
            "input": ["single_select", "multi_select", "free_text",
                      "rank_priorities", "slider_scale", "matrix_2x2", "tag_input"],
        },
        "tools": [
            {"name": "show", "behavior": "fire-and-forget"},
            {"name": "ask", "behavior": "blocking"},
        ],
    }


@app.get("/api/mcp-servers")
async def mcp_servers() -> list:
    return [
        {"name": "test-server", "command": "npx test-mcp", "status": "connected"},
        {"name": "auth-server", "command": "https://auth.example.com/mcp", "status": "needs_auth"},
    ]


# --- Admin app endpoints ---

@app.get("/admin/apps")
async def admin_list_apps() -> list:
    return sorted(_apps, key=lambda a: a["created_at"], reverse=True)


@app.post("/admin/apps", status_code=201)
async def admin_create_app(request: Request) -> dict:
    global _app_id_counter
    body = await request.json()
    slug = body.get("slug", "")
    title = body.get("title", "")

    if not slug or not title:
        raise HTTPException(status_code=422, detail="slug and title required")

    if any(a["slug"] == slug for a in _apps):
        raise HTTPException(status_code=409, detail="Slug already exists")

    _app_id_counter += 1
    app_body = body.get("body", "")
    now = "2026-01-01T00:00:00"

    new_app: dict = {
        "id": _app_id_counter,
        "slug": slug,
        "title": title,
        "subtitle": body.get("subtitle", ""),
        "is_active": bool(app_body),
        "current_version_id": _app_id_counter * 100 if app_body else None,
        "created_at": now,
        "updated_at": now,
        "version_count": 1 if app_body else 0,
        "body": app_body,
        "versions": [],
    }

    if app_body:
        new_app["versions"].append({
            "id": _app_id_counter * 100,
            "app_id": _app_id_counter,
            "version_number": 1,
            "body": app_body,
            "change_note": "Initial version",
            "created_at": now,
        })

    _apps.append(new_app)
    return new_app


@app.get("/admin/apps/{app_id}")
async def admin_get_app(app_id: int) -> dict:
    for a in _apps:
        if a["id"] == app_id:
            result = {**a}
            result["current_version"] = a["versions"][-1] if a["versions"] else None
            return result
    raise HTTPException(status_code=404, detail="App not found")


@app.put("/admin/apps/{app_id}")
async def admin_update_app(app_id: int, request: Request) -> dict:
    body = await request.json()
    for a in _apps:
        if a["id"] == app_id:
            if body.get("title") is not None:
                a["title"] = body["title"]
            if body.get("subtitle") is not None:
                a["subtitle"] = body["subtitle"]
            if body.get("is_active") is not None:
                a["is_active"] = body["is_active"]
            if body.get("body") is not None:
                a["body"] = body["body"]
                ver_id = (a["id"] * 100) + len(a["versions"]) + 1
                a["versions"].append({
                    "id": ver_id,
                    "app_id": a["id"],
                    "version_number": len(a["versions"]) + 1,
                    "body": body["body"],
                    "change_note": body.get("change_note", ""),
                    "created_at": a["updated_at"],
                })
                a["current_version_id"] = ver_id
                a["version_count"] = len(a["versions"])
            return a
    raise HTTPException(status_code=404, detail="App not found")


@app.get("/admin/apps/{app_id}/versions")
async def admin_app_versions(app_id: int) -> list:
    for a in _apps:
        if a["id"] == app_id:
            return a["versions"]
    raise HTTPException(status_code=404, detail="App not found")


# --- Admin session endpoints ---

@app.get("/admin/sessions")
async def admin_list_sessions() -> list:
    return [
        {
            "id": s.session_id,
            "user_id": s.user_id,
            "status": _session_meta.get(s.session_id, {}).get("status", "idle"),
            "message_count": _session_meta.get(s.session_id, {}).get("message_count", 0),
            "created_at": "2026-01-01T00:00:00",
            "title": _session_meta.get(s.session_id, {}).get("title"),
        }
        for s in sessions.list_all()
    ]


@app.get("/admin/sessions/{session_id}/stream")
async def admin_session_stream(session_id: str) -> EventSourceResponse:
    session = sessions.get(session_id)
    if not session:
        raise HTTPException(status_code=404, detail="Session not found")

    admin_queue = session.add_admin_queue()

    async def event_generator():
        try:
            while True:
                try:
                    event = await asyncio.wait_for(admin_queue.get(), timeout=30.0)
                    yield {
                        "event": event["event"],
                        "data": json.dumps(event["data"]),
                    }
                    if event["event"] in ("done", "error"):
                        break
                except asyncio.TimeoutError:
                    yield {"event": "ping", "data": "{}"}
        finally:
            session.remove_admin_queue(admin_queue)

    return EventSourceResponse(event_generator())


@app.get("/admin/sessions/{session_id}/history")
async def admin_session_history(session_id: str) -> list:
    meta = _session_meta.get(session_id, {})
    return meta.get("history", [])


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4910)
    args = parser.parse_args()
    uvicorn.run(app, host="0.0.0.0", port=args.port)
