import { test, expect, type Page } from '@playwright/test'

const MOCK_SERVER_URL = 'http://localhost:4911'

/**
 * Helper: create a session via API with a specific user_id.
 * Returns session_id.
 */
async function createSessionAs(userId: string): Promise<string> {
  const res = await fetch(`${MOCK_SERVER_URL}/sessions/create`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
  })
  const data = await res.json()
  return data.session_id
}

/**
 * Helper: start chat on a session via API.
 */
async function startChatAs(
  userId: string,
  sessionId: string,
  message = 'start',
): Promise<void> {
  await fetch(`${MOCK_SERVER_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-User-Id': userId },
    body: JSON.stringify({ message, session_id: sessionId }),
  })
}

/**
 * Helper: set user_id in localStorage before navigation.
 */
async function setUserId(page: Page, userId: string) {
  await page.addInitScript((uid) => {
    localStorage.setItem('user_id', uid)
  }, userId)
}

// ------- Multi-user session isolation tests -------

test.describe('Multi-user session isolation', () => {
  test('user_id is persisted in localStorage', async ({ page }) => {
    await page.goto('/')
    // Wait for app to render and create session (which triggers getUserId)
    await page.waitForSelector('[data-testid="chat-container"]')
    const userId = await page.evaluate(() => localStorage.getItem('user_id'))
    expect(userId).toBeTruthy()
    expect(userId!.length).toBe(12)

    // Reload — should be the same
    await page.reload()
    await page.waitForSelector('[data-testid="chat-container"]')
    const userId2 = await page.evaluate(() => localStorage.getItem('user_id'))
    expect(userId2).toBe(userId)
  })

  test('different tabs get different user_ids by default', async ({
    browser,
  }) => {
    const ctx1 = await browser.newContext()
    const ctx2 = await browser.newContext()
    const page1 = await ctx1.newPage()
    const page2 = await ctx2.newPage()

    await page1.goto('/')
    await page2.goto('/')

    // Wait for the app to render and generate user_id
    await page1.waitForSelector('[data-testid="chat-container"], [data-testid="start-screen"], [data-testid="start-btn"]')
    await page2.waitForSelector('[data-testid="chat-container"], [data-testid="start-screen"], [data-testid="start-btn"]')

    const uid1 = await page1.evaluate(() => localStorage.getItem('user_id'))
    const uid2 = await page2.evaluate(() => localStorage.getItem('user_id'))

    expect(uid1).toBeTruthy()
    expect(uid2).toBeTruthy()
    expect(uid1).not.toBe(uid2)

    await ctx1.close()
    await ctx2.close()
  })

  test('session create sends X-User-Id header', async ({ page }) => {
    await setUserId(page, 'test-user-abc')

    // Intercept the session create request
    const [request] = await Promise.all([
      page.waitForRequest((req) => req.url().includes('/sessions/create')),
      page.goto('/'),
    ])

    expect(request.headers()['x-user-id']).toBe('test-user-abc')
  })

  test('user cannot access another user session via API', async () => {
    // Create session as user-A
    const sessionId = await createSessionAs('user-A')

    // Try to chat as user-B on user-A's session
    const res = await fetch(`${MOCK_SERVER_URL}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'user-B',
      },
      body: JSON.stringify({ message: 'hack', session_id: sessionId }),
    })
    expect(res.status).toBe(403)
  })

  test('user cannot submit answers to another user session', async () => {
    const sessionId = await createSessionAs('user-A')
    await startChatAs('user-A', sessionId)

    // Try to submit answers as user-B
    const res = await fetch(`${MOCK_SERVER_URL}/answers`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-User-Id': 'user-B',
      },
      body: JSON.stringify({
        session_id: sessionId,
        ask_id: 'mock-ask-1',
        answers: { company_desc: 'hacked' },
      }),
    })
    expect(res.status).toBe(403)
  })
})

// ------- Admin dashboard tests -------

test.describe('Admin dashboard', () => {
  test('admin page renders with session list', async ({ page }) => {
    // Create a session first so the list is not empty
    await createSessionAs('admin-test-user')

    await page.goto('/admin')

    // Should have admin header
    await expect(page.locator('[data-testid="admin-header"] h1')).toHaveText('Admin Monitor')

    // Should have session list
    await expect(page.locator('[data-testid="session-list"]')).toBeVisible()

    // Should show at least 1 session
    await expect(page.locator('[data-testid="session-item"]').first()).toBeVisible({
      timeout: 10000,
    })
  })

  test('admin shows session status badges', async ({ page }) => {
    await createSessionAs('status-test-user')

    await page.goto('/admin')

    const firstItem = page.locator('[data-testid="session-item"]').first()
    await expect(firstItem).toBeVisible({ timeout: 10000 })

    // Should have a status badge
    await expect(firstItem.locator('[data-testid="status-badge"]')).toBeVisible()
  })

  test('clicking a session opens viewer', async ({ page }) => {
    const sessionId = await createSessionAs('viewer-test-user')

    await page.goto('/admin')

    // Wait for session list to load
    const sessionItem = page.locator('[data-testid="session-item"]').first()
    await expect(sessionItem).toBeVisible({ timeout: 10000 })

    // Click the session
    await sessionItem.click()

    // Session viewer should appear
    await expect(page.locator('[data-testid="session-viewer"]')).toBeVisible()
    await expect(page.locator('[data-testid="session-viewer"] h3')).toContainText('Session:')
  })

  test('admin empty state shows placeholder', async ({ page }) => {
    await page.goto('/admin')

    // Before clicking any session, show empty state
    await expect(page.locator('[data-testid="admin-empty"]')).toBeVisible()
    await expect(page.locator('[data-testid="admin-empty"]')).toHaveText(
      'Select a session to monitor',
    )
  })

  test('admin layout has sidebar and main area', async ({ page }) => {
    await page.goto('/admin')

    const layout = page.locator('[data-testid="admin-layout"]')
    await expect(layout).toBeVisible()

    // Sidebar
    await expect(page.locator('[data-testid="session-list"]')).toBeVisible()

    // Check grid layout
    const display = await layout.evaluate(
      (el) => getComputedStyle(el).display,
    )
    expect(display).toBe('grid')
  })

  test('admin viewer opens and shows session header', async ({
    browser,
  }) => {
    // Create a session so admin has something to view
    const sessionId = await createSessionAs('live-test-user')

    // Open admin page
    const adminCtx = await browser.newContext()
    const adminPage = await adminCtx.newPage()
    await adminPage.goto('/admin')

    // Click the session to open viewer
    const sessionItem = adminPage.locator('[data-testid="session-item"]').first()
    await expect(sessionItem).toBeVisible({ timeout: 10000 })
    await sessionItem.click()

    // Session viewer should render with the session header
    await expect(adminPage.locator('[data-testid="session-viewer"]')).toBeVisible()
    await expect(adminPage.locator('[data-testid="session-viewer"] h3')).toContainText('Session:')

    await adminCtx.close()
  })
})

// ------- Routing tests -------

test.describe('Routing', () => {
  test('/ renders chat page', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible()
  })

  test('/admin renders admin page', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.locator('[data-testid="admin-page"]')).toBeVisible()
    await expect(page.locator('[data-testid="admin-header"]')).toBeVisible()
  })

  test('navigating between routes works', async ({ page }) => {
    await page.goto('/')
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible()

    await page.goto('/admin')
    await expect(page.locator('[data-testid="admin-page"]')).toBeVisible()

    await page.goto('/')
    await expect(page.locator('[data-testid="chat-container"]')).toBeVisible()
  })
})
