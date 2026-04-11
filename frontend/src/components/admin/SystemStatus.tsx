import { useState, useEffect, useCallback } from 'react'
import { fetchSystemStatus } from '../../api-admin'
import type { SystemStatus as SystemStatusType } from '../../api-admin'

function formatUptime(seconds: number): string {
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  return `${m}m`
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'connected' ? 'var(--success, #4ade80)' :
    status === 'needs_auth' ? 'var(--warning, #facc15)' :
    'var(--error, #e85454)'
  return <span className="system-dot" style={{ background: color }} />
}

export function getHeaderDotColor(data: SystemStatusType | null): string {
  if (!data) return 'var(--text-muted, #666)'
  if (!data.cli.available || data.auth.last_test?.ok === false) {
    return 'var(--error, #e85454)'
  }
  if (
    !data.auth.last_test ||
    data.mcp_servers.some(s => s.status === 'needs_auth')
  ) {
    return 'var(--warning, #facc15)'
  }
  return 'var(--success, #4ade80)'
}

export default function SystemStatus() {
  const [data, setData] = useState<SystemStatusType | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try {
      const status = await fetchSystemStatus()
      setData(status)
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load status')
    }
  }, [])

  useEffect(() => {
    load()
    const interval = setInterval(load, 30_000)
    return () => clearInterval(interval)
  }, [load])

  if (error) return <div className="system-status-error">Error: {error}</div>
  if (!data) return <div className="system-status-loading">Loading...</div>

  return (
    <div className="system-status">
      <div className="system-card">
        <h3 className="system-card-title">Authentication</h3>
        <div className="system-card-row">
          <span className="system-label">Mode</span>
          <span className="system-value">
            {data.auth.mode === 'max_oauth' ? 'Max Subscription' : 'API Key'}
          </span>
        </div>
        <div className="system-card-row">
          <span className="system-label">Credentials</span>
          <span className="system-value">
            {data.auth.has_credentials ? 'Configured' : 'Not set'}
            {data.auth.credentials_note && (
              <span className="system-note"> ({data.auth.credentials_note})</span>
            )}
          </span>
        </div>
        <div className="system-card-row">
          <span className="system-label">Last test</span>
          <span className="system-value">
            {data.auth.last_test
              ? `${data.auth.last_test.ok ? '✓' : '✗'} ${data.auth.last_test.detail}`
              : 'Never tested'}
          </span>
        </div>
      </div>

      <div className="system-card">
        <h3 className="system-card-title">Claude CLI</h3>
        <div className="system-card-row">
          <span className="system-label">Version</span>
          <span className="system-value system-mono">{data.cli.version ?? 'Unknown'}</span>
        </div>
        <div className="system-card-row">
          <span className="system-label">Status</span>
          <span className="system-value">
            <StatusDot status={data.cli.available ? 'connected' : 'error'} />
            {data.cli.available ? 'Available' : 'Not found'}
          </span>
        </div>
      </div>

      <div className="system-card">
        <h3 className="system-card-title">Sessions</h3>
        <div className="system-card-row">
          <span className="system-label">Active</span>
          <span className="system-value">{data.sessions.active}</span>
        </div>
        <div className="system-card-row">
          <span className="system-label">Waiting input</span>
          <span className="system-value">{data.sessions.waiting_input}</span>
        </div>
        <div className="system-card-row">
          <span className="system-label">Total</span>
          <span className="system-value">{data.sessions.total}</span>
        </div>
        {data.sessions.last_activity && (
          <div className="system-card-row">
            <span className="system-label">Last activity</span>
            <span className="system-value system-mono">
              {new Date(data.sessions.last_activity).toLocaleString()}
            </span>
          </div>
        )}
      </div>

      <div className="system-card">
        <h3 className="system-card-title">MCP Servers</h3>
        {data.mcp_servers.length === 0 ? (
          <div className="system-card-row">
            <span className="system-note">No MCP servers configured</span>
          </div>
        ) : (
          data.mcp_servers.map(s => (
            <div className="system-card-row" key={s.name}>
              <span className="system-value">
                <StatusDot status={s.status} />
                {s.name}
              </span>
              <span className="system-note">{s.status}</span>
            </div>
          ))
        )}
      </div>

      <div className="system-card">
        <h3 className="system-card-title">Server</h3>
        <div className="system-card-row">
          <span className="system-label">Uptime</span>
          <span className="system-value">{formatUptime(data.server.uptime_seconds)}</span>
        </div>
        <div className="system-card-row">
          <span className="system-label">Started</span>
          <span className="system-value system-mono">
            {new Date(data.server.started_at).toLocaleString()}
          </span>
        </div>
      </div>
    </div>
  )
}
