#!/usr/bin/env bash
# Test suite for pre-commit hooks ("test of tests")
set -euo pipefail

ROOT="$(git rev-parse --show-toplevel)"
HOOK="$ROOT/scripts/pre-commit-hook.sh"
PASS=0
FAIL=0

pass() { echo "  PASS: $1"; PASS=$((PASS + 1)); }
fail() { echo "  FAIL: $1"; FAIL=$((FAIL + 1)); }

echo "=== Testing pre-commit-hook.sh ==="
echo ""

# Test 1: Non-commit command passes through (exit 0)
echo '{"tool_name":"Bash","tool_input":{"command":"ls -la"}}' | bash "$HOOK" > /dev/null 2>&1
[ $? -eq 0 ] && pass "non-commit command passes through" || fail "non-commit command should exit 0"

# Test 2: git status passes through (exit 0)
echo '{"tool_name":"Bash","tool_input":{"command":"git status"}}' | bash "$HOOK" > /dev/null 2>&1
[ $? -eq 0 ] && pass "git status passes through" || fail "git status should exit 0"

# Test 3: git log passes through (exit 0)
echo '{"tool_name":"Bash","tool_input":{"command":"git log --oneline -5"}}' | bash "$HOOK" > /dev/null 2>&1
[ $? -eq 0 ] && pass "git log passes through" || fail "git log should exit 0"

# Test 4: git commit triggers checks (should run check-ci.sh and pass)
echo '{"tool_name":"Bash","tool_input":{"command":"git commit -m \"test\""}}' | bash "$HOOK" > /dev/null 2>&1
[ $? -eq 0 ] && pass "git commit triggers checks and passes" || fail "git commit should trigger checks"

# Test 5: git commit --amend also triggers checks
echo '{"tool_name":"Bash","tool_input":{"command":"git commit --amend"}}' | bash "$HOOK" > /dev/null 2>&1
[ $? -eq 0 ] && pass "git commit --amend triggers checks" || fail "git commit --amend should trigger checks"

# Test 6: Empty input passes through
echo '{}' | bash "$HOOK" > /dev/null 2>&1
[ $? -eq 0 ] && pass "empty JSON passes through" || fail "empty JSON should exit 0"

# Test 7: Malformed input passes through (jq fails gracefully)
echo 'not json' | bash "$HOOK" > /dev/null 2>&1
[ $? -eq 0 ] && pass "malformed input passes through" || fail "malformed input should exit 0"

echo ""

# Test 8: check-ci.sh exists and is executable
[ -x "$ROOT/scripts/check-ci.sh" ] && pass "check-ci.sh is executable" || fail "check-ci.sh not executable"

# Test 9: install-hooks.sh exists and is executable
[ -x "$ROOT/scripts/install-hooks.sh" ] && pass "install-hooks.sh is executable" || fail "install-hooks.sh not executable"

# Test 10: git pre-commit hook is installed
[ -x "$ROOT/.git/hooks/pre-commit" ] && pass "git pre-commit hook installed" || fail "git pre-commit hook missing"

# Test 11: git pre-commit hook calls check-ci.sh
grep -q "check-ci.sh" "$ROOT/.git/hooks/pre-commit" 2>/dev/null && pass "pre-commit hook calls check-ci.sh" || fail "pre-commit hook doesn't reference check-ci.sh"

# Test 12: .claude/settings.json exists with PreToolUse hook
[ -f "$ROOT/.claude/settings.json" ] && pass ".claude/settings.json exists" || fail ".claude/settings.json missing"

# Test 13: settings.json references pre-commit-hook.sh
grep -q "pre-commit-hook.sh" "$ROOT/.claude/settings.json" 2>/dev/null && pass "settings.json references hook script" || fail "settings.json doesn't reference hook script"

# Test 14: check-ci.sh runs all 3 CI checks
grep -q "tsc" "$ROOT/scripts/check-ci.sh" && \
grep -q "vitest" "$ROOT/scripts/check-ci.sh" && \
grep -q "pytest" "$ROOT/scripts/check-ci.sh" && \
  pass "check-ci.sh runs tsc + vitest + pytest" || fail "check-ci.sh missing CI checks"

# Test 15: Global settings not modified
if ! grep -q "pre-commit-hook" ~/.claude/settings.json 2>/dev/null; then
  pass "global settings.json untouched"
else
  fail "global settings.json was modified!"
fi

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
[ $FAIL -eq 0 ] && exit 0 || exit 1
