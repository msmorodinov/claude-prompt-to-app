import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import AppEditor from '../components/admin/AppEditor'

// Mock api-admin
vi.mock('../api-admin', () => ({
  fetchAdminApp: vi.fn().mockResolvedValue({
    id: 1,
    slug: 'test-app',
    title: 'Test App',
    subtitle: '',
    type: 'app',
    is_active: 1,
    current_version_id: 1,
    current_version: { id: 1, body: 'prompt body', change_note: '', created_at: '2026-01-01' },
  }),
  updateAdminApp: vi.fn().mockResolvedValue({ id: 1, slug: 'test-app', current_version_id: 2 }),
  fetchEnvironment: vi.fn().mockResolvedValue({ tools: [], widgets: [] }),
  fetchMcpServers: vi.fn().mockResolvedValue([]),
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

  it('shows Publish/Discard buttons and change note bar when dirty', async () => {
    render(<AppEditor appId={1} onReloadApp={onReloadApp} />)
    // Wait for load
    const primaryBtn = await screen.findByTestId('toolbar-primary-btn')
    expect(primaryBtn).toHaveTextContent(/edit with ai/i)

    // Find the textarea rendered by PromptHighlighter and type to make dirty
    const textarea = screen.getByPlaceholderText(/write your app/i)
    fireEvent.change(textarea, { target: { value: 'prompt body extra text' } })

    // Now should show Publish as primary
    await waitFor(() => {
      expect(screen.getByTestId('toolbar-primary-btn')).toHaveTextContent('Publish')
    })
    expect(screen.getByTestId('toolbar-discard-btn')).toBeVisible()
    expect(screen.getByTestId('change-note-bar')).toBeVisible()
    expect(screen.getByTestId('status-unsaved')).toBeVisible()
  })
})
