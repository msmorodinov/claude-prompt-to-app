# E2E Test Suite Cleanup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Reduce 74 E2E tests to ~10 high-value tests that reliably pass

**Architecture:** Delete redundant test files, fix mock server state isolation, keep only tests that cover real user flows

**Tech Stack:** Playwright, FastAPI mock server

**Status:** DONE
**Completed:** 2026-04-09

---

## Root Cause Analysis

Two bugs cause 33 test failures:

1. **Shared mock server state** — `_apps` list is global. Admin tests seed apps via `POST /admin/apps`. Other tests see these apps via `GET /apps`, which makes the frontend show `AppSelector` ("Choose your app") instead of the `start-btn`. Tests that click `start-btn` timeout.

2. **`fullyParallel: true` + shared state** — parallel tests create sessions/apps that leak across test boundaries.

## Files to DELETE

| File | Tests | Reason |
|------|-------|--------|
| `e2e/tests/responsive-widgets.spec.ts` | 9 | Duplicates ask-flow with viewport changes |
| `e2e/tests/sidebar-visual.spec.ts` | 8 | Duplicates session-sidebar with screenshots |
| `e2e/tests/workshop-flow.spec.ts` | 3 | Fully covered by ask-flow full flow test |
| `e2e/tests/real-backend.spec.ts` | 16 | Requires real backend, not mock — belongs in integration tests |
| `e2e/tests/session-sidebar.spec.ts` | 7 | Overlaps with sidebar-visual; keep sidebar tests in multi-user |
| `e2e/take-screenshots.spec.ts` | ? | Utility, not a real test |

## Files to KEEP (trimmed)

| File | Before | After | What stays |
|------|--------|-------|------------|
| `e2e/tests/admin-ui-live.spec.ts` | 9 | 4 | Load, create app, menu items, rename |
| `e2e/tests/multi-user-admin.spec.ts` | 14 | 4 | User isolation (2), admin dashboard (1), routing (1) |
| `e2e/tests/ask-flow.spec.ts` | 8 | 2 | Full flow + slider/tags flow |

**Total: 74 → 10 tests (86% reduction)**

---

### Task 1: Fix mock server state isolation

**Files:**
- Modify: `e2e/fixtures/mock_server.py`

- [ ] **Step 1: Add state reset endpoint**

Add `POST /test/reset` endpoint that clears all in-memory state:

```python
@app.post("/test/reset")
async def test_reset() -> dict:
    """Reset all mock server state between tests."""
    global _app_id_counter
    _apps.clear()
    _app_id_counter = 0
    _session_meta.clear()
    # Clear all sessions from the manager
    for sid in list(sessions._sessions.keys()):
        sessions.remove(sid)
    return {"status": "reset"}
```

- [ ] **Step 2: Verify endpoint works**

```bash
curl -X POST http://localhost:4910/test/reset
# Expected: {"status":"reset"}
```

---

### Task 2: Delete redundant test files

- [ ] **Step 1: Delete files**

```bash
rm e2e/tests/responsive-widgets.spec.ts
rm e2e/tests/sidebar-visual.spec.ts
rm e2e/tests/workshop-flow.spec.ts
rm e2e/tests/real-backend.spec.ts
rm e2e/tests/session-sidebar.spec.ts
rm e2e/take-screenshots.spec.ts
```

---

### Task 3: Rewrite ask-flow.spec.ts — 2 focused tests

**Files:**
- Rewrite: `e2e/tests/ask-flow.spec.ts`

- [ ] **Step 1: Rewrite with reset + 2 tests**

```typescript
import { test, expect } from '@playwright/test'

const MOCK_SERVER = 'http://localhost:4910'

test.describe('Ask Flow', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${MOCK_SERVER}/test/reset`)
  })

  test('full chat flow: start → two ask rounds → final result', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="start-btn"]').click()

    // First ask: free_text + single_select
    const ask1 = page.locator('[data-testid="ask-message"]').first()
    await expect(ask1).toBeVisible({ timeout: 10000 })

    await ask1.locator('textarea').first().fill('We build forecasting tools')
    await ask1.locator('input[type="radio"]').first().click()
    await ask1.locator('[data-testid="submit-btn"]').click()

    // Second ask: slider_scale + tag_input
    const ask2 = page.locator('[data-testid="ask-message"]').nth(1)
    await expect(ask2).toBeVisible({ timeout: 10000 })

    await expect(ask2.locator('[data-testid="widget-slider-scale"]')).toBeVisible()
    await expect(ask2.locator('[data-testid="slider-label-min"]')).toHaveText('Not at all')
    await expect(ask2.locator('[data-testid="slider-label-max"]')).toHaveText('Absolutely')
    await ask2.locator('input[type="range"]').fill('8')

    const tagInput = ask2.locator('[data-testid="widget-tag-input"] input[type="text"]')
    await tagInput.fill('fast')
    await tagInput.press('Enter')
    await tagInput.fill('reliable')
    await tagInput.press('Enter')
    await expect(ask2.locator('[data-testid="tag"]')).toHaveCount(2)

    await ask2.locator('[data-testid="submit-btn"]').click()

    // Final widgets
    await expect(page.locator('[data-testid="widget-final-result"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-testid="widget-copyable"]')).toBeVisible()
    await expect(page.locator('[data-testid="widget-metric-bars"]')).toBeVisible()
    await expect(page.locator('[data-testid="widget-data-table"]')).toBeVisible()
    await expect(page.locator('[data-testid="widget-comparison"]')).toBeVisible()
  })

  test('InputArea hidden during ask, done banner after completion', async ({ page }) => {
    await page.goto('/')
    await page.locator('[data-testid="start-btn"]').click()

    // Ask visible → InputArea hidden
    const ask1 = page.locator('[data-testid="ask-message"]').first()
    await expect(ask1).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-testid="input-area"]')).not.toBeVisible()

    // Complete flow
    await ask1.locator('textarea').first().fill('Test company')
    await ask1.locator('input[type="radio"]').first().click()
    await ask1.locator('[data-testid="submit-btn"]').click()

    const ask2 = page.locator('[data-testid="ask-message"]').nth(1)
    await expect(ask2).toBeVisible({ timeout: 10000 })
    await ask2.locator('input[type="range"]').fill('5')
    const tagInput = ask2.locator('[data-testid="widget-tag-input"] input[type="text"]')
    await tagInput.fill('x')
    await tagInput.press('Enter')
    await ask2.locator('[data-testid="submit-btn"]').click()

    // Done
    await expect(page.locator('[data-testid="widget-final-result"]')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('[data-testid="session-done-banner"]')).toBeVisible()
  })
})
```

---

### Task 4: Trim multi-user-admin.spec.ts — 4 focused tests

**Files:**
- Rewrite: `e2e/tests/multi-user-admin.spec.ts`

- [ ] **Step 1: Rewrite with reset + 4 tests**

```typescript
import { test, expect, type APIRequestContext } from '@playwright/test'

