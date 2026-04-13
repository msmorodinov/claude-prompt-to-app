import { useEffect, useState } from 'react'
import { fetchAdminUsers, updateUserAdmin, type AdminUser } from '../../api-admin'
import { relativeTime } from '../../relativeTime'

export default function UserList() {
  const [users, setUsers] = useState<AdminUser[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchAdminUsers()
      .then(setUsers)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  async function toggleAdmin(user: AdminUser) {
    try {
      const updated = await updateUserAdmin(user.id, !user.is_admin)
      setUsers(prev => prev.map(u => (u.id === updated.id ? updated : u)))
    } catch {
      // ignore
    }
  }

  if (loading) {
    return <div className="admin-empty">Loading users...</div>
  }

  return (
    <div className="admin-panel" style={{ gridColumn: '1 / -1', overflow: 'auto' }}>
      <div style={{ padding: '1rem 1.5rem', borderBottom: '1px solid var(--border)' }}>
        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', color: 'var(--accent)', fontWeight: 400 }}>
          Users ({users.length})
        </h2>
      </div>
      <div style={{ padding: '0.5rem' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
          <thead>
            <tr style={{ color: 'var(--text-muted)', textAlign: 'left' }}>
              <th style={thStyle}>Email</th>
              <th style={thStyle}>ID</th>
              <th style={thStyle}>Admin</th>
              <th style={thStyle}>Registered</th>
            </tr>
          </thead>
          <tbody>
            {users.map(user => (
              <tr key={user.id} style={{ borderTop: '1px solid var(--border)' }}>
                <td style={tdStyle}>{user.email}</td>
                <td style={{ ...tdStyle, fontFamily: 'var(--font-mono)', color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                  {user.id}
                </td>
                <td style={tdStyle}>
                  <button
                    onClick={() => toggleAdmin(user)}
                    style={{
                      padding: '0.25rem 0.6rem',
                      fontSize: '0.75rem',
                      fontFamily: 'var(--font-mono)',
                      border: '1px solid var(--border)',
                      borderRadius: '4px',
                      background: user.is_admin ? 'var(--accent)' : 'transparent',
                      color: user.is_admin ? 'var(--bg)' : 'var(--text-muted)',
                      cursor: 'pointer',
                    }}
                  >
                    {user.is_admin ? 'admin' : 'user'}
                  </button>
                </td>
                <td style={{ ...tdStyle, color: 'var(--text-muted)' }}>
                  {relativeTime(user.created_at)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

const thStyle: React.CSSProperties = {
  padding: '0.5rem 0.75rem',
  fontWeight: 500,
  fontSize: '0.75rem',
  textTransform: 'uppercase',
  letterSpacing: '0.05em',
}

const tdStyle: React.CSSProperties = {
  padding: '0.6rem 0.75rem',
}
