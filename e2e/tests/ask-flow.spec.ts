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

async function fillSliderAndTags(askMsg: Locator, tags: string[] = ['fast', 'reliable']) {
  // Move slider
  const slider = askMsg.locator('input[type="range"]')
  await expect(slider).toBeVisible()
  await slider.fill('8')

  // Add tags via keyboard
  const tagInput = askMsg.locator('.widget-tag-input input[type="text"]')
  for (const tag of tags) {
    await tagInput.fill(tag)
    await tagInput.press('Enter')
  }

  await askMsg.locator('.submit-btn').click()
}

async function completeFullFlow(page: import('@playwright/test').Page) {
  await page.goto('/')
  await page.locator('.start-btn').click()

  // First ask: free_text + single_select
  const ask1 = page.locator('.ask-message').first()
  await expect(ask1).toBeVisible({ timeout: 10000 })
  await fillAndSubmitAsk(ask1, 'We build forecasting tools')

  // Second ask: slider_scale + tag_input
  const ask2 = page.locator('.ask-message').nth(1)
  await expect(ask2).toBeVisible({ timeout: 10000 })
  await fillSliderAndTags(ask2)

  return { ask1, ask2 }
}

test.describe('Ask Flow', () => {
  test('full flow: two ask rounds → display widgets → done', async ({ page }) => {
    await completeFullFlow(page)

    await expect(page.locator('.widget-final-result')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.widget-copyable')).toBeVisible()
    await expect(page.locator('.widget-timer')).toBeVisible()
    await expect(page.locator('.widget-metric-bars')).toBeVisible()
    await expect(page.locator('.widget-progress')).toBeVisible()
  })

  test('slider_scale renders with labels', async ({ page }) => {
    await page.goto('/')
    await page.locator('.start-btn').click()

    const ask1 = page.locator('.ask-message').first()
    await expect(ask1).toBeVisible({ timeout: 10000 })
    await fillAndSubmitAsk(ask1)

    const ask2 = page.locator('.ask-message').nth(1)
    await expect(ask2).toBeVisible({ timeout: 10000 })

    await expect(ask2.locator('.widget-slider-scale')).toBeVisible()
    await expect(ask2.locator('.slider-label-min')).toHaveText('Not at all')
    await expect(ask2.locator('.slider-label-max')).toHaveText('Absolutely')
  })

  test('tag_input adds and displays tags', async ({ page }) => {
    await page.goto('/')
    await page.locator('.start-btn').click()

    const ask1 = page.locator('.ask-message').first()
    await expect(ask1).toBeVisible({ timeout: 10000 })
    await fillAndSubmitAsk(ask1)

    const ask2 = page.locator('.ask-message').nth(1)
    await expect(ask2).toBeVisible({ timeout: 10000 })

    const tagInput = ask2.locator('.widget-tag-input input[type="text"]')
    await tagInput.fill('innovative')
    await tagInput.press('Enter')
    await tagInput.fill('fast')
    await tagInput.press('Enter')

    await expect(ask2.locator('.tag')).toHaveCount(2)
    await expect(ask2.locator('.tag').first()).toHaveText(/innovative/)
  })

  test('copyable block has copy button', async ({ page }) => {
    await completeFullFlow(page)

    const copyable = page.locator('.widget-copyable')
    await expect(copyable).toBeVisible({ timeout: 10000 })
    await expect(copyable.locator('.copy-btn')).toBeVisible()
    await expect(copyable.locator('.copyable-content')).toContainText('FMCG brand managers')
  })

  test('display widgets render after both asks', async ({ page }) => {
    await completeFullFlow(page)

    // Display widgets from step 3
    await expect(page.locator('.widget-data-table')).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.widget-comparison')).toBeVisible()
    await expect(page.locator('.widget-category-list')).toBeVisible()
    await expect(page.locator('.widget-quote-highlight')).toBeVisible()
  })

  test('InputArea is hidden while ask is pending', async ({ page }) => {
    await page.goto('/')
    await page.locator('.start-btn').click()

    await expect(page.locator('.ask-message').first()).toBeVisible({ timeout: 10000 })
    await expect(page.locator('.input-area')).not.toBeVisible()
  })

  test('InputArea returns after all asks + done', async ({ page }) => {
    await completeFullFlow(page)

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
