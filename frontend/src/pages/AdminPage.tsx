import { useState, useEffect, useRef } from 'react'
import SessionList from '../components/admin/SessionList'
import SessionViewer from '../components/admin/SessionViewer'
import AppList from '../components/admin/AppList'
import AppEditor from '../components/admin/AppEditor'
import '../styles/admin.css'

type AdminTab = 'sessions' | 'apps'

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('sessions')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null)

  // App context bar state (visible when editing an app)
  const [showEnvRef, setShowEnvRef] = useState(false)
  const [showVersionHistory, setShowVersionHistory] = useState(false)
  const [appInfo, setAppInfo] = useState<{ title: string; isActive: boolean } | null>(null)
  const toggleActiveRef = useRef(() => {})

  // Reset when app changes
  useEffect(() => {
    setShowEnvRef(false)
    setShowVersionHistory(false)
    setAppInfo(null)
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
            <span className="admin-app-name">{appInfo.title}</span>
            <span className={`status-badge ${appInfo.isActive ? 'status-badge--active' : 'status-badge--archived'}`}>
              {appInfo.isActive ? 'active' : 'archived'}
            </span>
            <button
              className="admin-header-btn admin-header-btn--danger"
              onClick={() => toggleActiveRef.current()}
            >
              {appInfo.isActive ? 'Archive' : 'Activate'}
            </button>
            <span className="admin-header-sep" />
            <button
              className={`admin-header-btn ${showEnvRef ? 'active' : ''}`}
              onClick={() => setShowEnvRef(v => !v)}
            >
              Environment
            </button>
            <button
              className={`admin-header-btn ${showVersionHistory ? 'active' : ''}`}
              onClick={() => setShowVersionHistory(v => !v)}
            >
              History
            </button>
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
      <div className="admin-layout">
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
                onAppInfo={setAppInfo}
                onRegisterToggleActive={(fn) => { toggleActiveRef.current = fn }}
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
