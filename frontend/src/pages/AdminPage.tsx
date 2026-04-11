import { useState, useEffect } from 'react'
import SessionList from '../components/admin/SessionList'
import SessionViewer from '../components/admin/SessionViewer'
import AppList from '../components/admin/AppList'
import AppEditor from '../components/admin/AppEditor'
import SystemStatus, { getHeaderDotColor } from '../components/admin/SystemStatus'
import { fetchSystemStatus } from '../api-admin'
import type { SystemStatus as SystemStatusType } from '../api-admin'
import '../styles/admin.css'

type AdminTab = 'sessions' | 'apps' | 'system'

export default function AdminPage() {
  const [tab, setTab] = useState<AdminTab>('sessions')
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null)
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null)
  const [appReloadKey, setAppReloadKey] = useState(0)
  const [systemData, setSystemData] = useState<SystemStatusType | null>(null)

  useEffect(() => {
    if (tab === 'system') return
    let cancelled = false
    const load = async () => {
      try {
        const data = await fetchSystemStatus()
        if (!cancelled) setSystemData(data)
      } catch { /* ignore */ }
    }
    load()
    const interval = setInterval(load, 60_000)
    return () => { cancelled = true; clearInterval(interval) }
  }, [tab])

  return (
    <div className="admin-page" data-testid="admin-page">
      <header className="admin-header" data-testid="admin-header">
        <h1>Admin</h1>
        <span className="admin-version">
          v{__APP_VERSION__}
        </span>
        <span
          className="admin-header-dot"
          style={{ background: getHeaderDotColor(systemData) }}
          title={systemData ? `Auth: ${systemData.auth.mode}` : 'Loading...'}
        />

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
          <button
            className={`admin-tab ${tab === 'system' ? 'active' : ''}`}
            data-testid="admin-tab"
            onClick={() => setTab('system')}
          >
            System
          </button>
        </nav>
      </header>
      <div className={`admin-layout${tab === 'apps' && selectedAppId ? ' admin-layout--has-detail' : ''}${tab === 'system' ? ' admin-layout--full' : ''}`} data-testid="admin-layout">
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
        ) : tab === 'apps' ? (
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
        ) : (
          <SystemStatus />
        )}
      </div>
    </div>
  )
}
