/**
 * Admin UI E2E tests — app management.
 * Runs against mock server at localhost:4910.
 */
import { test, expect, type APIRequestContext } from '@playwright/test'

const API_BASE = 'http://localhost:4910'

async function seedApp(request: APIRequestContext) {
  const slug = `test-app-${Date.now()}`
  const resp = await request.post(`${API_BASE}/admin/apps`, {
    data: { slug, title: 'Test App', body: 'You are a test assistant.' },
  })
  expect(resp.ok()).toBeTruthy()
  return resp.json()
}

test.describe('Admin Apps', () => {
  test.beforeEach(async ({ request }) => {
    await request.post(`${API_BASE}/test/reset`)
  })

  test('admin page loads', async ({ page }) => {
    await page.goto('/admin')
    await expect(page.locator('[data-testid="admin-page"]')).toBeVisible()
    await expect(page.locator('[data-testid="admin-header"] h1')).toHaveText('Admin')
  })

  test('create app form and submission', async ({ page }) => {
    await page.goto('/admin')
    await page.locator('[data-testid="admin-tab"]', { hasText: 'Apps' }).click()
    await expect(page.locator('[data-testid="app-list"]')).toBeVisible()

    // Open create form
    await page.locator('[data-testid="btn-create-app"]').click()

    const form = page.locator('[data-testid="app-create-form"]')
    await expect(form).toBeVisible()

    // Fill and verify slug preview
    await form.locator('[data-testid="app-form-input"]').fill('Test Live App')
    await expect(form.locator('[data-testid="app-form-slug-preview"]')).toHaveText('test-live-app')

    // Submit
    await form.locator('[data-testid="btn-create-app-submit"]').click()

    // Editor opens
    await expect(page.locator('[data-testid="app-editor"]')).toBeVisible({ timeout: 10000 })
  })

  test('app editor menu shows expected items', async ({ page, request }) => {
    await seedApp(request)
    await page.goto('/admin')
    await page.locator('[data-testid="admin-tab"]', { hasText: 'Apps' }).click()
    await expect(page.locator('[data-testid="app-list-item"]').first()).toBeVisible({ timeout: 8000 })
    await page.locator('[data-testid="app-list-item"]').first().click()
    await expect(page.locator('[data-testid="app-editor"]')).toBeVisible({ timeout: 8000 })

    // Open menu
    await page.locator('[data-testid="admin-menu-trigger"]').click()
    const dropdown = page.locator('[data-testid="admin-menu-dropdown"]')
    await expect(dropdown).toBeVisible()

    // Verify key menu items exist
    await expect(dropdown.locator('[data-testid="admin-menu-item"]', { hasText: 'Publish' })).toBeVisible()
    await expect(dropdown.locator('[data-testid="admin-menu-item"]', { hasText: 'Environment' })).toBeVisible()
    await expect(dropdown.locator('[data-testid="admin-menu-item"]', { hasText: 'History' })).toBeVisible()
    await expect(dropdown.locator('[data-testid="admin-menu-item"]', { hasText: 'Rename' })).toBeVisible()
    await expect(dropdown.locator('[data-testid="admin-menu-item--danger"]')).toBeVisible()
  })

  test('rename app inline', async ({ page, request }) => {
    await seedApp(request)
    await page.goto('/admin')
    await page.locator('[data-testid="admin-tab"]', { hasText: 'Apps' }).click()
    await expect(page.locator('[data-testid="app-list-item"]').first()).toBeVisible({ timeout: 8000 })
    await page.locator('[data-testid="app-list-item"]').first().click()
    await expect(page.locator('[data-testid="app-editor"]')).toBeVisible({ timeout: 8000 })

    // Open menu -> Rename
    await page.locator('[data-testid="admin-menu-trigger"]').click()
    await page.locator('[data-testid="admin-menu-item"]', { hasText: 'Rename' }).click()

    const renameInput = page.locator('[data-testid="admin-rename-input"]')
    await expect(renameInput).toBeVisible({ timeout: 3000 })

    await renameInput.fill('Renamed App')
    await renameInput.press('Enter')

    await expect(renameInput).not.toBeVisible({ timeout: 5000 })
    await expect(page.locator('[data-testid="admin-app-name"]')).toContainText('Renamed', { timeout: 8000 })
  })
})
