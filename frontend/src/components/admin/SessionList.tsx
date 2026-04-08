import { useEffect, useState, useMemo, useRef, useCallback } from 'react'
import { fetchAdminSessions, type AdminSession } from '../../api-admin'
import { relativeTime } from '../../relativeTime'

interface Props {
  selectedId: string | null
  onSelect: (id: string) => void
}

const POLL_INTERVAL = 5000
const DEBOUNCE_MS = 150

type StatusFilter = string | null

export default function SessionList({ selectedId, onSelect }: Props) {
  const [sessions, setSessions] = useState<AdminSession[]>([])
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(null)
  const [searchText, setSearchText] = useState('')
  const [debouncedSearch, setDebouncedSearch] = useState('')
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    const load = () =>
      fetchAdminSessions().then(setSessions).catch(console.error)
    load()
    const interval = setInterval(load, POLL_INTERVAL)
    return () => clearInterval(interval)
  }, [])

  const handleSearchChange = useCallback((value: string) => {
    setSearchText(value)
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => setDebouncedSearch(value), DEBOUNCE_MS)
  }, [])

  useEffect(() => {
    return () => clearTimeout(debounceRef.current)
  }, [])

  const statusCounts = useMemo(() => {
    const counts: Record<string, number> = {}
    for (const s of sessions) {
      counts[s.status] = (counts[s.status] ?? 0) + 1
    }
    return counts
  }, [sessions])

  const filtered = useMemo(() => {
    let result = sessions
    if (statusFilter) {
      result = result.filter((s) => s.status === statusFilter)
    }
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      result = result.filter(
        (s) =>
          (s.user_display_name?.toLowerCase().includes(q)) ||
          (s.title?.toLowerCase().includes(q)) ||
          s.user_id.toLowerCase().includes(q)
      )
    }
    return result
  }, [sessions, statusFilter, debouncedSearch])

  const statuses = Object.keys(statusCounts).sort()

  return (
    <div className="session-list" data-testid="session-list">
      <h2>Sessions ({sessions.length})</h2>

      {/* Search */}
      <input
        type="text"
        className="session-search"
        placeholder="Search by name, title, user ID..."
        value={searchText}
        onChange={(e) => handleSearchChange(e.target.value)}
      />

      {/* Filter pills */}
      <div className="filter-pills">
        <button
          className={`filter-pill ${statusFilter === null ? 'active' : ''}`}
          onClick={() => setStatusFilter(null)}
        >
          All {sessions.length}
        </button>
        {statuses.map((status) => (
          <button
            key={status}
            className={`filter-pill ${statusFilter === status ? 'active' : ''}`}
            onClick={() => setStatusFilter(statusFilter === status ? null : status)}
          >
            {status} {statusCounts[status]}
          </button>
        ))}
      </div>

      <div className="session-items">
        {filtered.map((s) => (
          <div
            key={s.id}
            className={`session-item ${selectedId === s.id ? 'selected' : ''} status-${s.status}`}
            data-testid="session-item"
            onClick={() => onSelect(s.id)}
          >
            <div className="session-item-header">
              <span className="session-user" title={s.user_id}>
                {s.user_display_name || s.user_id}
              </span>
              <span className={`status-badge ${s.status}`} data-testid="status-badge">{s.status}</span>
            </div>
            {s.title && (
              <div className="session-title">{s.title}</div>
            )}
            {s.app_name && (
              <span className="session-app-name">{s.app_name}</span>
            )}
            <div className="session-item-meta">
              <span>{s.message_count} msgs</span>
              <span title={new Date(s.created_at).toLocaleString()}>
                {relativeTime(s.created_at)}
              </span>
            </div>
          </div>
        ))}
        {filtered.length === 0 && sessions.length > 0 && (
          <div className="session-empty-filter">No matching sessions</div>
        )}
      </div>
    </div>
  )
}
