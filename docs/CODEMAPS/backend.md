# Backend Codemap

<!-- Generated: 2026-04-05 | Files scanned: 6 | Token estimate: ~900 -->

**Last Updated:** 2026-04-05
**Language:** Python 3.11+
**Framework:** FastAPI + claude-agent-sdk
**Entry Points:** server.py:app, agent.py:run_agent(), tools.py:create_tools()

## API Routes

### Session & Chat

| Method | Path | Handler | Purpose |
|--------|------|---------|---------|
| POST | `/chat` | server.py:chat() | Start/continue session, spawn agent |
| GET | `/stream` | server.py:stream() | SSE event stream |
| POST | `/answers` | server.py:answers() | Submit form, unblock ask tool |
| POST | `/sessions/create` | server.py:create_session() | Create new session |
| GET | `/sessions` | server.py:list_sessions() | Get user's sessions |
| GET | `/sessions/{id}` | server.py:get_session() | Load session history |
| GET | `/health` | server.py:health() | Liveness check |

### Public App List

| Method | Path | Handler | Purpose |
|--------|------|---------|---------|
| GET | `/apps` | server.py:list_apps() | List active apps |
| GET | `/config` | server.py:get_config() | Title + subtitle of default/current app |
| GET | `/api/environment` | server.py:get_environment() | Widget catalog for prompt authors |

### Admin CRUD

| Method | Path | Handler | Purpose |
|--------|------|---------|---------|
| GET | `/admin/apps` | admin_apps.py:list_apps_admin() | All apps with metadata |
| POST | `/admin/apps` | admin_apps.py:create_app_admin() | New app |
| GET | `/admin/apps/{id}` | admin_apps.py:get_app_admin() | App + current version |
| PUT | `/admin/apps/{id}` | admin_apps.py:update_app_admin() | Edit app (auto-new version) |
| GET | `/admin/apps/{id}/versions` | admin_apps.py:list_versions() | Version history |
| GET | `/admin/apps/{id}/versions/{vid}` | admin_apps.py:get_version() | Specific version |

### Session Monitoring

| Method | Path | Handler | Purpose |
|--------|------|---------|---------|
| GET | `/admin/sessions` | admin_apps.py:list_sessions_admin() | All sessions |
| GET | `/admin/sessions/{id}/stream` | admin_apps.py:stream_admin() | Read-only SSE |
| GET | `/admin/sessions/{id}/history` | admin_apps.py:get_history_admin() | Full message log |

## Handler Chain Example: POST /chat

```python
# server.py:chat(request)
async def chat(request: Request) -> dict:
    body = await request.json()  # {message, session_id?}
    message = body.get("message")
    session_id = body.get("session_id")
    user_id = _get_user_id(request)  # From X-User-Id header

    # Resolve or create session
    if session_id:
        session = sessions.get(session_id)
        if not session or session.user_id != user_id:
            raise HTTPException(403)
    else:
        app_id, pvid = await _resolve_app(None)  # Get default app
        session = sessions.create(user_id, app_id, pvid)
        await save_session(...)  # Persist to DB

    # Check agent not already running (prevents double-submit)
    if session.agent_running:
        raise HTTPException(409)

    # Record user message
    session.add_to_history("user", {"text": message})
    await save_message(...)  # Persist
    await update_session_title(session_id, message[:80])

    # Spawn agent task
    session.agent_task = asyncio.create_task(run_agent(session, message))
    _attach_done_callback(session)  # Cleanup on done/error

    return {"session_id": session.session_id}
```

## Agent Lifecycle

### agent.py:run_agent(session, user_message)

```python
async def run_agent(session: SessionState, user_message: str) -> None:
    # 1. Build system prompt
    framework = FRAMEWORK_PATH.read_text()  # framework.md
    app_prompt = await _get_prompt_for_session(session)  # Locked version
    system_prompt = f"{app_prompt}\n\n{framework}"

    # 2. Check if this is App Builder or edit mode
    is_builder = await _is_app_builder(session.app_id)
    is_edit_mode = is_builder and session.edit_app_id is not None
    if is_edit_mode:
        system_prompt += await _build_edit_context(session.edit_app_id)

    # 3. Create MCP tools
    tools = create_tools(
        session,
        session.session_id,
        include_save_app=is_builder,
        include_update_app=is_edit_mode,
    )

    # 4. Configure Claude SDK
    server = create_sdk_mcp_server(name="app", version="1.0.0", tools=tools)
    allowed_tools = ["mcp__app__show", "mcp__app__ask", "WebSearch", "WebFetch"]
    disallowed_tools = ["AskUserQuestion"]  # Requires TTY

    options = ClaudeAgentOptions(
        mcp_servers={"app": server},
        allowed_tools=allowed_tools,
        disallowed_tools=disallowed_tools,
        system_prompt=system_prompt,
        permission_mode="acceptEdits",
    )

    # 5. Run agent loop
    client = ClaudeSDKClient(options)
    await client.run(user_message, [run_agent_with_context(...)])
```

## MCP Tools

### show() — Fire-and-forget

```python
@tool("show", "Display content to user...", SHOW_SCHEMA)
async def show_tool(args: dict[str, Any]) -> dict[str, Any]:
    blocks = args.get("blocks", [])

    # 1. Send to browser via SSE
    session.push_sse("assistant_message", {"blocks": blocks})

    # 2. Record in session history
    session.add_to_history("assistant", {"blocks": blocks})

    # 3. Persist to DB
    await save_message(session_id, "assistant", {"blocks": blocks})
    await increment_message_count(session_id)

    # 4. Return immediately
    return _tool_response(f"Displayed {len(blocks)} block(s).")
```

