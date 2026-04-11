import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import AppEditor from '../components/admin/AppEditor'

// Mock api-admin
vi.mock('../api-admin', () => ({
  fetchAdminApp: vi.fn().mockResolvedValue({
    id: 1,
    slug: 'test-app',
    title: 'Test App',
    subtitle: '',
    is_active: 1,
    current_version_id: 1,
    current_version: { id: 1, body: 'prompt body', change_note: '', created_at: '2026-01-01' },
  }),
  updateAdminApp: vi.fn().mockResolvedValue({ id: 1, slug: 'test-app', current_version_id: 2 }),
  fetchEnvironment: vi.fn().mockResolvedValue({ tools: [], widgets: [] }),
  validatePrompt: vi.fn(),
  errorMessage: vi.fn((_e: unknown, fallback: string) => fallback),
}))

vi.mock('../api', () => ({
  request: vi.fn(),
}))

describe('AppEditor toolbar', () => {
  const onReloadApp = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows "Edit with AI" button when clean', async () => {
    render(<AppEditor appId={1} onReloadApp={onReloadApp} />)
    const btn = await screen.findByTestId('toolbar-primary-btn')
    expect(btn).toHaveTextContent(/edit with ai/i)
  })

  it('does NOT show Publish in menu dropdown', async () => {
    render(<AppEditor appId={1} onReloadApp={onReloadApp} />)
    await screen.findByTestId('toolbar-primary-btn')
    // Open menu
    fireEvent.click(screen.getByTestId('admin-menu-trigger'))
    const dropdown = screen.getByTestId('admin-menu-dropdown')
    expect(dropdown).not.toHaveTextContent('Publish')
    expect(dropdown).not.toHaveTextContent('Discard')
  })
})
