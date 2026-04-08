#!/usr/bin/env bash
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
cd "$ROOT"

echo "=== TypeScript check ==="
(cd frontend && npx tsc -b --noEmit)

echo "=== Frontend tests ==="
(cd frontend && npx vitest run --reporter=verbose)

echo "=== Backend tests ==="
python3 -m pytest backend/tests/test_session.py --noconftest -v

echo ""
echo "All checks passed."
