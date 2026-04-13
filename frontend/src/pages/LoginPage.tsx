import { useState, type FormEvent } from 'react'
import { authLogin, ApiError } from '../api'
import { useAuth } from '../contexts/AuthContext'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await authLogin(email, pin)
      login(res.token, { id: res.user_id, email: res.email, is_admin: res.is_admin })
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 401) setError('Неверный PIN')
        else if (err.status === 422) setError(err.message)
        else setError('Ошибка входа')
      } else {
        setError('Не удалось подключиться к серверу')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={styles.container}>
      <form onSubmit={handleSubmit} style={styles.card}>
        <h1 style={styles.title}>Вход</h1>
        <p style={styles.subtitle}>Введите email и PIN-код</p>

        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          autoFocus
          autoComplete="email"
          style={styles.input}
        />

        <input
          type="password"
          placeholder="PIN (4-6 цифр)"
          value={pin}
          onChange={e => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          required
          inputMode="numeric"
          pattern="\d{4,6}"
          autoComplete="current-password"
          style={styles.input}
        />

        {error && <div style={styles.error}>{error}</div>}

        <button
          type="submit"
          disabled={loading || !email || pin.length < 4}
          style={{
            ...styles.button,
            opacity: loading || !email || pin.length < 4 ? 0.5 : 1,
          }}
        >
          {loading ? 'Подождите...' : 'Войти'}
        </button>

        <p style={styles.hint}>
          Новый email? Аккаунт создастся автоматически.
        </p>
      </form>
    </div>
  )
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: '100dvh',
    background: 'var(--bg)',
    padding: '1rem',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '1rem',
    width: '100%',
    maxWidth: '360px',
    padding: '2.5rem 2rem',
    background: 'var(--surface)',
    border: '1px solid var(--border)',
    borderRadius: '12px',
  },
  title: {
    fontFamily: 'var(--font-heading)',
    fontSize: '1.5rem',
    color: 'var(--accent)',
    fontWeight: 400,
    textAlign: 'center' as const,
  },
  subtitle: {
    color: 'var(--text-muted)',
    fontSize: '0.875rem',
    textAlign: 'center' as const,
    marginBottom: '0.5rem',
  },
  input: {
    padding: '0.75rem 1rem',
    background: 'var(--surface-2)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    color: 'var(--text)',
    fontFamily: 'var(--font-body)',
    fontSize: '0.95rem',
    outline: 'none',
  },
  error: {
    color: 'var(--error)',
    fontSize: '0.85rem',
    textAlign: 'center' as const,
  },
  button: {
    padding: '0.75rem',
    background: 'var(--accent)',
    color: 'var(--bg)',
    border: 'none',
    borderRadius: '8px',
    fontFamily: 'var(--font-body)',
    fontSize: '0.95rem',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '0.25rem',
  },
  hint: {
    color: 'var(--text-muted)',
    fontSize: '0.75rem',
    textAlign: 'center' as const,
  },
}
