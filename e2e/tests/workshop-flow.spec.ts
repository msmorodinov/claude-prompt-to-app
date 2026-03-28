import { test, expect } from '@playwright/test'

test.describe('Workshop Flow', () => {
  test('basic chat flow: send message, receive response', async ({ page }) => {
    await page.goto('/')

    // Verify page loads
    await expect(page.locator('.app-header h1')).toHaveText(
      'Positioning Workshop',
    )

    // Type a message and send
    const input = page.locator('.input-area input')
    await input.fill('Hello, I need help with positioning')
    await page.locator('.input-area button').click()

    // Input should be disabled while loading
    await expect(input).toBeDisabled()
  })

  test('renders assistant message with widgets', async ({ page }) => {
    await page.goto('/')

    // Start chat
    await page.locator('.input-area input').fill('Start workshop')
    await page.locator('.input-area button').click()

    // Wait for assistant message (with timeout for SSE)
    const assistantMsg = page.locator('.assistant-message').first()
    await expect(assistantMsg).toBeVisible({ timeout: 10000 })
  })

  test('ask message renders form and accepts input', async ({ page }) => {
    await page.goto('/')

    // Start chat
    await page.locator('.input-area input').fill('Start')
    await page.locator('.input-area button').click()

    // Wait for ask message
    const askMsg = page.locator('.ask-message').first()
    await expect(askMsg).toBeVisible({ timeout: 10000 })

    // Should have a submit button
    await expect(askMsg.locator('.submit-btn')).toBeVisible()
  })
})