const MOCK_SERVER = 'http://localhost:4910'

async function createSessionAs(request: APIRequestContext, userId: string): Promise<string> {
  const res = await request.post(`${MOCK_SERVER}/sessions/create`, {
    headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
  })
  expect(res.ok()).toBeTruthy()
  const data = await res.json()
  return data.session_id
}

test.describe('Multi-user & Admin', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${MOCK_SERVER}/test/reset`)
  })

  test('user cannot access another user session', async ({ request }) => {
    const sessionId = await createSessionAs(request, 'user-A')

    const res = await request.post(`${MOCK_SERVER}/chat`, {
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'user-B' },
      data: { message: 'hack', session_id: sessionId },
    })
    expect(res.status()).toBe(403)

    const ansRes = await request.post(`${MOCK_SERVER}/answers`, {
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'user-B' },
      data: { session_id: sessionId, ask_id: 'mock-ask-1', answers: { x: 'y' } },
    })
    expect(ansRes.status()).toBe(403)
  })

  test('admin dashboard shows seeded sessions', async ({ page, request }) => {
    await createSessionAs(request, 'test-user')
    await request.post(`${MOCK_SERVER}/chat`, {
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'test-user' },
      data: { message: 'Hello', session_id: '' },
    })

    await page.goto('/admin')
    await expect(page.locator('[data-testid="admin-header"] h1')).toHaveText('Admin Monitor')
    await expect(page.locator('[data-testid="session-list"]')).toBeVisible()
  })

  test('routing: / shows chat, /admin shows admin', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible()

    await page.goto('/admin')
    await expect(page.locator('[data-testid="admin-page"]')).toBeVisible()

    await page.goto('/')
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible()
  })

  test('user_id persists across reloads', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="chat-container"]')
    const uid1 = await page.evaluate(() => localStorage.getItem('user_id'))
    expect(uid1).toBeTruthy()

    await page.reload()
    await page.waitForSelector('[data-testid="chat-container"]')
    const uid2 = await page.evaluate(() => localStorage.getItem('user_id'))
    expect(uid2).toBe(uid1)
  })
})
```

---

### Task 5: Trim admin-ui-live.spec.ts — 4 focused tests

**Files:**
- Modify: `e2e/tests/admin-ui-live.spec.ts`

- [ ] **Step 1: Add reset to beforeEach, remove tests 5-8**

Keep tests: 1 (page loads), 3a (create form UI), 3b (create end-to-end), 4 (menu items).
Delete: 2 (redundant with 3a), 5 (environment panel), 6 (history panel), 7 (rename), 8 (menu close outside).

Add `test.beforeEach` with reset:

```typescript
test.beforeEach(async ({ request }) => {
  await request.post(`${API_BASE}/test/reset`)
})
```

Remove the `test.describe('Admin app editor')` block entirely (tests 4-8). Keep test 4 (menu items) but move it to use its own seedApp in the test body.

---

### Task 6: Set fullyParallel back to false for serial execution

**Files:**
- Modify: `e2e/playwright.config.ts`

- [ ] **Step 1: Change config**

```typescript
fullyParallel: false,  // Tests share mock server state, must run serially
```

With only 10 tests, serial execution is fast enough (~20s).

---

### Task 7: Update check-e2e.sh and CLAUDE.md

- [ ] **Step 1: Update CLAUDE.md project structure** (remove deleted files)
- [ ] **Step 2: Commit all changes**

```bash
git add -A e2e/ docs/superpowers/plans/2026-04-08-e2e-test-cleanup.md
git commit -m "refactor: reduce E2E suite from 74 to 10 tests with state isolation"
```

- [ ] **Step 3: Run tests and verify all pass**

```bash
bash scripts/check-e2e.sh --reporter=list
```
