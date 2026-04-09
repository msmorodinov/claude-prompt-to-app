import { useState, useEffect, useCallback, useRef } from 'react'
import type { AdminAppDetail, EnvironmentInfo, ValidationReference } from '../../api-admin'
import { errorMessage, fetchAdminApp, fetchEnvironment, updateAdminApp, validatePrompt } from '../../api-admin'
import { request } from '../../api'
import EnvironmentReference from './EnvironmentReference'
import VersionHistory from './VersionHistory'
import { PromptHighlighter } from './PromptHighlighter'

interface Props {
  appId: number
  onReloadApp: () => void
}

const CHAR_MAX = (50_000).toLocaleString()

export default function AppEditor({ appId, onReloadApp }: Props) {
  const [detail, setDetail] = useState<AdminAppDetail | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  // Prompt body
  const [originalBody, setOriginalBody] = useState('')
  const [editedBody, setEditedBody] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [successFlash, setSuccessFlash] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)

  // Environment data (loaded on demand)
  const [envData, setEnvData] = useState<EnvironmentInfo | null>(null)

  // Validation
  const [validationRefs, setValidationRefs] = useState<ValidationReference[] | null>(null)
  const [isValidating, setIsValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validationSummary, setValidationSummary] = useState<{ total: number; clear: number; ambiguous: number; not_found: number } | null>(null)

  // Toolbar state (moved from AdminPage)
  const [showEnvRef, setShowEnvRef] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [showMenu, setShowMenu] = useState(false)
  const [changeNote, setChangeNote] = useState('')
  const menuRef = useRef<HTMLDivElement>(null)

  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)
  const skipBlurRef = useRef(false)

  const isDirty = editedBody !== originalBody

  const loadDetail = useCallback(async () => {
    setLoadError(null)
    try {
      const data = await fetchAdminApp(appId)
      setDetail(data)
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

  // Close menu on click outside
  useEffect(() => {
    if (!showMenu) return
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setShowMenu(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [showMenu])

  // Focus rename input when entering rename mode
  useEffect(() => {
    if (isRenaming && renameInputRef.current) {
      renameInputRef.current.focus()
      renameInputRef.current.select()
    }
  }, [isRenaming])

  // Cmd+S / Ctrl+S to publish
  const saveStateRef = useRef({ isDirty, isSaving })
  saveStateRef.current = { isDirty, isSaving }

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === 's') {
        e.preventDefault()
        const { isDirty: dirty, isSaving: saving } = saveStateRef.current
        if (dirty && !saving) {
          void handlePublish()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  function handleRenameStart() {
    if (!detail) return
    setRenameValue(detail.title)
    setIsRenaming(true)
    setShowMenu(false)
  }

  async function handleRenameSubmit() {
    const trimmed = renameValue.trim()
    if (!trimmed || !appId) {
      setIsRenaming(false)
      return
    }
    skipBlurRef.current = true
    setSaveError(null)
    try {
      await updateAdminApp(appId, { title: trimmed })
      onReloadApp()
    } catch {
      setSaveError('Failed to rename app')
    }
    setIsRenaming(false)
  }

  async function handleEditWithAI() {
    if (!appId) return
    setShowMenu(false)
    setSaveError(null)
    try {
      const data = await request<{ session_id: string }>('/sessions/create', {
        method: 'POST',
        body: JSON.stringify({ mode: 'app-builder', edit_app_id: appId }),
      })
      sessionStorage.setItem('session_id', data.session_id)
      window.location.href = '/'
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to start AI edit session')
    }
  }

  async function handleToggleActive() {
    if (!detail) return
    if (detail.is_active) {
      if (!window.confirm(`Archive "${detail.title}"? It will be hidden from users.`)) return
    }
    setSaveError(null)
    const willBeActive = !detail.is_active
    try {
      await updateAdminApp(appId, { is_active: willBeActive })
      setDetail({ ...detail, is_active: willBeActive ? 1 : 0 })
    } catch (err) {
      setSaveError(errorMessage(err, 'Failed to toggle active state'))
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

  function handleBodyChange(val: string) {
    setEditedBody(val)
    setValidationRefs(null)
    setValidationSummary(null)
    setValidationError(null)
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

  // Load env data when panel becomes visible
  useEffect(() => {
    if (showEnvRef && !envData) {
      fetchEnvironment()
        .then(setEnvData)
        .catch((err) => setSaveError(errorMessage(err, 'Failed to load environment reference')))
    }
  }, [showEnvRef, envData])

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

  if (loadError) {
    return (
      <div className="app-editor" data-testid="app-editor">
        <p style={{ color: 'var(--error)', padding: '1.5rem', fontFamily: 'var(--font-mono)' }}>
          Error: {loadError}
        </p>
      </div>
    )
  }

  if (!detail) {
    return (
      <div className="app-editor" data-testid="app-editor">
        <p style={{ color: 'var(--text-muted)', padding: '1.5rem', fontFamily: 'var(--font-mono)' }}>
          Loading...
        </p>
      </div>
    )
  }

  return (
    <div className="app-editor" data-testid="app-editor">
      {/* Toolbar */}
      <div className="app-editor-toolbar">
        {isRenaming ? (
          <input
            ref={renameInputRef}
            className="admin-rename-input"
            data-testid="admin-rename-input"
            aria-label="Rename app"
            value={renameValue}
            onChange={e => setRenameValue(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); void handleRenameSubmit() }
              if (e.key === 'Escape') { skipBlurRef.current = true; setIsRenaming(false) }
            }}
            onBlur={() => {
              if (skipBlurRef.current) { skipBlurRef.current = false; return }
              void handleRenameSubmit()
            }}
          />
        ) : (
          <h2 className="app-editor-title" data-testid="admin-app-name">{detail.title}</h2>
        )}
        <span className="app-editor-slug">{detail.slug}</span>
        <span className={`status-badge ${detail.is_active ? 'status-badge--active' : 'status-badge--archived'}`}>
          {detail.is_active ? 'active' : 'archived'}
        </span>

        <div className="admin-menu-container" ref={menuRef}>
          <button className="admin-header-btn admin-menu-trigger" data-testid="admin-menu-trigger"
            aria-haspopup="menu" aria-expanded={showMenu} onClick={() => setShowMenu(v => !v)}>⋯</button>
          {showMenu && (
            <div className="admin-menu-dropdown" role="menu" data-testid="admin-menu-dropdown">
              {!showVersionHistory && (
                <>
                  <div className="admin-menu-note">
                    <input type="text" placeholder="Change note..." value={changeNote}
                      onChange={e => setChangeNote(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter' && isDirty && !isSaving) { handlePublish(); setShowMenu(false) } }} />
                  </div>
                  <button className="admin-menu-item" data-testid="admin-menu-item"
                    disabled={!isDirty || isSaving} onClick={() => { handlePublish(); setShowMenu(false) }}>
                    {isSaving ? 'Publishing...' : 'Publish'}
                  </button>
                  <button className="admin-menu-item" data-testid="admin-menu-item"
                    disabled={!isDirty} onClick={() => { handleDiscard(); setShowMenu(false) }}>Discard</button>
                  <div className="admin-menu-sep" />
                </>
              )}
              <button className={`admin-menu-item${showEnvRef ? ' active' : ''}`} data-testid="admin-menu-item"
                onClick={() => { setShowEnvRef(v => !v); setShowMenu(false) }}>{showEnvRef ? '\u2713 ' : ''}Environment</button>
              <button className={`admin-menu-item${showVersionHistory ? ' active' : ''}`} data-testid="admin-menu-item"
                onClick={() => { setShowVersionHistory(v => !v); setShowMenu(false) }}>{showVersionHistory ? '\u2713 ' : ''}History</button>
              <div className="admin-menu-sep" />
              <button className="admin-menu-item" data-testid="admin-menu-item" onClick={handleRenameStart}>Rename</button>
              <button className="admin-menu-item" data-testid="admin-menu-item" onClick={handleEditWithAI}>Edit with AI</button>
              <button className="admin-menu-item admin-menu-item--danger" data-testid="admin-menu-item--danger"
                onClick={() => { handleToggleActive(); setShowMenu(false) }}>{detail.is_active ? 'Archive' : 'Activate'}</button>
            </div>
          )}
        </div>

        {isDirty && <span className="unsaved-dot" title="Unsaved changes" />}
        {successFlash && <span className="success-flash">Published</span>}
      </div>

      {saveError && (
        <div className="app-form-error" data-testid="app-form-error">{saveError}</div>
      )}

      {/* Prompt Editor — hidden when version history is open */}
      {!showVersionHistory && (
        <div className="app-editor-prompt" data-testid="app-editor-prompt">
          <h3 className="app-editor-section-title">Prompt</h3>
          <PromptHighlighter
            value={editedBody}
            onChange={handleBodyChange}
            onKeyDown={handleTextareaKeyDown}
            references={validationRefs}
            spellCheck={false}
            placeholder="Write your app's system prompt..."
          />
          <div className="char-count">
            {charCount} / {CHAR_MAX}
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

      {/* Environment Reference */}
      {showEnvRef && envData && (
        <div className="app-editor-env-reference" data-testid="app-editor-env-reference">
          <EnvironmentReference data={envData} />
        </div>
      )}

      {/* Version History */}
      {showVersionHistory && (
        <div className="app-editor-version-history" data-testid="app-editor-version-history">
          <VersionHistory appId={appId} />
        </div>
      )}
    </div>
  )
}
