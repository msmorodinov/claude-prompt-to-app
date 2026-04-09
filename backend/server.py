"""FastAPI server: SSE streaming, /chat, /answers endpoints."""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.responses import StreamingResponse

from backend.admin_apps import router as admin_apps_router
from backend.agent import run_agent
from backend.validator import check_rate_limit, validate_prompt
from backend.db import (
    get_active_apps,
    get_all_sessions_admin,
    get_app_by_id,
    get_app_config_from_db,
    get_default_app,
    get_session,
    get_session_meta,
    get_session_owner,
    get_sessions_by_user,
    init_db,
    save_message,
    save_session,
    update_session_title,
)
from backend.schemas import DISPLAY_WIDGETS, INPUT_WIDGETS
from backend.session import SessionManager, SessionState

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(title="Prompt-to-App", lifespan=lifespan)
app.include_router(admin_apps_router)

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


async def _sse_generator(
    session: "SessionState", queue: asyncio.Queue[dict] | None = None,
) -> ...:
    """Yield SSE events with liveness detection for dead agents."""
    q = queue or session.sse_queue
    while True:
        try:
            event = await asyncio.wait_for(q.get(), timeout=15.0)
            yield f"event: {event['event']}\ndata: {json.dumps(event['data'])}\n\n"
            if event["event"] in TERMINAL_EVENTS:
                break
        except asyncio.TimeoutError:
            if session.agent_dead:
                err = session.agent_error
                msg = str(err) if err else "Agent stopped unexpectedly"
                await session.cleanup_dead_agent()
                yield f"event: error\ndata: {json.dumps({'message': msg})}\n\n"
                break
            # No agent running and terminal status — nothing more to stream
            if not session.agent_running and session.status in ("done", "error", "idle"):
                break
            yield ": ping\n\n"


