import { test, expect } from '@playwright/test'

test.describe('Workshop Flow', () => {
  test('basic chat flow: click Start, receive response', async ({ page }) => {
    await page.goto('/')

    // Start screen should be visible
    await expect(page.locator('.start-btn')).toBeVisible()

    // Click Start
    await page.locator('.start-btn').click()

    // Wait for assistant message (with timeout for SSE)
    const assistantMsg = page.locator('.assistant-message').first()
    await expect(assistantMsg).toBeVisible({ timeout: 10000 })
  })

  test('renders assistant message with widgets', async ({ page }) => {
    await page.goto('/')
    await page.locator('.start-btn').click()

    // Wait for assistant message (with timeout for SSE)
    const assistantMsg = page.locator('.assistant-message').first()
    await expect(assistantMsg).toBeVisible({ timeout: 10000 })
  })

  test('ask message renders form and accepts input', async ({ page }) => {
    await page.goto('/')
    await page.locator('.start-btn').click()

    // Wait for ask message
    const askMsg = page.locator('.ask-message').first()
    await expect(askMsg).toBeVisible({ timeout: 10000 })

    // Should have a submit button
    await expect(askMsg.locator('.submit-btn')).toBeVisible()
  })
})
