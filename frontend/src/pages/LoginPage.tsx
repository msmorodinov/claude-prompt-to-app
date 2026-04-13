import { useState, type FormEvent } from 'react'
import { authLogin, ApiError } from '../api'
import { useAuth } from '../contexts/AuthContext'
import '../styles/login.css'

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [pin, setPin] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const canSubmit = !loading && email.length > 0 && pin.length >= 4

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
    <div className="login-container">
      <form onSubmit={handleSubmit} className="login-card">
        <div className="login-header">
          <h1 className="login-title">Вход</h1>
          <p className="login-subtitle">Введите email и PIN-код</p>
        </div>

        <div className="login-fields">
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={e => setEmail(e.target.value)}
            required
            autoFocus
            autoComplete="email"
            className="login-input"
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
            className="login-input"
          />
        </div>

        {error && <div className="login-error">{error}</div>}

        <button
          type="submit"
          disabled={!canSubmit}
          className="login-button"
        >
          {loading ? 'Подождите...' : 'Войти'}
        </button>

        <p className="login-hint">
          Новый email? Аккаунт создастся автоматически.
        </p>
      </form>
    </div>
  )
}
