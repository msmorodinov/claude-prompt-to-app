import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import SessionSidebar from '../components/SessionSidebar'
import type { SessionSummary } from '../api'

// Mock the api module
vi.mock('../api', () => ({
  listSessions: vi.fn(),
}))

import { listSessions } from '../api'
const mockListSessions = vi.mocked(listSessions)

const defaultProps = {
  currentSessionId: null,
  onSelectSession: vi.fn(),
  onNewSession: vi.fn(),
  onDeleteSession: vi.fn(),
  isOpen: true,
  onClose: vi.fn(),
  onToggle: vi.fn(),
}

function makeSessions(overrides: Partial<SessionSummary>[] = []): SessionSummary[] {
  return overrides.map((o, i) => ({
    id: `sess-${i}`,
    created_at: new Date().toISOString(),
    title: `Session ${i}`,
    status: 'done',
    message_count: 2,
    app_id: null,
    app_name: null,
    ...o,
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  // Default: return empty so sessions with 0 messages are filtered
  mockListSessions.mockResolvedValue([])
})

describe('SessionSidebar', () => {
  it('renders "No sessions yet" when session list is empty', async () => {
    mockListSessions.mockResolvedValue([])
    render(<SessionSidebar {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('No sessions yet')).toBeInTheDocument())
  })

  it('renders "No sessions yet" when all sessions have 0 messages', async () => {
    mockListSessions.mockResolvedValue(makeSessions([{ message_count: 0 }]))
    render(<SessionSidebar {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('No sessions yet')).toBeInTheDocument())
  })

  it('renders session titles when sessions have messages', async () => {
    mockListSessions.mockResolvedValue(
      makeSessions([{ title: 'Workshop Alpha', message_count: 5 }]),
    )
    render(<SessionSidebar {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('Workshop Alpha')).toBeInTheDocument())
  })

  it('renders "Untitled session" when title is null', async () => {
    mockListSessions.mockResolvedValue(
      makeSessions([{ title: null as unknown as string, message_count: 3 }]),
    )
    render(<SessionSidebar {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('Untitled session')).toBeInTheDocument())
  })

  it('calls onSelectSession with the session id when clicked', async () => {
    const onSelect = vi.fn()
    mockListSessions.mockResolvedValue(
      makeSessions([{ id: 'sess-abc', title: 'Click Me', message_count: 2 }]),
    )
    render(<SessionSidebar {...defaultProps} onSelectSession={onSelect} />)
    await waitFor(() => screen.getByText('Click Me'))
    fireEvent.click(screen.getByText('Click Me'))
    expect(onSelect).toHaveBeenCalledWith('sess-abc')
  })

  it('does not call onClose when a session is clicked', async () => {
    const onClose = vi.fn()
    mockListSessions.mockResolvedValue(
      makeSessions([{ title: 'Session X', message_count: 4 }]),
    )
    render(<SessionSidebar {...defaultProps} onClose={onClose} />)
    await waitFor(() => screen.getByText('Session X'))
    fireEvent.click(screen.getByText('Session X'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('calls onNewSession when "+ New Session" button is clicked', async () => {
    const onNewSession = vi.fn()
    mockListSessions.mockResolvedValue([])
    render(<SessionSidebar {...defaultProps} onNewSession={onNewSession} />)
    fireEvent.click(screen.getByText('+ New Session'))
    expect(onNewSession).toHaveBeenCalled()
  })

  it('calls onClose when close button (×) is clicked', async () => {
    const onClose = vi.fn()
    mockListSessions.mockResolvedValue([])
    render(<SessionSidebar {...defaultProps} onClose={onClose} />)
    const closeBtn = screen.getByRole('button', { name: '×' })
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalled()
  })

  it('marks current session as active', async () => {
    mockListSessions.mockResolvedValue(
      makeSessions([{ id: 'active-sess', title: 'Active', message_count: 2 }]),
    )
    render(<SessionSidebar {...defaultProps} currentSessionId="active-sess" />)
    await waitFor(() => screen.getByText('Active'))
    const item = screen.getByText('Active').closest('.sidebar-session-item')
    expect(item).toHaveClass('active')
  })

  it('does not mark non-current session as active', async () => {
    mockListSessions.mockResolvedValue(
      makeSessions([{ id: 'other-sess', title: 'Other', message_count: 2 }]),
    )
    render(<SessionSidebar {...defaultProps} currentSessionId="different-sess" />)
    await waitFor(() => screen.getByText('Other'))
    const item = screen.getByText('Other').closest('.sidebar-session-item')
    expect(item).not.toHaveClass('active')
  })

  it('renders sidebar overlay when isOpen is true', async () => {
    mockListSessions.mockResolvedValue([])
    const { container } = render(<SessionSidebar {...defaultProps} isOpen={true} />)
    expect(container.querySelector('.sidebar-overlay')).toBeInTheDocument()
  })

  it('does not render sidebar overlay when isOpen is false', async () => {
    mockListSessions.mockResolvedValue([])
    const { container } = render(<SessionSidebar {...defaultProps} isOpen={false} />)
    expect(container.querySelector('.sidebar-overlay')).not.toBeInTheDocument()
  })

  it('calls onClose when overlay is clicked', async () => {
    const onClose = vi.fn()
    mockListSessions.mockResolvedValue([])
    const { container } = render(
      <SessionSidebar {...defaultProps} isOpen={true} onClose={onClose} />,
    )
    const overlay = container.querySelector('.sidebar-overlay')!
    fireEvent.click(overlay)
    expect(onClose).toHaveBeenCalled()
  })

  it('shows message count', async () => {
    mockListSessions.mockResolvedValue(
      makeSessions([{ title: 'Test', message_count: 7 }]),
    )
    render(<SessionSidebar {...defaultProps} />)
    await waitFor(() => screen.getByText('7 msgs'))
  })

  it('shows app name badge when session has app_name', async () => {
    mockListSessions.mockResolvedValue(
      makeSessions([{ title: 'My Session', message_count: 2, app_name: 'My App', app_id: 1 }]),
    )
    render(<SessionSidebar {...defaultProps} />)
    await waitFor(() => expect(screen.getByText('My App')).toBeInTheDocument())
  })

  it('does not show app name badge when app_name is null', async () => {
    mockListSessions.mockResolvedValue(
      makeSessions([{ title: 'No App Session', message_count: 2, app_name: null, app_id: null }]),
    )
    render(<SessionSidebar {...defaultProps} />)
    await waitFor(() => screen.getByText('No App Session'))
    expect(document.querySelector('.sidebar-session-app')).not.toBeInTheDocument()
  })

  describe('formatDate()', () => {
    it('shows "just now" for timestamps < 1 minute ago', async () => {
      const now = new Date().toISOString()
      mockListSessions.mockResolvedValue(
        makeSessions([{ created_at: now, message_count: 1 }]),
      )
      render(<SessionSidebar {...defaultProps} />)
      await waitFor(() => screen.getByText('just now'))
    })

    it('shows minutes ago for timestamps < 1 hour ago', async () => {
      const d = new Date(Date.now() - 5 * 60 * 1000).toISOString()
      mockListSessions.mockResolvedValue(
        makeSessions([{ created_at: d, message_count: 1 }]),
      )
      render(<SessionSidebar {...defaultProps} />)
      await waitFor(() => screen.getByText('5m ago'))
    })

    it('shows hours ago for timestamps < 24 hours ago', async () => {
      const d = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()
      mockListSessions.mockResolvedValue(
        makeSessions([{ created_at: d, message_count: 1 }]),
      )
      render(<SessionSidebar {...defaultProps} />)
      await waitFor(() => screen.getByText('3h ago'))
    })

    it('shows locale date string for timestamps > 24 hours ago', async () => {
      const d = new Date(Date.now() - 48 * 60 * 60 * 1000)
      mockListSessions.mockResolvedValue(
        makeSessions([{ created_at: d.toISOString(), message_count: 1 }]),
      )
      render(<SessionSidebar {...defaultProps} />)
      // We just verify a date-like string is rendered (locale-specific)
      await waitFor(() => {
        const meta = document.querySelectorAll('.sidebar-session-meta span')
        const texts = Array.from(meta).map((el) => el.textContent)
        expect(texts.some((t) => t && t.match(/\d/))).toBe(true)
      })
    })
  })
})
