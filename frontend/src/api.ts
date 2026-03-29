const BASE_URL = ''

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
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
  const res = await fetch(`${BASE_URL}/sessions/${sessionId}`)
  if (!res.ok) return []
  return res.json()
}

export function createSSEUrl(sessionId: string): string {
  return `${BASE_URL}/stream?session_id=${sessionId}`
}
