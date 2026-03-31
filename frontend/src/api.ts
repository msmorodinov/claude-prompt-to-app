import { getUserId } from './userId'

const BASE_URL = ''

export async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-User-Id': getUserId(),
      ...options?.headers,
    },
  })
  if (!res.ok) {
    throw new Error(`${options?.method ?? 'GET'} ${path} failed: ${res.status}`)
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

export async function createSession(): Promise<{ session_id: string }> {
  return request('/sessions/create', { method: 'POST' })
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
}

export async function listSessions(): Promise<SessionSummary[]> {
  return request('/sessions')
}

export interface AppConfig {
  title: string
  subtitle?: string
}

export async function loadConfig(): Promise<AppConfig> {
  try {
    return await request('/config')
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
  return `${BASE_URL}/stream?session_id=${sessionId}`
}
