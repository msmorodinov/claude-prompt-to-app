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

// --- App management types ---

export interface AdminApp {
  id: number
  slug: string
  title: string
  subtitle: string
  is_active: number
  current_version_id: number | null
  version_count: number
  created_at: string
  updated_at: string
}

export interface AdminAppDetail {
  id: number
  slug: string
  title: string
  subtitle: string
  is_active: number
  current_version_id: number | null
  current_version: {
    id: number
    body: string
    change_note: string
    created_at: string
  } | null
}

export interface PromptVersion {
  id: number
  change_note: string
  created_at: string
  body_preview: string
}

export interface PromptVersionFull {
  id: number
  app_id: number
  body: string
  change_note: string
  created_at: string
}

// --- App management API ---

export async function fetchAdminApps(): Promise<AdminApp[]> {
  return request('/admin/apps')
}

export async function fetchAdminApp(appId: number): Promise<AdminAppDetail> {
  return request(`/admin/apps/${appId}`)
}

export async function createAdminApp(data: {
  slug: string
  title: string
  subtitle?: string
  body: string
}): Promise<{ id: number; slug: string; current_version_id: number }> {
  return request('/admin/apps', {
    method: 'POST',
    body: JSON.stringify(data),
  })
}

export async function updateAdminApp(
  appId: number,
  data: {
    title?: string
    subtitle?: string
    body?: string
    change_note?: string
    is_active?: boolean
  },
): Promise<{ id: number; slug: string; current_version_id: number }> {
  return request(`/admin/apps/${appId}`, {
    method: 'PUT',
    body: JSON.stringify(data),
  })
}

export async function fetchAppVersions(appId: number): Promise<PromptVersion[]> {
  return request(`/admin/apps/${appId}/versions`)
}

export async function fetchVersionFull(
  appId: number,
  versionId: number,
): Promise<PromptVersionFull> {
  return request(`/admin/apps/${appId}/versions/${versionId}`)
}
