import { useEffect, useRef, useState } from 'react'
import {
  fetchAdminApps,
  createAdminApp,
  errorMessage,
  type AdminApp,
} from '../../api-admin'

interface Props {
  selectedId: number | null
  onSelect: (id: number) => void
}

const POLL_INTERVAL = 10_000

function titleToSlug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export default function AppList({ selectedId, onSelect }: Props) {
  const [apps, setApps] = useState<AdminApp[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [title, setTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null)

  const load = () =>
    fetchAdminApps().then(setApps).catch(console.error)

  useEffect(() => {
    load()
    intervalRef.current = setInterval(load, POLL_INTERVAL)
    return () => {
      if (intervalRef.current !== null) clearInterval(intervalRef.current)
    }
  }, [])

  const sorted = apps.toSorted((a, b) => Number(b.is_active) - Number(a.is_active))

  const handleCreate = async () => {
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Title is required.')
      return
    }
    const slug = titleToSlug(trimmed)
    if (slug.length < 2) {
      setError('Title must produce a valid slug (2+ alphanumeric chars).')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const result = await createAdminApp({ slug, title: trimmed })
      await load()
      setShowCreate(false)
      setTitle('')
      onSelect(result.id)
    } catch (err) {
      setError(errorMessage(err, 'Failed to create app.'))
    } finally {
      setCreating(false)
    }
  }

  const handleToggleCreate = () => {
    setShowCreate((prev) => !prev)
    setTitle('')
    setError(null)
  }

  return (
    <div className="app-list">
      <div className="app-list-header">
        <h2>Apps ({apps.length})</h2>
        <button
          className="btn-create-app"
          onClick={handleToggleCreate}
        >
          {showCreate ? 'Cancel' : 'Create App'}
        </button>
      </div>

      {showCreate && (
        <div className="app-create-form">
          <input
            className="app-form-input"
            type="text"
            placeholder="App title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !creating) void handleCreate()
            }}
            autoFocus
          />
          {title.trim() && (
            <span className="app-form-slug-preview">
              {titleToSlug(title.trim())}
            </span>
          )}
          {error && <div className="app-form-error">{error}</div>}
          <button
            className="btn-create-app-submit"
            onClick={handleCreate}
            disabled={creating}
          >
            {creating ? 'Creating...' : 'Create'}
          </button>
        </div>
      )}

      <div className="app-items">
        {sorted.map((app) => (
          <div
            key={app.id}
            className={`app-list-item${selectedId === app.id ? ' selected' : ''}`}
            onClick={() => onSelect(app.id)}
          >
            <div className="app-item-header">
              <span className="app-item-title">{app.title}</span>
              <span
                className={`status-badge ${app.is_active ? 'done' : 'idle'}`}
              >
                {app.is_active ? 'active' : 'archived'}
              </span>
            </div>
            <div className="app-item-meta">
              <span className="app-item-slug">{app.slug}</span>
              <span className="app-item-versions">
                {app.version_count} version{app.version_count !== 1 ? 's' : ''}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
