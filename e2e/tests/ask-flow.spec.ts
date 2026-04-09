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
