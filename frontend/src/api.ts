import { getAuthToken } from './contexts/AuthContext'

const BASE_URL = ''

export class ApiError extends Error {
  readonly status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const token = getAuthToken()
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('auth_token')
      localStorage.removeItem('auth_user')
      window.location.reload()
    }
    throw new ApiError(
      `${options?.method ?? 'GET'} ${path} failed: ${res.status}`,
      res.status,
    )
  }
  return res.json()
}

export interface AuthResponse {
  token: string
  user_id: string
  email: string
  is_admin: boolean
}

export async function authLogin(email: string, pin: string): Promise<AuthResponse> {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, pin }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: 'Login failed' }))
    throw new ApiError(body.detail || 'Login failed', res.status)
  }
  return res.json()
}

export async function startChat(
  message: string,
  sessionId?: string,
): Promise<{ session_id: string }> {
  return request('/chat', {
    method: 'POST',
    body: JSON.stringify({ message, session_id: sessionId }),
  })
}

export async function submitAnswers(
  sessionId: string,
  askId: string,
  answers: Record<string, unknown>,
): Promise<void> {
  await request('/answers', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId, ask_id: askId, answers }),
  })
}

export async function createSession(appId?: number): Promise<{ session_id: string }> {
  return request('/sessions/create', {
    method: 'POST',
    body: JSON.stringify(appId != null ? { app_id: appId } : {}),
  })
}

export interface HistoryEntry {
  role: string
  content: Record<string, unknown>
}

export async function loadSession(sessionId: string): Promise<HistoryEntry[]> {
  try {
    return await request(`/sessions/${sessionId}`)
  } catch {
    return []
  }
}

export interface SessionSummary {
  id: string
  created_at: string
  title: string | null
  status: string
  message_count: number
  app_id: number | null
  app_name: string | null
  mode?: string
}

export async function listSessions(): Promise<SessionSummary[]> {
  return request('/sessions')
}

export async function deleteSession(sessionId: string): Promise<void> {
  await request(`/sessions/${sessionId}`, { method: 'DELETE' })
}

export interface AppConfig {
  title: string
  subtitle?: string
}

export interface AppInfo {
  id: number
  slug: string
  title: string
  subtitle?: string
}

export async function listApps(): Promise<AppInfo[]> {
  try {
    return await request('/apps')
  } catch {
    return []
  }
}

export async function loadConfig(appId?: number, sessionId?: string): Promise<AppConfig> {
  const query = new URLSearchParams()
  if (appId != null) query.set('app_id', String(appId))
  if (sessionId) query.set('session_id', sessionId)
  const qs = query.toString()
  try {
    return await request(`/config${qs ? `?${qs}` : ''}`)
  } catch {
    return { title: 'App' }
  }
}

export async function retrySession(
  sessionId: string,
): Promise<{ session_id: string }> {
  return request('/chat/retry', {
    method: 'POST',
    body: JSON.stringify({ session_id: sessionId }),
  })
}

export function createSSEUrl(sessionId: string): string {
  const token = getAuthToken() ?? ''
  return `${BASE_URL}/stream?session_id=${sessionId}&token=${encodeURIComponent(token)}`
}
