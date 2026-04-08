/**
 * Live E2E tests for the Admin UI — apps tab, create form, menu, panels, rename.
 * Runs against the real backend at localhost:4910.
 * Each test seeds its own app via API for full isolation.
 */
import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

const API_BASE = 'http://localhost:4910'

interface SeedApp {
  id: string
  slug: string
  title: string
}

/** Create a test app via API and return its metadata. */
async function seedApp(request: APIRequestContext): Promise<SeedApp> {
  const slug = `test-app-${Date.now()}`
  const resp = await request.post(`${API_BASE}/admin/apps`, {
    data: { slug, title: 'Test App', body: 'You are a test assistant.' },
  })
  expect(resp.ok()).toBeTruthy()
  const data = await resp.json()
  return { id: data.id, slug: data.slug ?? slug, title: data.title ?? 'Test App' }
}

async function goToAdmin(page: Page) {
  await page.goto('/admin')
  await expect(page.locator('[data-testid="admin-page"]')).toBeVisible({ timeout: 10_000 })
}

async function switchToAppsTab(page: Page) {
  await page.locator('[data-testid="admin-tab"]', { hasText: 'Apps' }).click()
  await expect(page.locator('[data-testid="app-list"]')).toBeVisible({ timeout: 5_000 })
}

/** Navigate to admin, switch to Apps tab, wait for app list to contain at least one item. */
async function setupAdminAppsTab(page: Page) {
  await goToAdmin(page)
  await switchToAppsTab(page)
  await expect(page.locator('[data-testid="app-list-item"]').first()).toBeVisible({ timeout: 8_000 })
}

/** Click the first app in the list and wait for editor to load. */
async function openFirstApp(page: Page) {
  await page.locator('[data-testid="app-list-item"]').first().click()
  await expect(page.locator('[data-testid="app-editor"]')).toBeVisible({ timeout: 8_000 })
}

// ------- 1. Navigate to Admin page -------

test('1. Admin page loads', async ({ page }) => {
  await goToAdmin(page)
  await expect(page.locator('[data-testid="admin-header"] h1')).toHaveText('Admin')
})

// ------- 2. Switch to Apps tab -------

test('2. Apps tab loads app list', async ({ page, request }) => {
  // Seed an app so the list is non-empty
  await seedApp(request)
  await goToAdmin(page)
  await switchToAppsTab(page)

  await expect(page.locator('[data-testid="app-list"] h2')).toContainText('Apps')
})

// ------- 3a. Create form UI -------

test('3a. Create form opens with title input and slug preview', async ({ page, request }) => {
  await seedApp(request)
  await goToAdmin(page)
  await switchToAppsTab(page)

  // Click "Create App" button
  const createBtn = page.locator('[data-testid="btn-create-app"]')
  await expect(createBtn).toBeVisible()
  await createBtn.click()

  // Button toggles to "Cancel"
  await expect(createBtn).toHaveText('Cancel')

  // Form appears
  const form = page.locator('[data-testid="app-create-form"]')
  await expect(form).toBeVisible()

  // Title input is present
  const titleInput = form.locator('[data-testid="app-form-input"]')
  await expect(titleInput).toBeVisible()

  // Type a title — slug preview appears
  await titleInput.fill('Test Live App')
  const slugPreview = form.locator('[data-testid="app-form-slug-preview"]')
  await expect(slugPreview).toBeVisible()
  await expect(slugPreview).toHaveText('test-live-app')

  // Submit button enabled
  const submitBtn = form.locator('[data-testid="btn-create-app-submit"]')
  await expect(submitBtn).toBeEnabled()

  // Cancel closes form
  await createBtn.click()
  await expect(form).not.toBeVisible()
})

// ------- 3b. Full create flow -------

test('3b. Create new app end-to-end — opens editor after create', async ({ page }) => {
  await goToAdmin(page)
  await switchToAppsTab(page)

  await page.locator('[data-testid="btn-create-app"]').click()
  const form = page.locator('[data-testid="app-create-form"]')
  await expect(form).toBeVisible()

  const uniqueTitle = `E2E Test ${Date.now()}`
  await form.locator('[data-testid="app-form-input"]').fill(uniqueTitle)
  await form.locator('[data-testid="btn-create-app-submit"]').click()

  // Editor opens
  await expect(page.locator('[data-testid="app-editor"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-testid="admin-app-name"]')).toContainText('E2E Test', { timeout: 5_000 })
})

// ------- Tests 4-8: require a seeded app -------

