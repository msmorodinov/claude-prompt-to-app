import { test, expect } from '@playwright/test'

test.describe('Session Sidebar', () => {
  test.use({ viewport: { width: 375, height: 812 } })

  test.beforeEach(async ({ page }) => {
    // Clear localStorage to get fresh user ID
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.reload()
  })

  test('sidebar toggle button is visible', async ({ page }) => {
    await page.goto('/')
    const toggle = page.locator('.sidebar-toggle')
    await expect(toggle).toBeVisible()
  })

  test('sidebar opens and closes', async ({ page }) => {
    await page.goto('/')
    const sidebar = page.locator('.session-sidebar')
    const toggle = page.locator('.sidebar-toggle')

    // Initially closed
    await expect(sidebar).not.toHaveClass(/open/)

    // Open
    await toggle.click()
    await expect(sidebar).toHaveClass(/open/)

    // Overlay visible
    await expect(page.locator('.sidebar-overlay')).toBeVisible()

    // Close via X button
    await page.locator('.sidebar-close').click()
    await expect(sidebar).not.toHaveClass(/open/)
  })

  test('sidebar closes when clicking overlay', async ({ page }) => {
    await page.goto('/')
    await page.locator('.sidebar-toggle').click()
    await expect(page.locator('.session-sidebar')).toHaveClass(/open/)

    // Click overlay
    await page.locator('.sidebar-overlay').click()
    await expect(page.locator('.session-sidebar')).not.toHaveClass(/open/)
  })

  test('sidebar shows "No sessions yet" for new user', async ({ page }) => {
    await page.goto('/')
    await page.locator('.sidebar-toggle').click()
    await expect(page.locator('.sidebar-empty')).toHaveText('No sessions yet')
  })

  test('new session button creates fresh session', async ({ page }) => {
    await page.goto('/')
    // Should see start screen
    await expect(page.locator('.start-screen')).toBeVisible()

    // Start a session
    await page.locator('.start-btn').click()
    await page.waitForSelector('.assistant-message', { timeout: 5000 })

    // Open sidebar and click New Session
    await page.locator('.sidebar-toggle').click()
    await page.locator('.sidebar-new-btn').click()

    // Should see start screen again
    await expect(page.locator('.start-screen')).toBeVisible()
  })

  test('completed session appears in sidebar', async ({ page }) => {
    await page.goto('/')

    // Start session and complete the first ask
    await page.locator('.start-btn').click()
    await page.waitForSelector('.ask-message', { timeout: 5000 })

    // Fill in free_text
    await page.locator('.widget-free-text textarea').fill('We build test automation tools')
    // Select first radio option
    await page.locator('.option').first().click()
    // Submit
    await page.locator('.submit-btn').click()

    // Wait for second ask
    await page.waitForSelector('.widget-slider-scale', { timeout: 5000 })

    // Fill slider (just leave default) and add a tag
    const tagInput = page.locator('.widget-tag-input input')
    await tagInput.fill('quality')
    await tagInput.press('Enter')

    // Submit second form
    await page.locator('.submit-btn').last().click()

    // Wait for done (final_result should appear)
    await page.waitForSelector('.widget-final-result', { timeout: 5000 })

    // Now open sidebar - session should be listed
    await page.locator('.sidebar-toggle').click()
    // Wait for polling to pick up the session (mock server has it immediately)
    await expect(page.locator('.sidebar-session-item')).toBeVisible({ timeout: 12000 })

    // Session title should be "start" (first message)
    await expect(page.locator('.sidebar-session-title').first()).toHaveText('start')
  })

  test('clicking past session shows read-only view', async ({ page }) => {
    await page.goto('/')

    // Complete a session first
    await page.locator('.start-btn').click()
    await page.waitForSelector('.ask-message', { timeout: 5000 })
    await page.locator('.widget-free-text textarea').fill('Test company')
    await page.locator('.option').first().click()
    await page.locator('.submit-btn').click()
    await page.waitForSelector('.widget-slider-scale', { timeout: 5000 })
    const tagInput = page.locator('.widget-tag-input input')
    await tagInput.fill('fast')
    await tagInput.press('Enter')
    await page.locator('.submit-btn').last().click()
    await page.waitForSelector('.widget-final-result', { timeout: 5000 })

    // Create new session
    await page.locator('.sidebar-toggle').click()
    await page.locator('.sidebar-new-btn').click()
    await expect(page.locator('.start-screen')).toBeVisible()

    // Open sidebar and click on old session
    await page.locator('.sidebar-toggle').click()
    await expect(page.locator('.sidebar-session-item')).toBeVisible({ timeout: 12000 })
    await page.locator('.sidebar-session-item').first().click()

    // Should switch to the old session — history messages visible, no readonly banner
    await expect(page.locator('.message-list')).toBeVisible()
    // Old sessions can be continued — no readonly restrictions
    await expect(page.locator('.readonly-banner')).not.toBeVisible()
  })
})
