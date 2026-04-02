import { useState, useEffect, useCallback, useRef } from 'react'
import type { AdminAppDetail, EnvironmentInfo, ValidationReference } from '../../api-admin'
import { errorMessage, fetchAdminApp, fetchEnvironment, updateAdminApp, validatePrompt } from '../../api-admin'
import EnvironmentReference from './EnvironmentReference'
import VersionHistory from './VersionHistory'
import { PromptHighlighter } from './PromptHighlighter'

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
  const [metaCollapsed, setMetaCollapsed] = useState(true)

  // Prompt body
  const [originalBody, setOriginalBody] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [changeNote, setChangeNote] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [successFlash, setSuccessFlash] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Version history panel
  const [showVersionHistory, setShowVersionHistory] = useState(false)

  // Environment reference panel
  const [showEnvRef, setShowEnvRef] = useState(false)
  const [envData, setEnvData] = useState<EnvironmentInfo | null>(null)

  // Validation
  const [validationRefs, setValidationRefs] = useState<ValidationReference[] | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validationSummary, setValidationSummary] = useState<{ total: number; clear: number; ambiguous: number; not_found: number } | null>(null)

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
      setLoadError(errorMessage(err, 'Failed to load app'))
    }
  }, [appId])

  useEffect(() => {
    void loadDetail()
  }, [loadDetail])

  // Cmd+S / Ctrl+S to publish — use ref to avoid re-registering on every render
  const publishRef = useRef({ isDirty, isSaving, handlePublish })
  publishRef.current = { isDirty, isSaving, handlePublish }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        const { isDirty: dirty, isSaving: saving, handlePublish: publish } = publishRef.current
        if (dirty && !saving) {
          void publish()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  async function handleToggleActive() {
    if (!detail) return
    // Confirm archive action
    if (detail.is_active) {
      if (!window.confirm(`Archive "${detail.title}"? It will be hidden from users.`)) return
    }
    setSaveError(null)
    const newActive = detail.is_active === 0
    try {
      await updateAdminApp(appId, { is_active: newActive })
      setDetail({ ...detail, is_active: newActive ? 1 : 0 })
    } catch (err) {
      setSaveError(errorMessage(err, 'Failed to toggle active state'))
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
      setSaveError(errorMessage(err, 'Failed to save metadata'))
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
      setSaveError(errorMessage(err, 'Failed to publish version'))
    } finally {
      setIsSaving(false)
    }
  }

  function handleDiscard() {
    setEditedBody(originalBody)
    setChangeNote('')
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

  async function handleToggleEnvRef() {
    if (showEnvRef) {
      setShowEnvRef(false)
      return
    }
    if (!envData) {
      try {
        const data = await fetchEnvironment()
        setEnvData(data)
      } catch (err) {
        setSaveError(errorMessage(err, 'Failed to load environment reference'))
        return
      }
    }
    setShowEnvRef(true)
  }

  async function handleValidate() {
    setIsValidating(true)
    setValidationError(null)
    try {
      const result = await validatePrompt(editedBody)
      setValidationRefs(result.references)
      setValidationSummary(result.summary)
    } catch (e: unknown) {
      setValidationError(e instanceof Error ? e.message : 'Validation failed')
    } finally {
      setIsValidating(false)
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

      {/* Metadata — collapsible */}
      <div className="app-editor-meta">
        <button
          className="collapsible-header"
          onClick={() => setMetaCollapsed((v) => !v)}
          aria-expanded={!metaCollapsed}
        >
          <span className="collapsible-arrow">{metaCollapsed ? '\u25B6' : '\u25BC'}</span>
          <span className="app-editor-section-title">Metadata</span>
        </button>
        {!metaCollapsed && (
          <div className="collapsible-body">
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
        )}
      </div>

      {/* Prompt Editor — hidden when version history is open */}
      {!showVersionHistory && (
        <div className="app-editor-prompt">
          <h3 className="app-editor-section-title">Prompt</h3>
          <PromptHighlighter
            value={editedBody}
            onChange={(val) => {
              setEditedBody(val)
              setValidationRefs(null)
              setValidationSummary(null)
              setValidationError(null)
            }}
            onKeyDown={handleTextareaKeyDown}
            references={validationRefs}
            spellCheck={false}
            placeholder="Write your app's system prompt..."
          />
          <div className="char-count">
            {charCount} / {charMax}
          </div>
          <div className="validation-bar">
            {validationSummary && (
              <span className="validation-summary">
                <span className="validation-clear">✓ {validationSummary.clear} clear</span>
                <span className="validation-ambiguous">⚠ {validationSummary.ambiguous} ambiguous</span>
                <span className="validation-not-found">✕ {validationSummary.not_found} not found</span>
              </span>
            )}
            {validationError && (
              <span className="validation-error">{validationError}</span>
            )}
            <button
              className="validation-btn"
              onClick={handleValidate}
              disabled={isValidating || !editedBody.trim()}
            >
              {isValidating ? 'Validating...' : 'Validate'}
            </button>
          </div>
        </div>
      )}

      {/* Change Note + Publish inline */}
      {!showVersionHistory && (
        <div className="publish-bar">
          <input
            type="text"
            className="meta-input publish-bar-note"
            placeholder="Describe what changed..."
            value={changeNote}
            onChange={e => setChangeNote(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter' && isDirty && !isSaving) {
                void handlePublish()
              }
            }}
          />
          <button
            className="btn btn--primary"
            onClick={handlePublish}
            disabled={!isDirty || isSaving}
          >
            {isSaving ? 'Publishing...' : 'Publish'}
          </button>
          {isDirty && (
            <button
              className="btn btn--secondary"
              onClick={handleDiscard}
            >
              Discard
            </button>
          )}
          {successFlash && (
            <span className="success-flash">Published</span>
          )}
        </div>
      )}

      {/* Action Bar */}
      <div className="action-bar">
        <div className="action-bar-left" />
        <div className="action-bar-right">
          <button
            className="btn btn--secondary"
            onClick={handleToggleEnvRef}
          >
            {showEnvRef ? 'Hide Env' : 'Environment'}
          </button>
          <button
            className="btn btn--secondary"
            onClick={() => setShowVersionHistory(v => !v)}
          >
            {showVersionHistory ? 'Hide History' : 'Version History'}
          </button>
        </div>
      </div>

      {/* Environment Reference */}
      {showEnvRef && envData && (
        <div className="app-editor-env-reference">
          <EnvironmentReference
            data={envData}
            onClose={() => setShowEnvRef(false)}
          />
        </div>
      )}

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
