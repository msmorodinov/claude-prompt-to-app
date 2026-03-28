import { test, expect } from '@playwright/test'

const MOBILE_VIEWPORT = { width: 375, height: 812 } // iPhone SE
const DESKTOP_VIEWPORT = { width: 1280, height: 800 }

async function startWorkshopAndSubmit(page: any) {
  await page.goto('/')

  // Start chat
  const input = page.locator('.input-area input')
  await input.fill('Test workshop')
  await page.locator('.input-area button').click()

  // Wait for ask form
  const askMsg = page.locator('.ask-message').first()
  await expect(askMsg).toBeVisible({ timeout: 10000 })

  // Fill free_text
  const textInput = askMsg.locator('textarea, input[type="text"]').first()
  if (await textInput.isVisible()) {
    await textInput.fill('We build demand forecasting tools')
  }

  // Select radio
  const radio = askMsg.locator('input[type="radio"]').first()
  if (await radio.isVisible()) {
    await radio.click()
  }

  // Submit
  await askMsg.locator('.submit-btn').click()

  // Wait for all widgets to appear
  await expect(page.locator('.widget-data-table').first()).toBeVisible({ timeout: 10000 })
}

test.describe('Desktop viewport', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT)
  })

  test('full flow renders all widget types', async ({ page }) => {
    await startWorkshopAndSubmit(page)

    // data_table
    await expect(page.locator('.widget-data-table table')).toBeVisible()
    await expect(page.locator('.widget-data-table th').first()).toHaveText('Name')
    await expect(page.locator('.widget-data-table td').first()).toHaveText('Acme Corp')

    // comparison
    await expect(page.locator('.widget-comparison')).toBeVisible()
    await expect(page.locator('.widget-comparison .side-label').first()).toHaveText('Draft')
    await expect(page.locator('.widget-comparison .diff-note')).toHaveText('Much more specific and verifiable')

    // category_list
    await expect(page.locator('.widget-category-list')).toBeVisible()
    await expect(page.locator('.widget-category-list h4').first()).toHaveText('Agreed')
    await expect(page.locator('.widget-category-list .category-success')).toBeVisible()
    await expect(page.locator('.widget-category-list .category-warning')).toBeVisible()

    // quote_highlight
    await expect(page.locator('.widget-quote-highlight blockquote')).toBeVisible()

    // metric_bars
    await expect(page.locator('.widget-metric-bars')).toBeVisible()
    await expect(page.locator('.widget-metric-bars .metric-label').first()).toHaveText('Specificity')

    // final_result
    await expect(page.locator('.widget-final-result')).toBeVisible()

    // progress
    await expect(page.locator('.widget-progress')).toBeVisible()
  })

  test('comparison card uses side-by-side grid on desktop', async ({ page }) => {
    await startWorkshopAndSubmit(page)

    const sides = page.locator('.widget-comparison .comparison-sides')
    const box = await sides.boundingBox()
    // On desktop, two columns — width should be significant
    expect(box!.width).toBeGreaterThan(300)
  })

  test('data_table has scroll wrapper', async ({ page }) => {
    await startWorkshopAndSubmit(page)

    await expect(page.locator('.widget-data-table .table-scroll-wrapper')).toBeVisible()
  })
})

test.describe('Mobile viewport (375px)', () => {
  test.beforeEach(async ({ page }) => {
    await page.setViewportSize(MOBILE_VIEWPORT)
  })

  test('full flow renders all widgets on mobile', async ({ page }) => {
    await startWorkshopAndSubmit(page)

    // All widgets visible
    await expect(page.locator('.widget-data-table')).toBeVisible()
    await expect(page.locator('.widget-comparison')).toBeVisible()
    await expect(page.locator('.widget-category-list')).toBeVisible()
    await expect(page.locator('.widget-metric-bars')).toBeVisible()
    await expect(page.locator('.widget-final-result')).toBeVisible()
  })

  test('comparison card stacks vertically on mobile', async ({ page }) => {
    await startWorkshopAndSubmit(page)

    const sides = page.locator('.widget-comparison .comparison-sides')
    await expect(sides).toBeVisible()

    // Check that the grid uses 1fr (stacked) — left and right sides should be ~same width
    const leftSide = page.locator('.widget-comparison .side.left')
    const rightSide = page.locator('.widget-comparison .side.right')
    const leftBox = await leftSide.boundingBox()
    const rightBox = await rightSide.boundingBox()

    // Stacked: right should be below left (higher Y)
    expect(rightBox!.y).toBeGreaterThan(leftBox!.y)
  })

  test('submit button is full-width on mobile', async ({ page }) => {
    await page.goto('/')
    await page.locator('.input-area input').fill('test')
    await page.locator('.input-area button').click()

    const askMsg = page.locator('.ask-message').first()
    await expect(askMsg).toBeVisible({ timeout: 10000 })

    const submitBtn = askMsg.locator('.submit-btn')
    const btnBox = await submitBtn.boundingBox()
    const askBox = await askMsg.boundingBox()

    // Button should take most of the ask message width (accounting for padding)
    expect(btnBox!.width).toBeGreaterThan(askBox!.width * 0.8)
  })

  test('table has horizontal scroll on mobile', async ({ page }) => {
    await startWorkshopAndSubmit(page)

    const wrapper = page.locator('.widget-data-table .table-scroll-wrapper')
    await expect(wrapper).toBeVisible()

    // The table might overflow — verify wrapper has overflow-x auto
    const overflow = await wrapper.evaluate((el: HTMLElement) =>
      getComputedStyle(el).overflowX
    )
    expect(overflow).toBe('auto')
  })

  test('touch targets are at least 48px', async ({ page }) => {
    await page.goto('/')
    await page.locator('.input-area input').fill('test')
    await page.locator('.input-area button').click()

    const askMsg = page.locator('.ask-message').first()
    await expect(askMsg).toBeVisible({ timeout: 10000 })

    // Check radio option min-height
    const option = askMsg.locator('.option').first()
    if (await option.isVisible()) {
      const box = await option.boundingBox()
      expect(box!.height).toBeGreaterThanOrEqual(47.5)
    }
  })

  test('chat container uses full width on mobile', async ({ page }) => {
    await page.goto('/')

    const container = page.locator('.chat-container')
    const box = await container.boundingBox()

    // Should fill viewport width (375px)
    expect(box!.width).toBeGreaterThan(350)
  })
})
