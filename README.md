# Claude Prompt-to-App

[![CI](https://github.com/msmorodinov/claude-prompt-to-app/actions/workflows/ci.yml/badge.svg)](https://github.com/msmorodinov/claude-prompt-to-app/actions/workflows/ci.yml)

> Two MCP tools. One prompt. A full interactive web app — powered by Claude.

Write a system prompt, get a working web application. Claude calls `show()` to display rich widgets and `ask()` to collect user input. The browser is a dumb renderer — **the prompt IS the product**.

<!-- GitHub About: Turn a prompt into a full interactive web app. Claude agent + two MCP tools → rich UI. -->
<!-- Topics: claude, claude-code, mcp, mcp-tools, prompt-to-app, ai-agent, interactive, web-app, react, fastapi, python, typescript, claude-agent -->

<p align="center">
  <img src="docs/screenshots/02-ask-form.png" width="700" alt="Interactive web app generated from a prompt" />
</p>

## Quick Start

Requires Python 3.11+ and Node.js. One command handles everything (venv, deps, launch):

```bash
git clone https://github.com/msmorodinov/claude-prompt-to-app.git
cd claude-prompt-to-app
python3 run.py           # Requires Claude Max subscription (OAuth, no API key)
```

Open http://localhost:4920 — that's it.

### Try without Claude

```bash
python3 run.py --mock    # Mock backend, no subscription needed
```

## Build Your Own App

The framework supports **multiple apps** — each with its own prompt, versioning, and sessions. Create and manage apps through the admin UI at `/admin`.

### Quick way: Admin UI

1. Open `http://localhost:4920/admin`
2. Click "New App" — give it a slug, title, and prompt body
3. Activate it — users can now select it on the main page

### Quick way: App Builder

Select the built-in **App Builder** app on the main page and describe what you want. Claude will generate the prompt and save it as a draft app via the `save_app` tool. Activate the draft in Admin.

### Manual way: fork and edit

1. **Write a prompt** — reference widgets by name to tell Claude when to use them
2. **Optionally add widgets** — or reuse the existing 18 types
3. **Run it** — `python3 run.py --mock` to test, `python3 run.py` with real Claude

| Prompt idea | show widgets | ask widgets |
|-------------|-------------|-------------|
| User interview | quote_highlight, text | free_text, single_select |
| Code review | data_table, comparison | single_select, free_text |
| Business model canvas | category_list, copyable | tag_input, matrix_2x2 |
| Sprint retrospective | metric_bars, text | rank_priorities, free_text |

Same tools. Same widget set. Different prompt → different product.

### Writing a Prompt

In your prompt, reference widgets by name:

```markdown
Display research results via show with data_table.
Ask the user via ask with single_select for forced choices.
Use quote_highlight when the user says something important.
```

The framework guide ([`backend/framework.md`](backend/framework.md)) is automatically appended to every prompt. It contains widget selection rules and anti-patterns — edit it to match your needs.

Claude also sees the full JSON schema for each widget (defined in `backend/schemas.py`), so it knows every field and type. Your prompt just needs to say *when* and *why* — not the exact JSON format.

**Adding a new widget:**

1. Add the schema to `backend/schemas.py` (in `DISPLAY_WIDGETS` or `INPUT_WIDGETS`)
2. Add the React component to `frontend/src/components/display/` or `input/`
3. Register it in `frontend/src/components/WidgetRenderer.tsx`
4. Mention it in your prompt so Claude knows when to use it

## How It Works

The app runs on three MCP tools:

| Tool | Behavior | What it does |
|------|----------|-------------|
| `show(blocks)` | Fire-and-forget | Push display widgets to the browser |
| `ask(questions)` | Blocking | Send input widgets, wait for user response |
| `save_app(...)` | Fire-and-forget | Save a new app to DB (App Builder only) |

<p align="center">
  <img src="docs/diagrams/show-vs-ask.svg" width="700" alt="show() vs ask() — the two tools" />
</p>

The browser is a "dumb renderer" — it shows whatever the agent sends and forwards user input back. No frontend logic needed.

<p align="center">
  <img src="docs/diagrams/traditional-vs-agent.svg" width="600" alt="Traditional web app vs agent-driven app" />
</p>

### The key pattern — async wait

1. Claude calls `ask(questions)` MCP tool
2. Tool handler sends questions to browser via SSE, then `await asyncio.Event()`
3. User fills the form, clicks Submit
4. Browser POSTs to `/answers` → `event.set()` unblocks the handler
5. Handler returns answers to Claude → agent loop continues

<p align="center">
  <img src="docs/diagrams/ask-flow.svg" width="700" alt="Key pattern: async wait flow" />
</p>

### Architecture

<p align="center">
  <img src="docs/diagrams/architecture.svg" width="700" alt="System architecture: Terminal → Server → Browser" />
</p>

<p align="center">
  <img src="docs/diagrams/core-loop.svg" width="700" alt="Core agent loop: show, ask, receive answers" />
</p>

## Widget Catalog

### Display widgets (11 types) — inside `show`

| Type | Use case |
|------|----------|
| `text` | Markdown commentary and analysis |
| `section_header` | Phase separation headers |
| `data_table` | Tabular data with highlights |
| `comparison` | Side-by-side before/after |
| `category_list` | Categorized lists with styles |
| `quote_highlight` | Key insight callouts |
| `metric_bars` | Scored metrics with bars |
| `copyable` | Copy-to-clipboard blocks |
| `progress` | Workshop progress indicator |
| `final_result` | Accented final statement |
| `timer` | Countdown ("don't overthink") |

### Input widgets (7 types) — inside `ask`

| Type | Use case |
|------|----------|
| `single_select` | Forced-choice questions |
| `multi_select` | Multiple selections |
| `free_text` | Open text input |
| `rank_priorities` | Drag-and-drop ranking |
| `slider_scale` | Scale 1-10 ratings |
| `matrix_2x2` | Effort vs impact grid |
| `tag_input` | Word association tags |

## Tech Stack

| Layer | Tech |
|-------|------|
| Backend | Python 3.11+, FastAPI, uvicorn, [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk) |
| Frontend | React 19, Vite, TypeScript |
| Database | SQLite (aiosqlite) |
| Agent | Claude Code CLI via subprocess |

## Testing

```bash
make test            # Run all tests (frontend + backend)
make test-frontend   # Frontend only
make test-backend    # Backend only
make test-e2e        # E2E tests (requires mock server running)
```

## License

[MIT](LICENSE)
