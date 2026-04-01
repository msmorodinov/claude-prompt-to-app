import { useEffect, useState } from 'react'
import { fetchAdminSessions, type AdminSession } from '../../api-admin'

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
}

const POLL_INTERVAL = 5000

export default function SessionList({ selectedId, onSelect }: Props) {
  const [sessions, setSessions] = useState<AdminSession[]>([])

  useEffect(() => {
    const load = () =>
      fetchAdminSessions().then(setSessions).catch(console.error)
    load()
    const interval = setInterval(load, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  return (
    <div className="session-list">
      <h2>Sessions ({sessions.length})</h2>
      <div className="session-items">
        {sessions.map((s) => (
          <div
            key={s.id}
            className={`session-item ${selectedId === s.id ? 'selected' : ''} status-${s.status}`}
            onClick={() => onSelect(s.id)}
          >
            <div className="session-item-header">
              <span className="session-user" title={s.user_id}>
                {s.user_display_name || s.user_id}
              </span>
              <span className={`status-badge ${s.status}`}>{s.status}</span>
            </div>
            {s.app_name && (
              <span className="session-app-name">{s.app_name}</span>
            )}
            <div className="session-item-meta">
              <span>{s.message_count} msgs</span>
              <span>{new Date(s.created_at).toLocaleString()}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
