import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import SystemStatus from '../components/admin/SystemStatus'

const mockStatus = {
  auth: {
    mode: 'max_oauth' as const,
    has_credentials: true,
    credentials_note: 'Managed by CLI',
    last_test: null,
  },
  cli: { version: '1.0.42', available: true },
  server: { uptime_seconds: 3600, started_at: '2026-04-11T12:00:00Z' },
  sessions: { active: 2, waiting_input: 1, total: 15, last_activity: '2026-04-11T14:55:00Z' },
  mcp_servers: [
    { name: 'Deepwiki', command: 'https://mcp.deepwiki.com/mcp', status: 'connected' as const },
    { name: 'Context7', command: 'npx ...', status: 'needs_auth' as const },
  ],
}

vi.mock('../api-admin', () => ({
  fetchSystemStatus: vi.fn(() => Promise.resolve(mockStatus)),
  setAuthMode: vi.fn(() => Promise.resolve({ ok: true, mode: 'api_key', warning: null })),
  testAuth: vi.fn(() => Promise.resolve({ ok: true, at: '2026-04-11T15:00:00Z', detail: 'CLI accessible' })),
  deleteApiKey: vi.fn(() => Promise.resolve({ ok: true, mode: 'max_oauth' })),
}))

describe('SystemStatus', () => {
  beforeEach(() => { vi.clearAllMocks() })

  it('renders all status cards', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByText('Authentication')).toBeTruthy()
      expect(screen.getByText('Claude CLI')).toBeTruthy()
      expect(screen.getByText('Sessions')).toBeTruthy()
      expect(screen.getByText('MCP Servers')).toBeTruthy()
      expect(screen.getByText('Server')).toBeTruthy()
    })
  })

  it('shows Max Subscription label for max_oauth mode', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByText('Max Subscription')).toBeTruthy()
    })
  })

  it('shows Never tested when last_test is null', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByText('Never tested')).toBeTruthy()
    })
  })

  it('shows CLI version', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByText('1.0.42')).toBeTruthy()
    })
  })

  it('shows session counts', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByText('2')).toBeTruthy()
      expect(screen.getByText('15')).toBeTruthy()
    })
  })

  it('renders MCP server statuses', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByText('Deepwiki')).toBeTruthy()
      expect(screen.getByText('Context7')).toBeTruthy()
    })
  })
})

describe('SystemStatus auth management', () => {
  it('shows mode switcher', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByLabelText('Max Subscription')).toBeTruthy()
      expect(screen.getByLabelText('API Key')).toBeTruthy()
    })
  })

  it('has test connection button', async () => {
    render(<SystemStatus />)
    await waitFor(() => {
      expect(screen.getByText('Test CLI')).toBeTruthy()
    })
  })
})