def _sse_response(session: "SessionState") -> StreamingResponse:
    return StreamingResponse(
        _sse_generator(session),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


def _get_user_id(request: Request) -> str:
    return request.headers.get("x-user-id", "anonymous")


def _get_display_name(request: Request) -> str | None:
    return request.headers.get("x-user-display-name") or None


async def _resolve_app(app_id: int | None) -> tuple[int | None, int | None]:
    """Resolve app_id to (app_id, prompt_version_id). Falls back to default app."""
    if app_id is not None:
        app_row = await get_app_by_id(app_id)
        if not app_row or not app_row["is_active"]:
            raise HTTPException(status_code=404, detail="App not found or inactive")
    else:
        app_row = await get_default_app()
    if not app_row:
        return None, None
    return app_row["id"], app_row["current_version_id"]


@app.post("/chat")
async def chat(request: Request) -> dict:
    body = await request.json()
    message = body.get("message", "")
    session_id = body.get("session_id")
    user_id = _get_user_id(request)

    if session_id:
        session = sessions.get(session_id)
        if not session:
            # Hydrate from DB (e.g. after server restart)
            db_meta = await get_session_meta(session_id)
            if not db_meta:
                raise HTTPException(status_code=404, detail="Session not found")
            if db_meta["user_id"] != user_id:
                raise HTTPException(status_code=403, detail="Not your session")
            session = SessionState(
                session_id=session_id,
                user_id=db_meta["user_id"],
                app_id=db_meta["app_id"],
                prompt_version_id=db_meta["prompt_version_id"],
                sdk_session_id=db_meta.get("sdk_session_id"),
                mode=db_meta.get("mode", "normal"),
            )
            sessions._sessions[session_id] = session
        if session.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not your session")
    else:
        app_id, pvid = await _resolve_app(None)
        session = sessions.create(user_id=user_id, app_id=app_id, prompt_version_id=pvid)
        await save_session(session.session_id, user_id=user_id, app_id=app_id, prompt_version_id=pvid, user_display_name=_get_display_name(request))

    if session.agent_running:
        raise HTTPException(status_code=409, detail="Agent is already running")

    session.add_to_history("user", {"text": message})
    await save_message(session.session_id, "user", {"text": message})
    await update_session_title(session.session_id, message[:80])
    session.agent_task = asyncio.create_task(run_agent(session, message))
    _attach_done_callback(session)

    return {"session_id": session.session_id}


def _attach_done_callback(session: SessionState) -> None:
    """Safety net: push SSE error if agent task crashes without handling it."""

    def _on_agent_done(task: asyncio.Task) -> None:
        if task.cancelled():
            return
        try:
            exc = task.exception()
        except asyncio.CancelledError:
            return
        if exc and session.status in ("active", "waiting_input"):
            session.push_sse("error", {"message": f"Agent crashed: {exc}"})
            if session.pending_ask_id:
                session.pending_ask_event.set()

    if session.agent_task is not None:
        session.agent_task.add_done_callback(_on_agent_done)


@app.post("/chat/retry")
async def retry_chat(request: Request) -> dict:
    body = await request.json()
    session_id = body.get("session_id")
    user_id = _get_user_id(request)

    if not session_id:
        raise HTTPException(status_code=400, detail="session_id required")

    session = sessions.get(session_id)
    if not session:
        # Hydrate from DB (e.g. after server restart)
        db_meta = await get_session_meta(session_id)
        if not db_meta:
            raise HTTPException(status_code=404, detail="Session not found")
        if db_meta["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not your session")
        session = SessionState(
            session_id=session_id,
            user_id=db_meta["user_id"],
            app_id=db_meta["app_id"],
            prompt_version_id=db_meta["prompt_version_id"],
            sdk_session_id=db_meta.get("sdk_session_id"),
            mode=db_meta.get("mode", "normal"),
        )
        sessions._sessions[session_id] = session
    if session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your session")
    # Cancel stale agent (e.g. stuck waiting on ask after SSE disconnect)
    if session.agent_running:
        session.agent_task.cancel()
        try:
            await session.agent_task
        except (asyncio.CancelledError, Exception):
            pass
        session.agent_task = None

    # Clean up zombie state
    if session.pending_ask_id:
        session.clear_ask()
    # Drain leftover SSE events
    while not session.sse_queue.empty():
        try:
            session.sse_queue.get_nowait()
        except Exception:
            break

    await session.set_status("active")
    session.agent_task = asyncio.create_task(
        run_agent(session, "Continue from where you left off. Don't repeat previous content.")
    )
    _attach_done_callback(session)

    return {"session_id": session.session_id}


@app.get("/stream")
async def stream(session_id: str) -> StreamingResponse:
    session = sessions.get(session_id)
    if not session:
        # Hydrate from DB so SSE can reconnect after server restart
        db_meta = await get_session_meta(session_id)
        if not db_meta:
            raise HTTPException(status_code=404, detail="Session not found")
        session = SessionState(
            session_id=session_id,
            user_id=db_meta["user_id"],
            app_id=db_meta["app_id"],
            prompt_version_id=db_meta["prompt_version_id"],
            sdk_session_id=db_meta.get("sdk_session_id"),
            mode=db_meta.get("mode", "normal"),
        )
        sessions._sessions[session_id] = session
    return _sse_response(session)


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
        # Hydrate from DB so stale asks can be answered after server restart
        db_meta = await get_session_meta(session_id)
        if not db_meta:
            raise HTTPException(status_code=404, detail="Session not found")
        if db_meta["user_id"] != user_id:
            raise HTTPException(status_code=403, detail="Not your session")
        session = SessionState(
            session_id=session_id,
            user_id=db_meta["user_id"],
            app_id=db_meta["app_id"],
            prompt_version_id=db_meta["prompt_version_id"],
            sdk_session_id=db_meta.get("sdk_session_id"),
            mode=db_meta.get("mode", "normal"),
        )
        sessions._sessions[session_id] = session

    if session.user_id != user_id:
        raise HTTPException(status_code=403, detail="Not your session")

    if session.pending_ask_id == ask_id:
        # Live ask — resolve normally
        session.resolve_ask(answers)
        return {"status": "ok"}

    # Stale ask (e.g. after server restart) — save answers and resume agent
    if session.agent_running:
        raise HTTPException(status_code=409, detail="Agent is already running")

    answers_text = "; ".join(f"{k}: {v}" for k, v in answers.items())
    resume_msg = f"The user answered the previous questions: {answers_text}. Continue."
    session.add_to_history("user", {"answers": answers})
    await save_message(session_id, "user", {"answers": answers})
    session.agent_task = asyncio.create_task(run_agent(session, resume_msg))
    _attach_done_callback(session)
    return {"status": "ok", "resumed": True}


@app.get("/apps")
async def list_apps_public() -> list:
    """Active apps for user app selector."""
    return await get_active_apps()


@app.post("/sessions/create")
async def create_session(request: Request) -> dict:
    user_id = _get_user_id(request)
    try:
        body = await request.json()
    except Exception:
        body = {}
    req_app_id = body.get("app_id") if body else None
    edit_app_id = body.get("edit_app_id") if body else None
    req_mode = body.get("mode") if body else None

    # Validate mode
    if req_mode is not None and req_mode not in ("normal", "app-builder"):
        raise HTTPException(status_code=422, detail="mode must be 'normal' or 'app-builder'")

    if edit_app_id is not None and not isinstance(edit_app_id, int):
        raise HTTPException(status_code=422, detail="edit_app_id must be an integer")

    # Validate edit target exists and is active
    if edit_app_id is not None:
        target = await get_app_by_id(edit_app_id)
        if not target:
            raise HTTPException(status_code=404, detail="Edit target app not found")
        if not target["is_active"]:
            raise HTTPException(status_code=403, detail="Cannot edit an archived app")

    # Determine mode
    mode = req_mode or "normal"

    if mode == "app-builder":
        # App Builder: no DB app lookup
        app_id = None
        prompt_version_id = None
    else:
        app_id, prompt_version_id = await _resolve_app(req_app_id)

    # edit_app_id only valid with app-builder mode
    if edit_app_id is not None and mode != "app-builder":
        raise HTTPException(status_code=400, detail="edit_app_id requires mode='app-builder'")

    session = sessions.create(
        user_id=user_id,
        app_id=app_id,
        prompt_version_id=prompt_version_id,
        edit_app_id=edit_app_id,
        mode=mode,
    )
    await save_session(
        session.session_id,
        user_id=user_id,
        app_id=app_id,
        prompt_version_id=prompt_version_id,
        user_display_name=_get_display_name(request),
        mode=mode,
    )
    return {"session_id": session.session_id}


@app.get("/sessions")
async def list_sessions(request: Request) -> list:
    user_id = _get_user_id(request)
    rows = await get_sessions_by_user(user_id)
    for row in rows:
        if row.get("mode") == "app-builder" and not row.get("app_name"):
            row["app_name"] = "App Builder"
    return rows


@app.get("/sessions/{session_id}")
async def load_session_history(session_id: str, request: Request) -> list:
    user_id = _get_user_id(request)
    live = sessions.get(session_id)
    if live:
        if live.user_id != user_id:
            raise HTTPException(status_code=403, detail="Not your session")
    else:
        owner = await get_session_owner(session_id)
        if owner is not None and owner != user_id:
            raise HTTPException(status_code=403, detail="Not your session")
    return await get_session(session_id)


@app.get("/session-status")
async def session_status(session_id: str) -> dict:
    session = sessions.get(session_id)
    if not session:
        return {"status": "unknown", "agent_running": False}
    return {"status": session.status, "agent_running": session.agent_running}


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
        if row.get("mode") == "app-builder" and not row.get("app_name"):
            row["app_name"] = "App Builder"
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
            async for chunk in _sse_generator(session, queue=admin_queue):
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


@app.post("/admin/validate-prompt")
async def admin_validate_prompt(request: Request) -> JSONResponse:
    """Validate prompt MCP tool coverage via Sonnet."""
    client_ip = request.client.host if request.client else "unknown"
    if not check_rate_limit(client_ip):
        return JSONResponse(
            status_code=429,
            content={"error": "Too many validation requests. Try again in a minute."},
        )

    try:
        body = await request.json()
    except (json.JSONDecodeError, ValueError):
        return JSONResponse(
            status_code=400, content={"error": "Invalid JSON body"}
        )

    prompt_body = body.get("prompt_body", "")
    if len(prompt_body) > 50_000:
        return JSONResponse(
            status_code=400,
            content={"error": "Prompt too long (max 50K chars)"},
        )

    try:
        result = await validate_prompt(prompt_body)
        return JSONResponse(content=result)
    except (json.JSONDecodeError, ValueError) as e:
        logger.error("Validation parse error: %s", e)
        return JSONResponse(
            status_code=502,
            content={"error": "Validation service returned invalid response"},
        )
    except Exception:
        logger.exception("Validation error")
        return JSONResponse(
            status_code=502,
            content={"error": "Validation service unavailable"},
        )


def _widget_summary(schema: dict) -> dict:
    """Build a compact summary of a widget JSON schema."""
    props = schema.get("properties", {})
    required_list = schema.get("required", [])
    required_set = set(required_list)

    desc = next(
        (props.get(key, {}).get("description", "")
         for key in ("content", "label", "title", "quote")
         if props.get(key, {}).get("description")),
        "",
    )

    return {
        "type": props.get("type", {}).get("const", ""),
        "description": desc,
        "required": [f for f in required_list if f != "type"],
        "optional": [k for k in props if k not in required_set and k != "type"],
    }


# SECURITY: no auth — localhost only (widget catalog, no sensitive data)
@app.get("/api/environment")
async def environment_info() -> dict:
    """Widget and tool catalog for prompt authors."""
    return {
        "display_widgets": [_widget_summary(s) for s in DISPLAY_WIDGETS.values()],
        "input_widgets": [_widget_summary(s) for s in INPUT_WIDGETS.values()],
        "tools": [
            {"name": "show", "description": "Display content to the user", "behavior": "Fire-and-forget"},
            {"name": "ask", "description": "Ask questions and wait for response", "behavior": "Blocks until user submits"},
            {"name": "save_app", "description": "Save new app as draft (App Builder only)", "behavior": "Creates draft app"},
            {"name": "update_app", "description": "Update existing app prompt (App Builder edit mode)", "behavior": "Creates new version"},
            {"name": "WebSearch", "description": "Search the web", "behavior": "Built-in"},
            {"name": "WebFetch", "description": "Fetch URL content", "behavior": "Built-in"},
        ],
    }


@app.get("/config")
async def config(app_id: int | None = None) -> dict:
    return await get_app_config_from_db(app_id)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok"}


# --- Static file serving (production) ---

FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"

if FRONTEND_DIST.is_dir():
    app.mount("/assets", StaticFiles(directory=FRONTEND_DIST / "assets"), name="assets")

    @app.get("/{path:path}")
    async def spa_catch_all(path: str) -> FileResponse:
        if path.startswith("api/"):
            raise HTTPException(status_code=404, detail="Not found")
        file_path = (FRONTEND_DIST / path).resolve()
        if file_path.is_file() and str(file_path).startswith(str(FRONTEND_DIST.resolve())):
            return FileResponse(file_path)
        return FileResponse(FRONTEND_DIST / "index.html")


if __name__ == "__main__":
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=4910)
    args = parser.parse_args()
    uvicorn.run(app, host="0.0.0.0", port=args.port)
