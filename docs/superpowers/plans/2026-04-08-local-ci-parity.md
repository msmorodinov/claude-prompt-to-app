# Local CI Parity — Pre-Commit Checks

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ensure Claude catches the same errors locally that CI catches, by adding project-level Claude Code hooks that run type-check and tests before every commit.

**Architecture:** Add a project-scoped `.claude/settings.json` with a `PreToolUse` hook on `Bash` that detects `git commit` commands and runs the CI check suite first. Also add a convenience `check-ci` script that runs all checks in sequence — usable both by hooks and manually.

**Tech Stack:** Claude Code hooks (settings.json), Bash scripts

---

## Current State

CI (`.github/workflows/ci.yml`) runs these checks on every push:

| Step | Command | What it catches |
|------|---------|-----------------|
| TypeScript check | `cd frontend && npx tsc -b --noEmit` | Type errors in .ts/.tsx |
| Frontend tests | `cd frontend && npx vitest run` | Broken component/hook logic |
| Backend tests | `python -m pytest backend/tests/test_session.py --noconftest -v` | Broken session logic |
| E2E tests | `npx playwright test --config=e2e/playwright.config.ts` | Integration regressions |

**What Claude has now:** A global PostToolUse hook that runs `tsc` after editing `.ts` files. This is insufficient — it doesn't catch test failures, and only triggers on file edits (not before commits).

**What's missing:** No pre-commit gate. Claude can `git commit` without running any checks.

## Plan

### Task 1: Create the `check-ci.sh` script

**Files:**
- Create: `scripts/check-ci.sh`

- [ ] **Step 1: Create scripts directory and check script**

```bash
#!/usr/bin/env bash
set -euo pipefail

cd "$(git rev-parse --show-toplevel)"

echo "=== TypeScript check ==="
cd frontend && npx tsc -b --noEmit
cd ..

echo "=== Frontend tests ==="
cd frontend && npx vitest run --reporter=verbose
cd ..

echo "=== Backend tests ==="
python -m pytest backend/tests/test_session.py --noconftest -v

echo ""
echo "All checks passed."
```

Note: E2E tests are excluded — they require server startup and are slow. The three fast checks above cover 90% of CI failures.

- [ ] **Step 2: Make it executable**

Run: `chmod +x scripts/check-ci.sh`

- [ ] **Step 3: Verify it runs**

Run: `./scripts/check-ci.sh`
Expected: All three check suites pass (or known failures surface immediately).

- [ ] **Step 4: Commit**

```bash
git add scripts/check-ci.sh
git commit -m "chore: add check-ci.sh script for local CI parity"
```

---

### Task 2: Add project-level Claude Code hook

**Files:**
- Create: `.claude/settings.json`

The hook intercepts `git commit` commands via `PreToolUse` on `Bash`. If the command contains `git commit` (but not `--amend` for fixup workflows), it runs the check suite first.

- [ ] **Step 1: Create `.claude/settings.json`**

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Bash",
        "hooks": [
          {
            "type": "command",
            "command": "if echo \"$CC_TOOL_INPUT\" | grep -qP 'git\\s+commit' && ! echo \"$CC_TOOL_INPUT\" | grep -q '\\-\\-amend'; then cd $(git rev-parse --show-toplevel) && bash scripts/check-ci.sh; fi"
          }
        ]
      }
    ]
  }
}
```

**How it works:**
- `PreToolUse` with `Bash` matcher fires before every Bash command
- Checks if the command contains `git commit` (but not `--amend`)
- If yes, runs `check-ci.sh` — if it fails (non-zero exit), the hook blocks the commit
- If no, does nothing (passes through)

- [ ] **Step 2: Verify hook doesn't interfere with normal commands**

Run any non-commit Bash command, e.g.:
```bash
ls -la
```
Expected: Runs immediately, no checks triggered.

- [ ] **Step 3: Test hook blocks a bad commit**

Introduce a deliberate type error in a `.ts` file, stage it, then try to commit. The hook should run `check-ci.sh` which will fail on `tsc`.

- [ ] **Step 4: Commit**

```bash
git add .claude/settings.json
git commit -m "chore: add pre-commit Claude Code hook for CI parity"
```

---

### Task 3: Merge existing settings.local.json permissions

**Files:**
- Modify: `.claude/settings.local.json`

The existing `settings.local.json` has permissions. The new `settings.json` has hooks. These are separate files and don't conflict — `settings.json` is shared (committed), `settings.local.json` is local-only. No merge needed.

- [ ] **Step 1: Verify both files coexist**

Run: `cat .claude/settings.json && echo "---" && cat .claude/settings.local.json`
Expected: Both files exist with their respective content. Hooks in `settings.json`, permissions in `settings.local.json`.

- [ ] **Step 2: Test a commit to verify both apply**

Make a trivial safe change (e.g., add a comment to `scripts/check-ci.sh`), stage and commit. Verify:
1. Hook fires and runs checks
2. Permissions still work

---

### Task 4: Update CLAUDE.md with local CI workflow

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Add Development section about local CI**

Add to the `## Development` section in CLAUDE.md:

```markdown
## Local CI

A pre-commit hook runs automatically via Claude Code hooks (`.claude/settings.json`). Before every `git commit`, it executes:

1. `tsc -b --noEmit` — TypeScript type check
2. `vitest run` — Frontend unit tests
3. `pytest backend/tests/test_session.py` — Backend unit tests

To run manually: `./scripts/check-ci.sh`

E2E tests (Playwright) are NOT included in local checks — run them explicitly when touching UI flows.
```

- [ ] **Step 2: Update Project Structure tree**

Add `scripts/` directory to the tree:

```
forge-simple/
├── ...
├── scripts/
│   └── check-ci.sh        # Local CI parity checks (tsc + vitest + pytest)
├── ...
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: document local CI parity checks"
```
