import { useEffect, useState } from 'react'
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

  function load() {
    void fetchAdminApps().then(setApps).catch(console.error)
  }

  useEffect(() => {
    load()
    const id = setInterval(load, POLL_INTERVAL)
    return () => clearInterval(id)
  }, [])

  const sorted = apps.toSorted((a, b) => Number(b.is_active) - Number(a.is_active))

  async function handleCreate() {
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
      load()
      setShowCreate(false)
      setTitle('')
      onSelect(result.id)
    } catch (err) {
      setError(errorMessage(err, 'Failed to create app.'))
    } finally {
      setCreating(false)
    }
  }

  function handleToggleCreate() {
    setShowCreate(prev => !prev)
    setTitle('')
    setError(null)
  }

  return (
    <div className="app-list" data-testid="app-list">
      <div className="app-list-header">
        <h2>Apps ({apps.length})</h2>
        <button
          className="btn-create-app"
          data-testid="btn-create-app"
          onClick={handleToggleCreate}
        >
          {showCreate ? 'Cancel' : 'Create App'}
        </button>
      </div>

      {showCreate && (
        <div className="app-create-form" data-testid="app-create-form">
          <input
            className="app-form-input"
            data-testid="app-form-input"
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
            <span className="app-form-slug-preview" data-testid="app-form-slug-preview">
              {titleToSlug(title.trim())}
            </span>
          )}
          {error && <div className="app-form-error" data-testid="app-form-error">{error}</div>}
          <button
            className="btn-create-app-submit"
            data-testid="btn-create-app-submit"
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
            data-testid="app-list-item"
            onClick={() => onSelect(app.id)}
          >
            <div className="app-item-header">
              <span className="app-item-title">{app.title}</span>
              <span
                className={`status-badge ${app.is_active ? 'status-badge--active' : 'status-badge--archived'}`}
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
