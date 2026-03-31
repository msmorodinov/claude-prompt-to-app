import { useState, useEffect, useCallback } from 'react'
import type { AdminAppDetail } from '../../api-admin'
import { fetchAdminApp, updateAdminApp } from '../../api-admin'
import VersionHistory from './VersionHistory'

interface Props {
  appId: number
}

export default function AppEditor({ appId }: Props) {
  const [detail, setDetail] = useState<AdminAppDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Metadata fields
  const [editTitle, setEditTitle] = useState('')
  const [editSubtitle, setEditSubtitle] = useState('')
  const [isSavingMeta, setIsSavingMeta] = useState(false)

  // Prompt body
  const [originalBody, setOriginalBody] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [changeNote, setChangeNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [successFlash, setSuccessFlash] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Version history panel
  const [showVersionHistory, setShowVersionHistory] = useState(false)

  const isDirty = editedBody !== originalBody

  const loadDetail = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await fetchAdminApp(appId)
      setDetail(data)
      setEditTitle(data.title)
      setEditSubtitle(data.subtitle ?? '')
      const body = data.current_version?.body ?? ''
      setOriginalBody(body)
      setEditedBody(body)
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Failed to load app')
    }
  }, [appId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  async function handleToggleActive() {
    if (!detail) return
    setSaveError(null)
    const newActive = detail.is_active === 0
    try {
      await updateAdminApp(appId, { is_active: newActive })
      setDetail({ ...detail, is_active: newActive ? 1 : 0 })
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to toggle active state')
    }
  }

  async function handleSaveMeta() {
    setIsSavingMeta(true)
    setSaveError(null)
    try {
      await updateAdminApp(appId, { title: editTitle, subtitle: editSubtitle })
      if (detail) {
        setDetail({ ...detail, title: editTitle, subtitle: editSubtitle })
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save metadata')
    } finally {
      setIsSavingMeta(false)
    }
  }

  async function handlePublish() {
    if (!isDirty || isSaving) return
    setIsSaving(true)
    setSaveError(null)
    try {
      await updateAdminApp(appId, { body: editedBody, change_note: changeNote })
      await loadDetail()
      setChangeNote('')
      setSuccessFlash(true)
      setTimeout(() => setSuccessFlash(false), 2500)
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to publish version')
    } finally {
      setIsSaving(false)
    }
  }

  function handleTextareaKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Tab') {
      e.preventDefault()
      const target = e.currentTarget
      const start = target.selectionStart
      const end = target.selectionEnd
      const newValue =
        editedBody.substring(0, start) + '\t' + editedBody.substring(end)
      setEditedBody(newValue)
      // restore cursor after React re-render
      requestAnimationFrame(() => {
        target.selectionStart = start + 1
        target.selectionEnd = start + 1
      })
    }
  }

  const charCount = editedBody.length.toLocaleString()
  const charMax = (50000).toLocaleString()

  if (loadError) {
    return (
      <div className="app-editor">
        <p style={{ color: 'var(--error)', padding: '1.5rem', fontFamily: 'var(--font-mono)' }}>
          Error: {loadError}
        </p>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="app-editor">
        <p style={{ color: 'var(--text-muted)', padding: '1.5rem', fontFamily: 'var(--font-mono)' }}>
          Loading...
        </p>
      </div>
    )
  }

  return (
    <div className="app-editor">
      {/* Header */}
      <div className="app-editor-header">
        <div className="app-editor-title-row">
          <h2>
            {isDirty && <span className="unsaved-dot" title="Unsaved changes" />}
            {detail.title}
          </h2>
          <span className="app-editor-slug">{detail.slug}</span>
        </div>
        <div className="app-editor-active-row">
          <span className="app-editor-active-label">
            {detail.is_active ? 'Active' : 'Archived'}
          </span>
          <button
            className={`toggle-btn ${detail.is_active ? 'toggle-btn--active' : 'toggle-btn--inactive'}`}
            onClick={handleToggleActive}
          >
            {detail.is_active ? 'Archive' : 'Activate'}
          </button>
        </div>
      </div>

      {saveError && (
        <div className="app-form-error">{saveError}</div>
      )}

      {/* Metadata */}
      <div className="app-editor-meta">
        <h3 className="app-editor-section-title">Metadata</h3>
        <div className="meta-field">
          <label htmlFor="meta-title">Title</label>
          <input
            id="meta-title"
            type="text"
            value={editTitle}
            onChange={e => setEditTitle(e.target.value)}
            className="meta-input"
          />
        </div>
        <div className="meta-field">
          <label htmlFor="meta-subtitle">Subtitle</label>
          <input
            id="meta-subtitle"
            type="text"
            value={editSubtitle}
            onChange={e => setEditSubtitle(e.target.value)}
            className="meta-input"
          />
        </div>
        <button
          className="btn btn--secondary"
          onClick={handleSaveMeta}
          disabled={isSavingMeta}
        >
          {isSavingMeta ? 'Saving...' : 'Save Metadata'}
        </button>
      </div>

      {/* Prompt Editor */}
      <div className="app-editor-prompt">
        <h3 className="app-editor-section-title">Prompt</h3>
        <textarea
          className="prompt-textarea"
          rows={20}
          value={editedBody}
          onChange={e => setEditedBody(e.target.value)}
          onKeyDown={handleTextareaKeyDown}
          spellCheck={false}
        />
        <div className="char-count">
          {charCount} / {charMax}
        </div>
      </div>

      {/* Change Note */}
      <div className="app-editor-change-note">
        <input
          type="text"
          className="meta-input"
          placeholder="Describe what changed..."
          value={changeNote}
          onChange={e => setChangeNote(e.target.value)}
        />
      </div>

      {/* Action Bar */}
      <div className="action-bar">
        <div className="action-bar-left">
          <button
            className="btn btn--primary"
            onClick={handlePublish}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? 'Publishing...' : 'Publish New Version'}
          </button>
          {successFlash && (
            <span className="success-flash">Version published</span>
          )}
        </div>
        <button
          className="btn btn--secondary"
          onClick={() => setShowVersionHistory(v => !v)}
        >
          {showVersionHistory ? 'Hide History' : 'Version History'}
        </button>
      </div>

      {/* Version History */}
      {showVersionHistory && (
        <div className="app-editor-version-history">
          <VersionHistory
            appId={appId}
            onClose={() => setShowVersionHistory(false)}
          />
        </div>
      )}
    </div>
  )
}
