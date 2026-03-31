import { useEffect, useRef, useState } from 'react'
import {
  fetchAdminApps,
  createAdminApp,
  type AdminApp,
} from '../../api-admin'

interface Props {
  selectedId: number | null
  onSelect: (id: number) => void
}

interface CreateForm {
  slug: string
  title: string
  body: string
}

const EMPTY_FORM: CreateForm = { slug: '', title: '', body: '' }
const POLL_INTERVAL = 10_000

export default function AppList({ selectedId, onSelect }: Props) {
  const [apps, setApps] = useState<AdminApp[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [form, setForm] = useState<CreateForm>(EMPTY_FORM)
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

  const sorted = [
    ...apps.filter((a) => a.is_active),
    ...apps.filter((a) => !a.is_active),
  ]

  const handleCreate = async () => {
    if (!form.slug.trim() || !form.title.trim() || !form.body.trim()) {
      setError('All fields are required.')
      return
    }
    setCreating(true)
    setError(null)
    try {
      const result = await createAdminApp({
        slug: form.slug.trim(),
        title: form.title.trim(),
        body: form.body.trim(),
      })
      await load()
      setShowCreate(false)
      setForm(EMPTY_FORM)
      onSelect(result.id)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create app.')
    } finally {
      setCreating(false)
    }
  }

  const handleToggleCreate = () => {
    setShowCreate((prev) => !prev)
    setForm(EMPTY_FORM)
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
            placeholder="my-app-slug"
            value={form.slug}
            onChange={(e) => setForm({ ...form, slug: e.target.value })}
          />
          <input
            className="app-form-input"
            type="text"
            placeholder="Title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <textarea
            className="app-form-textarea"
            rows={6}
            placeholder="Prompt body..."
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
          />
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