test.describe('Admin app editor', () => {
  let seededApp: SeedApp

  test.beforeEach(async ({ page, request }) => {
    seededApp = await seedApp(request)
    await setupAdminAppsTab(page)
    await openFirstApp(page)
  })

  // ------- 4. Menu appears with expected items -------

  test('4. Menu opens with expected items', async ({ page }) => {
    await expect(page.locator('[data-testid="admin-menu-trigger"]')).toBeVisible({ timeout: 5_000 })
    await page.locator('[data-testid="admin-menu-trigger"]').click()

    const dropdown = page.locator('[data-testid="admin-menu-dropdown"]')
    await expect(dropdown).toBeVisible()

    // Check menu items
    await expect(dropdown.locator('[data-testid="admin-menu-item"]', { hasText: 'Publish' })).toBeVisible()
    await expect(dropdown.locator('[data-testid="admin-menu-item"]', { hasText: 'Discard' })).toBeVisible()
    await expect(dropdown.locator('[data-testid="admin-menu-item"]', { hasText: 'Environment' })).toBeVisible()
    await expect(dropdown.locator('[data-testid="admin-menu-item"]', { hasText: 'History' })).toBeVisible()
    await expect(dropdown.locator('[data-testid="admin-menu-item"]', { hasText: 'Rename' })).toBeVisible()
    await expect(dropdown.locator('[data-testid="admin-menu-item"]', { hasText: 'Edit with AI' })).toBeVisible()
    // Archive or Activate
    await expect(dropdown.locator('[data-testid="admin-menu-item--danger"]')).toBeVisible()

    // Publish and Discard should be disabled (no edits)
    const publishItem = dropdown.locator('[data-testid="admin-menu-item"]', { hasText: 'Publish' })
    await expect(publishItem).toBeDisabled()
    const discardItem = dropdown.locator('[data-testid="admin-menu-item"]', { hasText: 'Discard' })
    await expect(discardItem).toBeDisabled()
  })

  // ------- 5. Environment panel toggle -------

  test('5. Environment panel opens from menu', async ({ page }) => {
    await page.locator('[data-testid="admin-menu-trigger"]').click()
    await page.locator('[data-testid="admin-menu-item"]', { hasText: 'Environment' }).click()

    // Menu closes
    await expect(page.locator('[data-testid="admin-menu-dropdown"]')).not.toBeVisible()

    // Environment reference panel appears
    await expect(page.locator('[data-testid="app-editor-env-reference"]')).toBeVisible({ timeout: 10_000 })
  })

  // ------- 6. History panel toggle -------

  test('6. History panel opens from menu', async ({ page }) => {
    await page.locator('[data-testid="admin-menu-trigger"]').click()
    await page.locator('[data-testid="admin-menu-item"]', { hasText: 'History' }).click()

    // Menu closes
    await expect(page.locator('[data-testid="admin-menu-dropdown"]')).not.toBeVisible()

    // Version history panel appears
    await expect(page.locator('[data-testid="app-editor-version-history"]')).toBeVisible({ timeout: 8_000 })
    // Prompt editor hidden when history is open
    await expect(page.locator('[data-testid="app-editor-prompt"]')).not.toBeVisible()
  })

  // ------- 7. Rename inline input -------

  test('7. Rename shows inline input with current name, accepts new name', async ({ page }) => {
    // Grab current app name
    const appNameEl = page.locator('[data-testid="admin-app-name"]')
    await expect(appNameEl).toBeVisible({ timeout: 5_000 })
    const originalName = (await appNameEl.textContent()) ?? ''

    // Open menu -> click Rename
    await page.locator('[data-testid="admin-menu-trigger"]').click()
    await page.locator('[data-testid="admin-menu-item"]', { hasText: 'Rename' }).click()

    // Inline rename input appears, pre-filled with current name
    const renameInput = page.locator('[data-testid="admin-rename-input"]')
    await expect(renameInput).toBeVisible({ timeout: 3_000 })
    await expect(renameInput).toHaveValue(originalName.trim())

    // Type a new name and press Enter
    const newName = `${originalName.trim()} Renamed`
    await renameInput.fill(newName)
    await renameInput.press('Enter')

    // Input disappears, new title shown
    await expect(renameInput).not.toBeVisible({ timeout: 5_000 })
    await expect(page.locator('[data-testid="admin-app-name"]')).toContainText('Renamed', { timeout: 8_000 })
  })

  // ------- 8. Menu closes on outside click -------

  test('8. Menu closes when clicking outside', async ({ page }) => {
    await page.locator('[data-testid="admin-menu-trigger"]').click()
    await expect(page.locator('[data-testid="admin-menu-dropdown"]')).toBeVisible()

    // Click outside the menu using raw mouse click at the bottom of viewport
    const viewportSize = page.viewportSize()
    const x = (viewportSize?.width ?? 1280) / 2
    const y = (viewportSize?.height ?? 720) - 50
    await page.mouse.click(x, y)

    // Menu should close
    await expect(page.locator('[data-testid="admin-menu-dropdown"]')).not.toBeVisible({ timeout: 3_000 })
  })
})
