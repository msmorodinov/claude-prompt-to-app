import { test, expect, type Page } from '@playwright/test'

const BACKEND_URL = 'http://localhost:4910'

/**
 * Helper: create a session via real backend API.
 */
async function createSessionAs(userId: string): Promise<string> {
  const res = await fetch(`${BACKEND_URL}/sessions/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
  })
  expect(res.ok).toBe(true)
  const data = await res.json()
  return data.session_id
}

/**
 * Helper: set user_id in localStorage before navigation.
 */
async function setUserId(page: Page, userId: string) {
  await page.addInitScript((uid) => {
    localStorage.setItem('user_id', uid)
  }, userId)
}

// ------- Real backend: session lifecycle -------

test.describe('Real backend: session lifecycle', () => {
  test('create session returns valid session_id', async () => {
    const sessionId = await createSessionAs('real-test-user-1')
    expect(sessionId).toBeTruthy()
    expect(typeof sessionId).toBe('string')
    expect(sessionId.length).toBeGreaterThan(0)
  })

  test('list sessions returns created session', async () => {
    const userId = `list-test-${Date.now()}`
    const sessionId = await createSessionAs(userId)

    const res = await fetch(`${BACKEND_URL}/sessions`, {
      headers: { 'X-User-Id': userId },
    })
    expect(res.ok).toBe(true)
    const sessions = await res.json()
    expect(sessions.some((s: { id: string }) => s.id === sessionId)).toBe(true)
  })

  test('sessions are isolated per user', async () => {
    const userA = `user-a-${Date.now()}`
    const userB = `user-b-${Date.now()}`

    await createSessionAs(userA)
    await createSessionAs(userB)

    const resA = await fetch(`${BACKEND_URL}/sessions`, {
      headers: { 'X-User-Id': userA },
    })
    const sessionsA = await resA.json()

    const resB = await fetch(`${BACKEND_URL}/sessions`, {
      headers: { 'X-User-Id': userB },
    })
    const sessionsB = await resB.json()

    // Each user should only see their own sessions
    const idsA = sessionsA.map((s: { id: string }) => s.id)
    const idsB = sessionsB.map((s: { id: string }) => s.id)
    const overlap = idsA.filter((id: string) => idsB.includes(id))
    expect(overlap).toHaveLength(0)
  })

  test('health endpoint responds', async () => {
    const res = await fetch(`${BACKEND_URL}/health`)
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data.status).toBe('ok')
  })

  test('config endpoint responds', async () => {
    const res = await fetch(`${BACKEND_URL}/config`)
    expect(res.ok).toBe(true)
    const data = await res.json()
    expect(data).toHaveProperty('title')
  })
})

// ------- Real backend: ownership checks (403) -------

test.describe('Real backend: ownership checks', () => {
  test('cross-user chat attempt returns 403', async () => {
    const sessionId = await createSessionAs('owner-user')

    const res = await fetch(`${BACKEND_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'intruder-user',
      },
      body: JSON.stringify({ message: 'hack', session_id: sessionId }),
    })
    expect(res.status).toBe(403)
  })

  test('cross-user answer submit returns 403', async () => {
    const sessionId = await createSessionAs('owner-user-2')

    const res = await fetch(`${BACKEND_URL}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'intruder-user-2',
      },
      body: JSON.stringify({
        session_id: sessionId,
        ask_id: 'any-ask',
        answers: { key: 'val' },
      }),
    })
    expect(res.status).toBe(403)
  })

  test('non-existent session returns 404', async () => {
    const res = await fetch(`${BACKEND_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'any-user',
      },
      body: JSON.stringify({ message: 'test', session_id: 'nonexistent123' }),
    })
    expect(res.status).toBe(404)
  })
})

// ------- Real backend: admin endpoints -------

test.describe('Real backend: admin endpoints', () => {
  test('admin sessions list returns all sessions', async () => {
    // Create sessions as different users
    await createSessionAs('admin-a')
    await createSessionAs('admin-b')

    const res = await fetch(`${BACKEND_URL}/admin/sessions`)
    expect(res.ok).toBe(true)
    const sessions = await res.json()
    expect(Array.isArray(sessions)).toBe(true)
    expect(sessions.length).toBeGreaterThanOrEqual(2)

    // Each session should have expected fields
    const first = sessions[0]
    expect(first).toHaveProperty('id')
    expect(first).toHaveProperty('user_id')
    expect(first).toHaveProperty('status')
  })

  test('admin session history returns array', async () => {
    const sessionId = await createSessionAs('admin-hist')

    const res = await fetch(
      `${BACKEND_URL}/admin/sessions/${sessionId}/history`,
    )
    expect(res.ok).toBe(true)
    const history = await res.json()
    expect(Array.isArray(history)).toBe(true)
  })
})

// ------- Real backend: frontend integration -------

test.describe('Real backend: frontend integration', () => {
  test('homepage loads and creates session', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="chat-container"]')

    // user_id should be set
    const userId = await page.evaluate(() => localStorage.getItem('user_id'))
    expect(userId).toBeTruthy()
  })

  test('session create request goes through proxy', async ({ page }) => {
    const [response] = await Promise.all([
      page.waitForResponse((res) => res.url().includes('/sessions/create')),
      page.goto('/'),
    ])
    expect(response.status()).toBe(200)
    const body = await response.json()
    expect(body.session_id).toBeTruthy()
  })

  test('admin page loads via real backend', async ({ page }) => {
    // Create a session first
    await createSessionAs('admin-fe-test')

    await page.goto('/admin')
    await expect(page.locator('[data-testid="admin-header"] h1')).toHaveText('Admin Monitor')
    await expect(page.locator('[data-testid="session-list"]')).toBeVisible()

    // Should show session(s)
    await expect(page.locator('[data-testid="session-item"]').first()).toBeVisible({
      timeout: 10000,
    })
  })

  test('admin viewer opens for real session', async ({ page }) => {
    await createSessionAs('admin-viewer-test')

    await page.goto('/admin')
    const sessionItem = page.locator('[data-testid="session-item"]').first()
    await expect(sessionItem).toBeVisible({ timeout: 10000 })
    await sessionItem.click()

    await expect(page.locator('[data-testid="session-viewer"]')).toBeVisible()
    await expect(page.locator('[data-testid="session-viewer"] h3')).toContainText('Session:')
  })

  test('routing between / and /admin works', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible()

    await page.goto('/admin')
    await expect(page.locator('[data-testid="admin-page"]')).toBeVisible()

    await page.goto('/')
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible()
  })

  test('start button initiates real agent session', async ({ page }) => {
    await page.goto('/')
    await page.waitForSelector('[data-testid="chat-container"]')

    // Click start if visible
    const startBtn = page.locator('[data-testid="start-btn"]')
    if (await startBtn.isVisible()) {
      await startBtn.click()

      // Should show loading/thinking state
      await expect(
        page.locator('.thinking-indicator, .message-bubble, [data-testid="assistant-message"]'),
      ).toBeVisible({ timeout: 30000 })
    }
  })
})
