import { useEffect, useState } from 'react'
import { listSessions, type SessionSummary } from '../api'

interface Props {
  currentSessionId: string | null
  onSelectSession: (id: string) => void
  onNewSession: () => void
  isOpen: boolean
  onClose: () => void
  onToggle: () => void
}

const POLL_INTERVAL = 10_000

export default function SessionSidebar({
  currentSessionId,
  onSelectSession,
  onNewSession,
  isOpen,
  onClose,
  onToggle,
}: Props) {
  const [sessions, setSessions] = useState<SessionSummary[]>([])

  useEffect(() => {
    const load = () =>
      listSessions()
        .then((s) => setSessions(s.filter((x) => x.message_count > 0)))
        .catch(console.error)
    load()
    const interval = setInterval(load, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  const formatDate = (iso: string) => {
    const d = new Date(iso)
    const now = new Date()
    const diffMs = now.getTime() - d.getTime()
    const diffMins = Math.floor(diffMs / 60_000)
    if (diffMins < 1) return 'just now'
    if (diffMins < 60) return `${diffMins}m ago`
    const diffHours = Math.floor(diffMins / 60)
    if (diffHours < 24) return `${diffHours}h ago`
    return d.toLocaleDateString()
  }

  return (
    <>
      {/* Overlay only for mobile */}
      {isOpen && <div className="sidebar-overlay" data-testid="sidebar-overlay" onClick={onClose} />}
      <aside className={`session-sidebar ${isOpen ? 'open' : ''}`} data-testid="session-sidebar">
        <div data-testid="sidebar-header" className="sidebar-header">
          <h2>Sessions</h2>
          {/* Desktop: collapse button; Mobile: close button */}
          <button className="sidebar-collapse" onClick={onToggle} title="Collapse sidebar" aria-label="Collapse sidebar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="10,3 5,8 10,13" />
            </svg>
          </button>
          <button className="sidebar-close" data-testid="sidebar-close" onClick={onClose}>
            &times;
          </button>
        </div>
        <div className="sidebar-collapsed-icons">
          <button onClick={onToggle} title="Expand sidebar" aria-label="Expand sidebar">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <polyline points="6,3 11,8 6,13" />
            </svg>
          </button>
          <button onClick={onNewSession} title="New session" aria-label="New session">
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="8" y1="3" x2="8" y2="13" />
              <line x1="3" y1="8" x2="13" y2="8" />
            </svg>
          </button>
        </div>
        <button className="sidebar-new-btn" data-testid="sidebar-new-btn" onClick={onNewSession}>
          + New Session
        </button>
        <div className="sidebar-sessions">
          {sessions.map((s) => (
            <div
              key={s.id}
              className={`sidebar-session-item ${currentSessionId === s.id ? 'active' : ''}`}
              data-testid="sidebar-session-item"
              onClick={() => {
                onSelectSession(s.id)
              }}
            >
              <div className="sidebar-session-title" data-testid="sidebar-session-title">
                {s.title || 'Untitled session'}
              </div>
              <div className="sidebar-session-meta" data-testid="sidebar-session-meta">
                <span>{s.message_count} msgs</span>
                <span>{formatDate(s.created_at)}</span>
              </div>
              {s.app_name && (
                <span className="sidebar-session-app">{s.app_name}</span>
              )}
            </div>
          ))}
          {sessions.length === 0 && (
            <div className="sidebar-empty" data-testid="sidebar-empty">No sessions yet</div>
          )}
        </div>
      </aside>
    </>
  )
}
