import { useState } from 'react'
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
  const [appReloadKey, setAppReloadKey] = useState(0)

  return (
    <div className="admin-page" data-testid="admin-page">
      <header className="admin-header" data-testid="admin-header">
        <h1>Admin</h1>
        <span className="admin-version admin-version--spacer">
          v{__APP_VERSION__}
        </span>

        <nav className="admin-tabs">
          <button
            className={`admin-tab ${tab === 'sessions' ? 'active' : ''}`}
            data-testid="admin-tab"
            onClick={() => setTab('sessions')}
          >
            Sessions
          </button>
          <button
            className={`admin-tab ${tab === 'apps' ? 'active' : ''}`}
            data-testid="admin-tab"
            onClick={() => setTab('apps')}
          >
            Apps
          </button>
        </nav>
      </header>
      <div className={`admin-layout${tab === 'apps' && selectedAppId ? ' admin-layout--has-detail' : ''}`} data-testid="admin-layout">
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
              <div className="admin-empty" data-testid="admin-empty">Select a session to monitor</div>
            )}
          </>
        ) : (
          <>
            <AppList selectedId={selectedAppId} onSelect={setSelectedAppId} />
            {selectedAppId ? (
              <AppEditor
                key={`${selectedAppId}-${appReloadKey}`}
                appId={selectedAppId}
                onReloadApp={() => setAppReloadKey(k => k + 1)}
              />
            ) : (
              <div className="admin-empty" data-testid="admin-empty">Select an app to edit</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
