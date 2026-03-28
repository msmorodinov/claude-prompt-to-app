/**
 * Capture README screenshots using mock server.
 *
 * Usage:
 *   1. Start mock server:  python -m e2e.fixtures.mock_server --port 8001
 *   2. Start frontend:     cd frontend && VITE_API_URL=http://localhost:8001 npm run dev -- --port 5174
 *   3. Run this script:    npx playwright test e2e/take-screenshots.ts --config=e2e/playwright.config.ts
 */
import { test, expect } from '@playwright/test'
import path from 'path'

const screenshotDir = path.join(__dirname, '..', '..', 'docs', 'screenshots')

test('capture screenshots for README', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 })
  await page.goto('/')

  // Screenshot 1: Landing page
  await page.waitForTimeout(500)
  await page.screenshot({
    path: path.join(screenshotDir, '01-welcome.png'),
    fullPage: false,
  })

  // Start a workshop session
  const input = page.locator('.input-area input')
  await input.fill('We build AI tools for FMCG brand managers')
  await page.locator('.input-area button').click()

  // Wait for assistant message with display widgets
  const assistantMsg = page.locator('.assistant-message').first()
  await expect(assistantMsg).toBeVisible({ timeout: 10000 })

  // Wait for ask message form
  const askMsg = page.locator('.ask-message').first()
  await expect(askMsg).toBeVisible({ timeout: 10000 })

  // Screenshot 2: Chat with assistant message + ask form
  await page.waitForTimeout(300)
  await page.screenshot({
    path: path.join(screenshotDir, '02-ask-form.png'),
    fullPage: true,
  })

  // Fill in the form and submit
  const freeTextInput = askMsg.locator('textarea, input[type="text"]').first()
  if (await freeTextInput.isVisible()) {
    await freeTextInput.fill('We build demand forecasting tools for CPG companies')
  }

  // Select a radio option if visible
  const radioOption = askMsg.locator('input[type="radio"]').first()
  if (await radioOption.isVisible()) {
    await radioOption.click()
  }

  // Submit
  await askMsg.locator('.submit-btn').click()

  // Wait for final result
  const finalResult = page.locator('.widget-final-result').first()
  await expect(finalResult).toBeVisible({ timeout: 15000 })

  // Screenshot 3: Final result
  await page.waitForTimeout(500)
  await page.screenshot({
    path: path.join(screenshotDir, '03-final-result.png'),
    fullPage: true,
  })
})
