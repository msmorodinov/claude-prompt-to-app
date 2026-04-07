# Contributing Guide

<!-- AUTO-GENERATED: 2026-04-05 from Makefile, package.json, requirements.txt, CLAUDE.md -->

## Quick Start

```bash
# 1. Install dependencies
make install

# 2. Start development servers (real Claude mode)
make dev

# 3. Open http://localhost:4920 in your browser
```

## Development Setup

### Requirements

- Python 3.11+
- Node.js 18+ (for npm)
- Claude Max subscription (for real mode) OR mock mode for testing

### Initial Setup

```bash
# Create virtual environment + install backend deps + frontend deps
make install

# Verify installation
.venv/bin/python --version  # Should be 3.11+
cd frontend && npm -v       # Should be 8+
```

### Environment Variables

**No environment variables required for mock mode.**

For real Claude mode:
- Claude Code CLI must be installed and authenticated via Claude.ai Max subscription
- **Do NOT set `ANTHROPIC_API_KEY`** — it overrides Max subscription OAuth

Optional configuration:
```bash
BACKEND_PORT=8000      # Default: 4910
FRONTEND_PORT=5173     # Default: 4920 (Vite default)
```

## Running the Application

### Development Mode (Real Claude)

Requires Claude Max subscription.

```bash
make dev
# Backend starts on http://localhost:4910
# Frontend starts on http://localhost:4920 (with dev server + proxy)
```

The frontend dev server proxies API requests to the backend. Hot module reloading enabled.

### Mock Mode (No Subscription Needed)

```bash
make mock
# Backend (mock server) starts on http://localhost:4910
# Frontend starts on http://localhost:4920
```

Use this for testing without Claude API access.

## Frontend Scripts

```bash
cd frontend

npm run dev              # Start dev server (port 4920)
npm run build           # Production build → dist/
npm run lint            # Run ESLint
npm run preview         # Preview production build locally
```

## Backend Scripts

```bash
cd backend

# Development server (requires virtual environment activated)
source ../.venv/bin/activate
python -m backend.server      # Starts on :4910

# Or directly:
../.venv/bin/python -m backend.server
```

## Testing

### Run All Tests

```bash
make test
# Runs frontend + backend tests
```

### Frontend Tests Only

```bash
make test-frontend
# Runs Vitest for React components
# Coverage: 80%+ required
```

### Backend Tests Only

```bash
make test-backend
# Runs pytest for Python modules
# Test files: backend/tests/test_*.py
```

### E2E Tests

```bash
# 1. Start mock server in one terminal
make mock

# 2. In another terminal, run E2E tests
make test-e2e
# Uses Playwright for browser automation
# Tests in: e2e/tests/*.spec.ts
```

## Code Organization

### Backend (Python)

| File | Purpose |
|------|---------|
| `server.py` | FastAPI app, SSE streaming, session endpoints |
| `admin_apps.py` | Admin API router: CRUD apps, version management |
| `agent.py` | Claude SDK client, agent lifecycle |
| `tools.py` | MCP tools: `show`, `ask`, `save_app` |
| `schemas.py` | Widget type definitions (JSON schemas) |
| `session.py` | In-memory session state management |
| `db.py` | SQLite: CRUD sessions, apps, versions |
| `validator.py` | Rate limiting, prompt validation |
| `tests/` | pytest test suite |

### Frontend (TypeScript/React)

| Directory | Purpose |
|-----------|---------|
| `src/pages/` | Top-level routes: ChatPage, AdminPage |
| `src/components/` | React components |
| `src/components/display/` | Display widgets (11 types for `show`) |
| `src/components/input/` | Input widgets (7 types for `ask`) |
| `src/components/admin/` | Admin dashboard components |
| `src/hooks/` | Custom React hooks: useSSE, useChat |
| `src/api.ts` | fetch helpers for backend API |
| `src/types.ts` | TypeScript types for SSE events, widgets |
| `src/__tests__/` | Vitest test suite |
| `src/styles/` | CSS: global.css, admin.css |

## Adding a New Feature

### 1. Plan & Document

- Sketch architecture in an issue or plan doc
- Identify which layers change: backend, frontend, both
- Update this guide if adding new concepts

### 2. Write Tests First (TDD)

- Backend: add pytest tests in `backend/tests/test_*.py`
- Frontend: add Vitest tests in `src/__tests__/`
- E2E: add Playwright test in `e2e/tests/` if user-facing

### 3. Implement

- Backend: add routes to `server.py` or handlers to existing modules
- Frontend: add components or update existing ones
- Keep files focused: ~200-400 lines, max 800

### 4. Type Check

```bash
# Frontend (TypeScript)
cd frontend && npx tsc -b

# Backend (no type checking required — run tests instead)
cd backend && ../.venv/bin/python -m pytest
```

