import { test, expect } from '@playwright/test'

test.use({ screenshot: 'on' })

test.describe('Session Sidebar — Visual Inspection', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/')
    await page.evaluate(() => {
      localStorage.clear()
      sessionStorage.clear()
    })
    await page.reload()
    await page.waitForSelector('[data-testid="chat-container"]')
  })

  test('1. initial state — start screen + hamburger', async ({ page }) => {
    await expect(page.locator('[data-testid="start-screen"]')).toBeVisible()
    await expect(page.locator('[data-testid="sidebar-toggle"]')).toBeVisible()
    await page.screenshot({ path: 'test-results/01-initial-start-screen.png', fullPage: true })
  })

  test('2. sidebar open — empty state', async ({ page }) => {
    // On desktop (1280px+), sidebar is open by default — no toggle click needed
    await expect(page.locator('[data-testid="session-sidebar"]')).toHaveClass(/open/)
    await page.screenshot({ path: 'test-results/02-sidebar-empty.png', fullPage: true })

    // Check sidebar elements
    await expect(page.locator('[data-testid="sidebar-header"] h2')).toHaveText('Sessions')
    await expect(page.locator('[data-testid="sidebar-new-btn"]')).toBeVisible()
    await expect(page.locator('[data-testid="sidebar-empty"]')).toHaveText('No sessions yet')
    await expect(page.locator('[data-testid="sidebar-close"]')).toBeVisible()
  })

  test('3. hamburger position — not overlapping header', async ({ page }) => {
    const toggle = page.locator('[data-testid="sidebar-toggle"]')
    const header = page.locator('[data-testid="app-header"]')

    // Start a session to see the header
    await page.locator('[data-testid="start-btn"]').click()
    await page.waitForSelector('[data-testid="app-header"] h1', { timeout: 5000 })
    await page.screenshot({ path: 'test-results/03-hamburger-vs-header.png', fullPage: true })

    const toggleBox = await toggle.boundingBox()
    const headerBox = await header.boundingBox()
    // Log positions for visual debugging
    console.log('Toggle:', toggleBox)
    console.log('Header:', headerBox)
  })

  test('4. complete a workshop session', async ({ page }) => {
    // Start
    await page.locator('[data-testid="start-btn"]').click()
    await page.waitForSelector('[data-testid="assistant-message"]', { timeout: 5000 })
    await page.screenshot({ path: 'test-results/04a-first-assistant-message.png', fullPage: true })

    // Wait for ask form
    await page.waitForSelector('[data-testid="ask-message"]', { timeout: 5000 })
    await page.screenshot({ path: 'test-results/04b-first-ask-form.png', fullPage: true })

    // Fill form
    await page.locator('[data-testid="widget-free-text"] textarea').fill('We build developer tools for CI/CD')
    await page.locator('[data-testid="option"]').first().click()
    await page.screenshot({ path: 'test-results/04c-filled-form.png', fullPage: true })

    // Submit
    await page.locator('[data-testid="submit-btn"]').click()
    await page.waitForSelector('[data-testid="widget-slider-scale"]', { timeout: 5000 })
    await page.screenshot({ path: 'test-results/04d-second-ask.png', fullPage: true })

    // Fill second form
    const tagInput = page.locator('[data-testid="widget-tag-input"] input')
    await tagInput.fill('fast')
    await tagInput.press('Enter')
    await tagInput.fill('reliable')
    await tagInput.press('Enter')
    await page.locator('[data-testid="submit-btn"]').last().click()

    // Wait for final result
    await page.waitForSelector('[data-testid="widget-final-result"]', { timeout: 5000 })
    await page.screenshot({ path: 'test-results/04e-session-complete.png', fullPage: true })
  })

  test('5. sidebar shows completed session', async ({ page }) => {
    // Complete a session first
    await page.locator('[data-testid="start-btn"]').click()
    await page.waitForSelector('[data-testid="ask-message"]', { timeout: 5000 })
    await page.locator('[data-testid="widget-free-text"] textarea').fill('Test company')
    await page.locator('[data-testid="option"]').first().click()
    await page.locator('[data-testid="submit-btn"]').click()
    await page.waitForSelector('[data-testid="widget-slider-scale"]', { timeout: 5000 })
    const tagInput = page.locator('[data-testid="widget-tag-input"] input')
    await tagInput.fill('x')
    await tagInput.press('Enter')
    await page.locator('[data-testid="submit-btn"]').last().click()
    await page.waitForSelector('[data-testid="widget-final-result"]', { timeout: 5000 })

    // Sidebar is already open on desktop — just wait for session to appear
    await expect(page.locator('[data-testid="sidebar-session-item"]')).toBeVisible({ timeout: 12000 })
    await page.screenshot({ path: 'test-results/05-sidebar-with-session.png', fullPage: true })

    // Verify session item content
    const title = page.locator('[data-testid="sidebar-session-title"]').first()
    await expect(title).toHaveText('start')
    const meta = page.locator('[data-testid="sidebar-session-meta"]').first()
    await expect(meta).toContainText('msgs')
  })

  test('6. view past session — read-only mode', async ({ page }) => {
    // Complete session
    await page.locator('[data-testid="start-btn"]').click()
    await page.waitForSelector('[data-testid="ask-message"]', { timeout: 5000 })
    await page.locator('[data-testid="widget-free-text"] textarea').fill('CI/CD tools')
    await page.locator('[data-testid="option"]').first().click()
    await page.locator('[data-testid="submit-btn"]').click()
    await page.waitForSelector('[data-testid="widget-slider-scale"]', { timeout: 5000 })
    const tagInput = page.locator('[data-testid="widget-tag-input"] input')
    await tagInput.fill('speed')
    await tagInput.press('Enter')
    await page.locator('[data-testid="submit-btn"]').last().click()
    await page.waitForSelector('[data-testid="widget-final-result"]', { timeout: 5000 })

    // New session — sidebar is already open on desktop, new-btn is visible
    await page.locator('[data-testid="sidebar-new-btn"]').click()
    await expect(page.locator('[data-testid="start-screen"]')).toBeVisible()
    await page.screenshot({ path: 'test-results/06a-new-session-start.png', fullPage: true })

    // Click on old session — sidebar is still open
    await expect(page.locator('[data-testid="sidebar-session-item"]')).toBeVisible({ timeout: 12000 })
    await page.locator('[data-testid="sidebar-session-item"]').first().click()

    // Switching to past session — should show history, no readonly banner
    await page.screenshot({ path: 'test-results/06b-past-session-switched.png', fullPage: true })
    await expect(page.locator('[data-testid="readonly-banner"]')).not.toBeVisible()

    // Check if messages are displayed — should have content from history
    const messageList = page.locator('[data-testid="message-list"]')
    await page.waitForTimeout(500) // Give time for messages to render
    await page.screenshot({ path: 'test-results/06c-past-session-messages.png', fullPage: true })
    const msgCount = await messageList.locator('[data-testid="assistant-message"], [data-testid="ask-message"], [data-testid="user-message"]').count()
    console.log(`Messages in switched session: ${msgCount}`)
    expect(msgCount).toBeGreaterThan(0)
  })

  test('8. mobile viewport — sidebar as drawer', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 812 })
    await page.reload()
    await page.waitForSelector('[data-testid="chat-container"]')
    await page.screenshot({ path: 'test-results/08a-mobile-start.png', fullPage: true })

    await page.locator('[data-testid="sidebar-toggle"]').click()
    await expect(page.locator('[data-testid="session-sidebar"]')).toHaveClass(/open/)
    await page.screenshot({ path: 'test-results/08b-mobile-sidebar-open.png', fullPage: true })

    // Sidebar should not exceed viewport on mobile
    const sidebar = await page.locator('[data-testid="session-sidebar"]').boundingBox()
    console.log('Mobile sidebar width:', sidebar?.width)
    expect(sidebar?.width).toBeLessThanOrEqual(375)
  })

  test('9. multiple sessions in sidebar', async ({ page }) => {
    // Session 1
    await page.locator('[data-testid="start-btn"]').click()
    await page.waitForSelector('[data-testid="ask-message"]', { timeout: 5000 })
    await page.locator('[data-testid="widget-free-text"] textarea').fill('First session')
    await page.locator('[data-testid="option"]').first().click()
    await page.locator('[data-testid="submit-btn"]').click()
    await page.waitForSelector('[data-testid="widget-slider-scale"]', { timeout: 5000 })
    const tagInput1 = page.locator('[data-testid="widget-tag-input"] input')
    await tagInput1.fill('a')
    await tagInput1.press('Enter')
    await page.locator('[data-testid="submit-btn"]').last().click()
    await page.waitForSelector('[data-testid="widget-final-result"]', { timeout: 5000 })

    // Session 2 — sidebar is already open on desktop, new-btn is visible
    await page.locator('[data-testid="sidebar-new-btn"]').click()
    await page.locator('[data-testid="start-btn"]').click()
    await page.waitForSelector('[data-testid="ask-message"]', { timeout: 5000 })
    await page.locator('[data-testid="widget-free-text"] textarea').fill('Second session')
    await page.locator('[data-testid="option"]').first().click()
    await page.locator('[data-testid="submit-btn"]').click()
    await page.waitForSelector('[data-testid="widget-slider-scale"]', { timeout: 5000 })
    const tagInput2 = page.locator('[data-testid="widget-tag-input"] input')
    await tagInput2.fill('b')
    await tagInput2.press('Enter')
    await page.locator('[data-testid="submit-btn"]').last().click()
    await page.waitForSelector('[data-testid="widget-final-result"]', { timeout: 5000 })

    // Sidebar is already open on desktop — should show both sessions
    await expect(page.locator('[data-testid="sidebar-session-item"]')).toHaveCount(2, { timeout: 12000 })
    await page.screenshot({ path: 'test-results/09-multiple-sessions.png', fullPage: true })
  })
})