### ask() — Blocking, waits for user

```python
@tool("ask", "Ask user questions...", ASK_SCHEMA)
async def ask_tool(args: dict[str, Any]) -> dict[str, Any]:
    ask_id = uuid.uuid4().hex[:8]
    preamble = args.get("preamble")
    questions = _normalize_questions(args.get("questions", []))

    # 1. Send form to browser via SSE
    session.push_sse("ask_message", {"id": ask_id, "preamble": preamble, "questions": questions})
    session.add_to_history("assistant", {...})
    await save_message(...)

    # 2. Mark pending ask
    session.start_ask(ask_id)
    await session.set_status("waiting_input")

    # 3. BLOCK until user submits (via POST /answers)
    try:
        await asyncio.wait_for(
            session.pending_ask_event.wait(),
            timeout=600,  # 10 minutes
        )
    except asyncio.TimeoutError:
        session.clear_ask()
        return _tool_response("User did not respond in time.", is_error=True)

    # 4. User submitted form, event.set() was called
    await session.set_status("active")
    answers = session.pending_answers
    session.clear_ask()

    # 5. Record answers + return to agent
    session.push_sse("user_message", {"answers": answers})
    session.add_to_history("user", {"answers": answers})
    await save_message(...)

    answer_text = "User answers:\n" + "\n".join([...])
    return _tool_response(answer_text)
```

### save_app() & update_app() — Admin-only

Available only in App Builder app:

```python
@tool("save_app", "Create new app...", SAVE_APP_SCHEMA)
async def save_app_tool(args: dict[str, Any]) -> dict[str, Any]:
    slug = args.get("slug")
    title = args.get("title")
    body = args.get("body")

    # Validate
    await validate_app_fields(slug, title, body)

    # Create app as inactive draft (admin must activate)
    app_id, version_id = await create_app(slug, title, "", body, "Initial", is_active=False)

    return _tool_response(f"App created (ID: {app_id}, inactive draft)")
```

Available in edit mode (App Builder editing a target app):

```python
@tool("update_app", "Edit existing app...", UPDATE_APP_SCHEMA)
async def update_app_tool(args: dict[str, Any]) -> dict[str, Any]:
    app_id = session.edit_app_id
    body = args.get("body")
    change_note = args.get("change_note", "Updated by Claude")

    # Validate
    await validate_app_fields(..., body)

    # Update + new version
    await update_app(app_id, body=body, change_note=change_note)

    return _tool_response(f"App {app_id} updated with new version")
```

## Session State (in-memory)

### session.py:SessionState

```python
@dataclass
class SessionState:
    session_id: str  # UUID
    user_id: str  # From X-User-Id header
    app_id: int | None  # Which app is running
    prompt_version_id: int | None  # Locked version
    edit_app_id: int | None  # For App Builder edit mode
    status: str  # "idle" | "active" | "waiting_input" | "done" | "error"
    sse_queue: asyncio.Queue[dict]  # Events to send to browser

    # Blocking ask() support
    pending_ask_id: str | None
    pending_ask_event: asyncio.Event  # Unblocked by POST /answers
    pending_answers: dict[str, Any]  # Form data from user

    # Message history (lost on restart)
    history: list[dict[str, Any]]

    # Agent subprocess
    agent_task: asyncio.Task[None] | None

    # Admin streaming (multiple observers)
    _admin_queues: list[asyncio.Queue]

    # Deduplication
    _recent_hashes: dict[str, float]
```

## Database Layer

### db.py — Main Functions

| Function | Purpose |
|----------|---------|
| `init_db()` | Create schema + run migrations |
| `_migrate(db)` | Version-based migrations |
| `save_session(id, user_id, app_id, ...)` | Insert session row |
| `save_message(session_id, role, content)` | Insert message row |
| `get_session(id)` | Load session + history |
| `update_session_title(id, title)` | Update title (auto on first msg) |
| `create_app(slug, title, ...)` | New app + first version |
| `update_app(app_id, ...)` | Edit + auto-new version |
| `get_app_by_id(id)` | Get app row (checks is_active) |
| `get_active_apps()` | List active apps |
| `get_default_app()` | First active app (fallback) |
| `get_prompt_body_by_version(vid)` | Get prompt text for version |

### Schema

```sql
sessions (id, user_id, app_id, prompt_version_id, title, created_at)
messages (id, session_id, role, content, created_at)
apps (id, slug, title, subtitle, is_active, current_version_id, created_at)
prompt_versions (id, app_id, body, change_note, created_at)
```

## Error Handling

| Error | Status | Handler |
|-------|--------|---------|
| Session not found | 404 | _resolve_app() |
| Not your session | 403 | chat(), answers() |
| Agent already running | 409 | chat() (prevents double-submit) |
| Invalid app | 404 | _resolve_app() |
| Tool exception | is_error: true | Tool returns error response |
| Agent dead | error event | _sse_generator() timeout detection |

## Validators

| Module | Function | Purpose |
|--------|----------|---------|
| validator.py | check_rate_limit() | Throttle requests per user |
| validator.py | validate_prompt() | Check prompt syntax (optional) |
| db.py | validate_app_fields() | Slug format, title/body length |
| schemas.py | SHOW_SCHEMA, ASK_SCHEMA | JSON schema for tool args |

## Testing

- **test_db.py** — CRUD, migrations, constraints
- **test_server.py** — HTTP routes, SSE streaming
- **test_session.py** — SessionState, event dedup
- **test_tools.py** — Tool handlers, blocking ask
- **test_schemas.py** — Widget schema validation