### 5. Test Coverage

- Aim for 80%+ coverage (both frontend + backend)
- Run: `make test` and verify coverage report

### 6. Create Commit

Follow conventional commits:
```
feat: add new feature
fix: fix a bug
refactor: reorganize code
docs: documentation update
test: add tests
```

Example:
```bash
git add .
git commit -m "feat: add matrix 2x2 widget"
```

## Widget Development

### Adding a Display Widget (show)

1. **Define the schema** in `backend/schemas.py`:
   ```python
   {
       "type": "my_widget",
       "title": "My Display Widget",
       "properties": {
           "label": {"type": "string"},
           # ... more fields
       },
       "required": ["label"]
   }
   ```

2. **Create the React component** in `frontend/src/components/display/`:
   ```typescript
   export function MyWidget({ label, ... }: MyWidgetProps) {
       return <div>{label}</div>;
   }
   ```

3. **Register in WidgetRenderer.tsx**:
   ```typescript
   case "my_widget":
       return <MyWidget {...block} />;
   ```

4. **Update the prompt** (`backend/prompt.md`) to document when Claude should use it.

5. **Add tests** for the component.

### Adding an Input Widget (ask)

1. **Define the schema** in `backend/schemas.py` (in `INPUT_WIDGETS`).
2. **Create the React component** in `frontend/src/components/input/`.
3. **Register in WidgetRenderer.tsx**.
4. **Update the prompt** to explain the widget.
5. **Ensure it returns answers** in the expected format (validated by backend).

## API Development

### Adding an Endpoint

1. **Add route to `server.py`**:
   ```python
   @app.post("/my-endpoint")
   async def my_endpoint(request: Request) -> dict:
       # Validate, process, respond
       return {"status": "ok"}
   ```

2. **Add frontend helper** in `src/api.ts`:
   ```typescript
   export async function myEndpoint(payload: any) {
       return fetch('/my-endpoint', {
           method: 'POST',
           headers: { 'Content-Type': 'application/json' },
           body: JSON.stringify(payload),
       });
   }
   ```

3. **Add tests**:
   - Backend: pytest integration test
   - Frontend: Vitest hook test or E2E test

## Code Style

### Python

- Format with default Python conventions (no explicit formatter configured)
- Type hints encouraged (Pydantic schemas provide validation)
- Error handling: always try/except in tool handlers (uncaught exceptions kill agent loop)

### TypeScript/React

- Format: ESLint configured in `frontend/.eslintrc.js`
- Lint: `npm run lint`
- Immutability: avoid mutating state directly
- Component files: one per file, keep <400 lines

### Git Workflow

1. Create feature branch: `git checkout -b feature/my-feature`
2. Commit as you work (conventional commits)
3. Push and create PR
4. Reviewer checks tests + code quality
5. Merge to `main` when approved

## Debugging

### Backend Debugging

```bash
# Enable detailed logging
LOGLEVEL=DEBUG .venv/bin/python -m backend.server

# Check database (SQLite)
sqlite3 backend/db.sqlite3
```

### Frontend Debugging

- Open DevTools (F12) → Console for errors
- React DevTools extension recommended
- Network tab to inspect SSE stream and API calls

### Agent Issues

If Claude agent isn't responding:
1. Check backend logs for errors
2. Verify Claude Code CLI is authenticated
3. Check rate limiting (see `validator.py`)

## Deployment

See [RUNBOOK.md](./RUNBOOK.md) for production deployment procedures.

## Documentation

This project includes:
- **CLAUDE.md** — Architecture and design patterns (this file's source)
- **README.md** — User-facing quick start
- **CLAUDE.md** — Architecture and framework design (comprehensive)
- **docs/RUNBOOK.md** — Operations and deployment
- **Inline JSDoc** in source files (Python docstrings, TSDoc comments)

When adding features, update relevant documentation. Keep docs DRY — prefer linking to code over duplicating information.

## Common Issues

### Virtual Environment Issues

```bash
# If `.venv` breaks, recreate it:
rm -rf .venv
make install
```

### Node Modules Issues

```bash
# If frontend deps break:
cd frontend && rm -rf node_modules package-lock.json
npm install
```

### Port Already in Use

```bash
# Find process using port 4910 or 4920
lsof -i :4910
lsof -i :4920

# Kill and restart
kill -9 <PID>
make dev  # or make mock
```

### Tests Failing

1. Check that all dependencies are installed: `make install`
2. Verify Python version: `python3 --version` (need 3.11+)
3. Verify Node version: `node --version` (need 18+)
4. Run individual test file for details: `pytest backend/tests/test_db.py -v`

## Getting Help

- Check existing issues: github.com/msmorodinov/claude-prompt-to-app/issues
- Review CLAUDE.md for architecture questions
- Read CLAUDE.md for system design details
