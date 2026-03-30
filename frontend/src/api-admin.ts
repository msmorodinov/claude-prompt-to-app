import { request } from './api'
import type { HistoryEntry } from './api'

export interface AdminSession {
  id: string
  user_id: string
  status: 'idle' | 'active' | 'waiting_input' | 'done' | 'error'
  message_count: number
  created_at: string
  title: string | null
}

export async function fetchAdminSessions(): Promise<AdminSession[]> {
  return request('/admin/sessions')
}

export function createAdminSSEUrl(sessionId: string): string {
  return `/admin/sessions/${sessionId}/stream`
}

export async function fetchSessionHistory(
  sessionId: string,
): Promise<HistoryEntry[]> {
  try {
    return await request(`/admin/sessions/${sessionId}/history`)
  } catch {
    return []
  }
}
