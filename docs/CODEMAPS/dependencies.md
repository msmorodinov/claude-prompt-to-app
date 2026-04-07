# Dependencies Codemap

<!-- Generated: 2026-04-05 | Files scanned: 3 | Token estimate: ~650 -->

**Last Updated:** 2026-04-05

## Backend Dependencies

### requirements.txt

| Package | Version | Purpose |
|---------|---------|---------|
| **claude-agent-sdk** | >=0.1.0 | Claude API client, agent loop, MCP tools |
| **fastapi** | >=0.115.0 | Web framework, routing, async |
| **uvicorn** | >=0.34.0 | ASGI server (runs on :4910) |
| **aiosqlite** | >=0.20.0 | Async SQLite driver |
| **sse-starlette** | >=2.0.0 | Server-sent events, SSE streaming |
| **pydantic** | >=2.0.0 | Data validation, JSON schemas |

### Testing (optional)

| Package | Version | Purpose |
|---------|---------|---------|
| **pytest** | >=8.0.0 | Test runner |
| **pytest-asyncio** | >=0.24.0 | Async test support |
| **pytest-cov** | >=6.0.0 | Coverage reporting |
| **httpx** | >=0.28.0 | HTTP client (async) for testing |

## Frontend Dependencies

### package.json - Runtime

| Package | Version | Purpose |
|---------|---------|---------|
| **react** | ^19.2.4 | UI framework |
| **react-dom** | ^19.2.4 | React rendering |
| **react-router-dom** | ^7.13.2 | Client-side routing (/ and /admin) |
| **dompurify** | ^3.3.3 | Sanitize HTML (security) |
| **marked** | ^17.0.5 | Markdown → HTML rendering |
| **diff-match-patch** | ^1.0.5 | Diff algorithm (version compare UI) |

### package.json - DevDependencies

| Package | Version | Purpose |
|---------|---------|---------|
| **typescript** | ~5.9.3 | Type checking |
| **vite** | ^8.0.1 | Build tool, dev server |
| **@vitejs/plugin-react** | ^6.0.1 | React JSX support in Vite |
| **eslint** | ^9.39.4 | Linting |
| **@eslint/js** | ^9.39.4 | ESLint presets |
| **typescript-eslint** | ^8.57.0 | TypeScript linting |
| **eslint-plugin-react-hooks** | ^7.0.1 | React hooks rules |
| **eslint-plugin-react-refresh** | ^0.5.2 | Fast refresh support |
| **vitest** | ^4.1.2 | Unit test framework |
| **@testing-library/react** | ^16.3.2 | React testing utilities |
| **@testing-library/jest-dom** | ^6.9.1 | DOM matchers |
| **jsdom** | ^29.0.1 | DOM simulation (tests) |
| **@types/react** | ^19.2.14 | React types |
| **@types/react-dom** | ^19.2.3 | React DOM types |
| **@types/node** | ^24.12.0 | Node.js types |
| **@types/diff-match-patch** | ^1.0.36 | Diff-match-patch types |
| **globals** | ^17.4.0 | Global variable types (eslint) |

## External Services

### Claude API

- **Service**: Anthropic Claude API
- **Authentication**: Claude Max subscription (no API key stored locally)
- **Mode**: Agentic (Claude Code CLI subprocess)
- **Tools**:
  - MCP tools: `mcp__app__show`, `mcp__app__ask`, `mcp__app__save_app`, `mcp__app__update_app`
  - Built-in: `WebSearch`, `WebFetch`
- **Not used**: `AskUserQuestion` (disabled, requires TTY)

### Database

- **SQLite** (aiosqlite)
- **File**: backend/sessions.db (local)
- **No remote database** (localhost deployment)

## Startup & Installation

### Backend Setup

```bash
cd backend

# Install dependencies
pip install -r requirements.txt

# Run server
python server.py
# Listens on http://localhost:4910
```

### Frontend Setup

```bash
cd frontend

# Install dependencies
npm install

# Run dev server
npm run dev -- --port 4920
# Listens on http://localhost:4920 (proxies to backend)
```

## Build Process

### Frontend Build

```bash
cd frontend

# Type check
npx tsc -b

# Build for production
npm run build
# Output: frontend/dist/

# Lint check
npm run lint
```

### Backend Deployment

- No special build step needed (pure Python)
- Ensure Python 3.11+ installed
- Install requirements.txt in virtual environment

## Version Compatibility

| Component | Version | Rationale |
|-----------|---------|-----------|
| **Python** | 3.11+ | Required by FastAPI, async features |
| **Node.js** | 18+ | TypeScript, ESLint compatibility |
| **React** | 19 | Latest major version, better hooks |
| **SQLite** | 3.40+ | WAL mode support (auto-included) |

## Security Dependencies

- **dompurify** ^3.3.3 — Sanitize HTML from markdown to prevent XSS
- **pydantic** >=2.0.0 — Input validation, schema enforcement
- (Auth via Claude Max OAuth, not API keys)

## Size & Performance

- **Backend size**: ~50 MB with deps (FastAPI + Claude SDK)
- **Frontend size**: ~150 MB (node_modules; ~10 MB built dist/)
- **Database**: < 1 MB (typical; grows with message history)

## No Breaking Changes

All dependencies pinned to stable releases:
- **FastAPI** >=0.115 — No major version bump expected soon
- **React** ^19 — Follows semver (next major likely 20+ months out)
- **Vite** ^8 — Stable, regular point releases

## Optional Dependencies

**Not included** but used in testing:
- **playwright** (E2E tests, see e2e/ directory)
- **mock-agent**, **mock-server** (test fixtures)

## Dependency Graph

```
Browser (React 19)
├── react-router-dom → routing
├── dompurify → XSS prevention
├── marked → markdown rendering
└── diff-match-patch → version diffs

FastAPI Server
├── claude-agent-sdk → agent loop, MCP tools
├── aiosqlite → database
├── pydantic → validation
├── sse-starlette → SSE streaming
└── uvicorn → HTTP server

Claude Code CLI (subprocess)
├── claude-agent-sdk → internal
├── MCP tools (custom) → show, ask, save_app, update_app
└── Built-in tools → WebSearch, WebFetch
```

## Known Limitations

1. **No async task queue** — Agent runs synchronously in subprocess
2. **No caching** — Every agent restart reloads all prompts from disk
3. **No versioning** of dependencies in backend (only for frontend)
4. **SQLite only** — No migration path to PostgreSQL/MySQL
5. **No ORM** — Hand-written SQL queries (vulnerability-tested for SQL injection)

## Environment Variables

**Required (none** — Max subscription auth only)

**Optional:**
- `DATABASE_URL` — (future) PostgreSQL connection string
- `CLAUDE_MAX_TOKEN_LIMIT` — (future) Rate limit per session
- `LOG_LEVEL` — "INFO", "DEBUG", "WARNING"

## Testing & CI

- **Backend**: pytest with async support (pytest-asyncio)
- **Frontend**: Vitest with React Testing Library
- **E2E**: Playwright (see e2e/tests/)
- **No CI/CD** configured (local dev only)

## Upgrade Strategy

### Major Version Bumps

- **FastAPI** → next major: Review breaking changes, test all routes
- **React** → next major: Update components, test hooks, CSS
- **Vite** → next major: Test build process, plugins

### Point Releases

- Run `npm update` monthly
- Run `pip install --upgrade -r requirements.txt` monthly
- Check for security patches in dependabot alerts
