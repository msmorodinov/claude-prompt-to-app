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

    const chatRes = await request.post(`${MOCK_SERVER}/chat`, {
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'user-B' },
      data: { message: 'hack', session_id: sessionId },
    })
    expect(chatRes.status()).toBe(403)

    const ansRes = await request.post(`${MOCK_SERVER}/answers`, {
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'user-B' },
      data: { session_id: sessionId, ask_id: 'mock-ask-1', answers: { x: 'y' } },
    })
    expect(ansRes.status()).toBe(403)
  })

  test('admin dashboard shows seeded sessions', async ({ page, request }) => {
    const sessionId = await createSessionAs(request, 'test-user')
    await request.post(`${MOCK_SERVER}/chat`, {
      headers: { 'Content-Type': 'application/json', 'X-User-Id': 'test-user' },
      data: { message: 'Hello', session_id: sessionId },
    })
    await new Promise((resolve) => setTimeout(resolve, 500))

    await page.goto('/admin')
    await expect(page.locator('[data-testid="admin-header"] h1')).toHaveText('Admin')
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
