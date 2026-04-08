#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

MOCK_PORT=4910
FRONTEND_PORT=4921
MOCK_PID=""
FRONTEND_PID=""

cleanup() {
  echo ""
  echo "Cleaning up..."
  [ -n "$MOCK_PID" ] && kill "$MOCK_PID" 2>/dev/null && echo "  Stopped mock server (PID $MOCK_PID)"
  [ -n "$FRONTEND_PID" ] && kill "$FRONTEND_PID" 2>/dev/null && echo "  Stopped frontend (PID $FRONTEND_PID)"
}
trap cleanup EXIT

# Check Playwright is installed
if ! npx playwright --version &>/dev/null; then
  echo "Installing Playwright browsers..."
  npx playwright install --with-deps chromium
fi

echo "=== Starting mock server on :${MOCK_PORT} ==="
python3 -m e2e.fixtures.mock_server --port "$MOCK_PORT" > /tmp/mock-server.log 2>&1 &
MOCK_PID=$!

echo "=== Starting frontend on :${FRONTEND_PORT} ==="
(cd frontend && npx vite --port "$FRONTEND_PORT" --strictPort) > /tmp/frontend.log 2>&1 &
FRONTEND_PID=$!

echo "=== Waiting for servers ==="
npx wait-on "http-get://localhost:${MOCK_PORT}/health" "http://localhost:${FRONTEND_PORT}" --timeout 30000 || {
  echo ""
  echo "=== Mock server log ===" && cat /tmp/mock-server.log
  echo "=== Frontend log ===" && cat /tmp/frontend.log
  exit 1
}
echo "  Both servers ready."

echo ""
echo "=== Running E2E tests ==="
npx playwright test --config=e2e/playwright.config.ts "$@"
