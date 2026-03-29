import { test, expect, type Locator } from '@playwright/test'

async function fillAndSubmitAsk(askMsg: Locator, text = 'Test') {
  const textInput = askMsg.locator('textarea, input[type="text"]').first()
  if (await textInput.isVisible()) {
    await textInput.fill(text)
  }
  const radio = askMsg.locator('input[type="radio"]').first()
  if (await radio.isVisible()) {
    await radio.click()
  }
  await askMsg.locator('.submit-btn').click()
}

test.describe('Ask Flow', () => {
  test('full ask flow: Start → ask form → fill → submit → done', async ({ page }) => {
    await page.goto('/')
    await page.locator('.start-btn').click()

    await expect(page.locator('.assistant-message').first()).toBeVisible({ timeout: 10000 })

    const askMsg = page.locator('.ask-message').first()
    await expect(askMsg).toBeVisible({ timeout: 10000 })

    await fillAndSubmitAsk(askMsg, 'We build forecasting tools')

    await expect(page.locator('.widget-final-result')).toBeVisible({ timeout: 10000 })
  })

  test('InputArea is hidden while ask is pending', async ({ page }) => {
    await page.goto('/')
    await page.locator('.start-btn').click()

    await expect(page.locator('.ask-message').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.input-area')).not.toBeVisible()
  })

  test('InputArea returns after submit + done', async ({ page }) => {
    await page.goto('/')
    await page.locator('.start-btn').click()

    const askMsg = page.locator('.ask-message').first()
    await expect(askMsg).toBeVisible({ timeout: 10000 })

    await fillAndSubmitAsk(askMsg, 'Test company')

    await expect(page.locator('.widget-final-result')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.input-area')).toBeVisible()
  })

  test('ask form gets answered class after submit', async ({ page }) => {
    await page.goto('/')
    await page.locator('.start-btn').click()

    const askMsg = page.locator('.ask-message').first()
    await expect(askMsg).toBeVisible({ timeout: 10000 })

    await fillAndSubmitAsk(askMsg)

    await expect(askMsg).toHaveClass(/answered/, { timeout: 10000 })
  })
})
