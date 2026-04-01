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

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Admin</h1>
        <span className="admin-version">v{__APP_VERSION__}</span>
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
              <AppEditor key={selectedAppId} appId={selectedAppId} />
            ) : (
              <div className="admin-empty">Select an app to edit</div>
            )}
          </>
        )}
      </div>
    </div>
  )
}
