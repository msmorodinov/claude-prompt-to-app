import { request } from './api'
import type { HistoryEntry } from './api'

export function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback
}

export interface AdminSession {
  id: string
  user_id: string
  status: 'idle' | 'active' | 'waiting_input' | 'done' | 'error'
  message_count: number
  created_at: string
  title: string | null
  app_id: number | null
  app_name: string | null
  user_display_name: string | null
  mode?: string
}

export async function fetchAdminSessions(): Promise<AdminSession[]> {
  return request('/admin/sessions')
}

export function createAdminSSEUrl(sessionId: string): string {
  const token = localStorage.getItem('auth_token') ?? ''
  return `/admin/sessions/${sessionId}/stream?token=${encodeURIComponent(token)}`
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
  type: 'app' | 'persona'
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
  type: 'app' | 'persona'
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
  body?: string
  type?: 'app' | 'persona'
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

// --- Prompt validation ---

export interface ValidationReference {
  quote: string
  tool: string | null
  widget: string | null
  status: 'clear' | 'ambiguous' | 'not_found'
  note: string | null
}

export interface ValidationResult {
  references: ValidationReference[]
  summary: { total: number; clear: number; ambiguous: number; not_found: number }
  cached: boolean
  error?: string
}

export async function validatePrompt(promptBody: string): Promise<ValidationResult> {
  const res = await fetch('/admin/validate-prompt', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt_body: promptBody }),
  })
  if (!res.ok) {
    const data: { error?: string } = await res.json().catch(() => ({}))
    throw new Error(data.error || `Validation failed (${res.status})`)
  }
  return res.json() as Promise<ValidationResult>
}

// --- Environment reference ---

export interface WidgetInfo {
  type: string
  description: string
  required: string[]
  optional: string[]
}

export interface ToolInfo {
  name: string
  description: string
  behavior: string
}

export interface EnvironmentInfo {
  display_widgets: WidgetInfo[]
  input_widgets: WidgetInfo[]
  tools: ToolInfo[]
}

export async function fetchEnvironment(): Promise<EnvironmentInfo> {
  return request('/api/environment')
}

// --- MCP Servers ---

export interface McpServer {
  name: string
  command: string
  status: 'connected' | 'needs_auth' | 'error'
}

export async function fetchMcpServers(): Promise<McpServer[]> {
  return request('/api/mcp-servers')
}

// --- System Status ---

export interface AuthStatus {
  mode: 'max_oauth' | 'api_key'
  has_credentials: boolean
  credentials_note: string | null
  last_test: {
    ok: boolean
    at: string
    detail: string
  } | null
}

export interface SystemStatus {
  auth: AuthStatus
  cli: {
    version: string | null
    available: boolean
  }
  server: {
    uptime_seconds: number
    started_at: string
  }
  sessions: {
    active: number
    waiting_input: number
    total: number
    last_activity: string | null
  }
  mcp_servers: McpServer[]
}

export async function fetchSystemStatus(): Promise<SystemStatus> {
  return request('/admin/system-status')
}

export async function setAuthMode(
  mode: 'api_key' | 'max_oauth',
  apiKey?: string,
): Promise<{ ok: boolean; mode: string; warning: string | null }> {
  return request('/admin/auth/mode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode, api_key: apiKey }),
  })
}

export async function testAuth(): Promise<{
  ok: boolean
  at: string
  detail: string
}> {
  return request('/admin/auth/test', { method: 'POST' })
}

export async function deleteApiKey(): Promise<{ ok: boolean; mode: string }> {
  return request('/admin/auth/api-key', { method: 'DELETE' })
}

// --- User management ---

export interface AdminUser {
  id: string
  email: string
  is_admin: number
  created_at: string
}

export async function fetchAdminUsers(): Promise<AdminUser[]> {
  return request('/admin/users')
}

export async function updateUserAdmin(
  userId: string,
  isAdmin: boolean,
): Promise<AdminUser> {
  return request(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify({ is_admin: isAdmin }),
  })
}
