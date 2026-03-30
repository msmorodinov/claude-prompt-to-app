import { useState } from 'react'
import SessionList from '../components/admin/SessionList'
import SessionViewer from '../components/admin/SessionViewer'
import '../styles/admin.css'

export default function AdminPage() {
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(
    null,
  )

  return (
    <div className="admin-page">
      <header className="admin-header">
        <h1>Admin Monitor</h1>
      </header>
      <div className="admin-layout">
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
      </div>
    </div>
  )
}
