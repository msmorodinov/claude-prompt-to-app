import { useState, useEffect, useRef, useCallback } from 'react'
import SessionList from '../components/admin/SessionList'
import SessionViewer from '../components/admin/SessionViewer'
import AppList from '../components/admin/AppList'
import AppEditor from '../components/admin/AppEditor'
import { listApps, request } from '../api'
import { updateAdminApp } from '../api-admin'
import '../styles/admin.css'

type AdminTab = 'sessions' | 'apps'

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('sessions')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null)

  // App context bar state (visible when editing an app)
  const [showEnvRef, setShowEnvRef] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [appInfo, setAppInfo] = useState<{
    title: string; isActive: boolean
    isDirty: boolean; isSaving: boolean; successFlash: boolean
  } | null>(null)
  const [changeNote, setChangeNote] = useState('')
  const toggleActiveRef = useRef(() => {})
  const publishRef = useRef(() => {})
  const discardRef = useRef(() => {})

  // ⋯ menu state
  const [showMenu, setShowMenu] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)

  // Rename state
  const [isRenaming, setIsRenaming] = useState(false)
  const [renameValue, setRenameValue] = useState('')
  const renameInputRef = useRef<HTMLInputElement>(null)

  // Reset when app changes
  useEffect(() => {
    setShowEnvRef(false)
    setShowVersionHistory(false)
    setAppInfo(null)
    setChangeNote('')
    setShowMenu(false)
    setIsRenaming(false)
  }, [selectedAppId])

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

  const handleRenameStart = useCallback(() => {
    if (!appInfo) return
    setRenameValue(appInfo.title)
    setIsRenaming(true)
    setShowMenu(false)
  }, [appInfo])

  const handleRenameSubmit = useCallback(async () => {
    const trimmed = renameValue.trim()
    if (!trimmed || !selectedAppId) return
    const appId = selectedAppId
    try {
      await updateAdminApp(appId, { title: trimmed })
      // Force editor to reload by toggling selection
      setSelectedAppId(null)
      requestAnimationFrame(() => setSelectedAppId(appId))
    } catch {
      // Silently fail — editor will show stale title
    }
    setIsRenaming(false)
  }, [renameValue, selectedAppId])

  const handleEditWithAI = useCallback(async () => {
    if (!selectedAppId) return
    setShowMenu(false)
    try {
      // Find App Builder app
      const apps = await listApps()
      const builder = apps.find(a => a.slug === 'app-builder')
      if (!builder) {
        alert('App Builder app not found. Is it active?')
        return
      }
      // Create session with edit_app_id
      const data = await request<{ session_id: string }>('/sessions/create', {
        method: 'POST',
        body: JSON.stringify({ app_id: builder.id, edit_app_id: selectedAppId }),
      })
      // Navigate to chat page with the session
      window.location.href = `/?session=${data.session_id}`
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to start AI edit session')
    }
  }, [selectedAppId])

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Admin</h1>
        <span className={`admin-version${tab === 'apps' && appInfo ? '' : ' admin-version--spacer'}`}>
          v{__APP_VERSION__}
        </span>

        {tab === 'apps' && appInfo && (
          <div className="admin-app-context">
            <button
              className="admin-header-btn admin-header-back"
              onClick={() => setSelectedAppId(null)}
            >
              &larr;
            </button>

            {isRenaming ? (
              <input
                ref={renameInputRef}
                className="admin-rename-input"
                value={renameValue}
                onChange={e => setRenameValue(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') void handleRenameSubmit()
                  if (e.key === 'Escape') {
                    setRenameValue('')
                    setIsRenaming(false)
                  }
                }}
                onBlur={() => void handleRenameSubmit()}
              />
            ) : (
              <span className="admin-app-name">{appInfo.title}</span>
            )}

            <span className={`status-badge ${appInfo.isActive ? 'status-badge--active' : 'status-badge--archived'}`}>
              {appInfo.isActive ? 'active' : 'archived'}
            </span>

            {/* ⋯ menu */}
            <div className="admin-menu-container" ref={menuRef}>
              <button
                className="admin-header-btn admin-menu-trigger"
                onClick={() => setShowMenu(v => !v)}
              >
                ⋯
              </button>
              {showMenu && (
                <div className="admin-menu-dropdown">
                  {!showVersionHistory && (
                    <>
                      <div className="admin-menu-note">
                        <input
                          type="text"
                          placeholder="Change note..."
                          value={changeNote}
                          onChange={e => setChangeNote(e.target.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter' && appInfo?.isDirty && !appInfo?.isSaving) {
                              publishRef.current()
                              setShowMenu(false)
                            }
                          }}
                        />
                      </div>
                      <button
                        className="admin-menu-item"
                        disabled={!appInfo?.isDirty || appInfo?.isSaving}
                        onClick={() => { publishRef.current(); setShowMenu(false) }}
                      >
                        {appInfo?.isSaving ? 'Publishing...' : 'Publish'}
                      </button>
                      <button
                        className="admin-menu-item"
                        disabled={!appInfo?.isDirty}
                        onClick={() => { discardRef.current(); setShowMenu(false) }}
                      >
                        Discard
                      </button>
                      <div className="admin-menu-sep" />
                    </>
                  )}
                  <button
                    className={`admin-menu-item${showEnvRef ? ' active' : ''}`}
                    onClick={() => { setShowEnvRef(v => !v); setShowMenu(false) }}
                  >
                    {showEnvRef ? '\u2713 ' : ''}Environment
                  </button>
                  <button
                    className={`admin-menu-item${showVersionHistory ? ' active' : ''}`}
                    onClick={() => { setShowVersionHistory(v => !v); setShowMenu(false) }}
                  >
                    {showVersionHistory ? '\u2713 ' : ''}History
                  </button>
                  <div className="admin-menu-sep" />
                  <button
                    className="admin-menu-item"
                    onClick={handleRenameStart}
                  >
                    Rename
                  </button>
                  <button
                    className="admin-menu-item"
                    onClick={handleEditWithAI}
                  >
                    Edit with AI
                  </button>
                  <button
                    className="admin-menu-item admin-menu-item--danger"
                    onClick={() => { toggleActiveRef.current(); setShowMenu(false) }}
                  >
                    {appInfo.isActive ? 'Archive' : 'Activate'}
                  </button>
                </div>
              )}
            </div>

            {appInfo?.successFlash && (
              <span className="success-flash">Published</span>
            )}
          </div>
        )}

        <nav className="admin-tabs">
          <button
            className={`admin-tab ${tab === 'sessions' ? 'active' : ''}`}
            onClick={() => setTab('sessions')}
          >
            Sessions
          </button>
          <button
            className={`admin-tab ${tab === 'apps' ? 'active' : ''}`}
            onClick={() => setTab('apps')}
          >
            Apps
          </button>
        </nav>
      </header>
      <div className={`admin-layout${tab === 'apps' && selectedAppId ? ' admin-layout--has-detail' : ''}`}>
        {tab === 'sessions' ? (
          <>
            <SessionList
              selectedId={selectedSessionId}
              onSelect={setSelectedSessionId}
            />
            {selectedSessionId ? (
              <SessionViewer
                key={selectedSessionId}
                sessionId={selectedSessionId}
              />
            ) : (
              <div className="admin-empty">Select a session to monitor</div>
            )}
          </>
        ) : (
          <>
            <AppList selectedId={selectedAppId} onSelect={setSelectedAppId} />
            {selectedAppId ? (
              <AppEditor
                key={selectedAppId}
                appId={selectedAppId}
                showEnvRef={showEnvRef}
                showVersionHistory={showVersionHistory}
                changeNote={changeNote}
                onChangeNote={setChangeNote}
                onAppInfo={setAppInfo}
                onRegisterToggleActive={(fn) => { toggleActiveRef.current = fn }}
                onRegisterPublish={(fn) => { publishRef.current = fn }}
                onRegisterDiscard={(fn) => { discardRef.current = fn }}
              />
            ) : (
              <div className="admin-empty">Select an app to edit</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
