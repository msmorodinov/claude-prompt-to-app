import { useCallback, useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { ApiError, type AppConfig, type AppInfo, createSession, deleteSession, listApps, loadConfig, loadSession, retrySession, startChat, submitAnswers } from '../api'
import { useToast } from '../contexts/ToastContext'
import { historyToMessages, useChat } from '../hooks/useChat'
import { useSSE } from '../hooks/useSSE'
import { useAuth } from '../contexts/AuthContext'
import AppSelector from './AppSelector'
import MessageList from './MessageList'
import TokenCounter from './TokenCounter'
import SessionSidebar from './SessionSidebar'

const SESSION_KEY = 'session_id'
const isMobile = () => window.matchMedia('(max-width: 1023px)').matches

export default function ChatContainer() {
  const [searchParams, setSearchParams] = useSearchParams()
  const { showToast } = useToast()
  const { user, logout } = useAuth()

  const [sessionId, setSessionIdRaw] = useState<string | null>(
    () => searchParams.get('s') || sessionStorage.getItem(SESSION_KEY),
  )

  const setSessionId = useCallback((id: string | null) => {
    setSessionIdRaw(id)
    if (id) {
      sessionStorage.setItem(SESSION_KEY, id)
      setSearchParams({ s: id }, { replace: true })
    } else {
      sessionStorage.removeItem(SESSION_KEY)
      setSearchParams({}, { replace: true })
    }
  }, [setSearchParams])

  const [appConfig, setAppConfig] = useState<AppConfig>({ title: 'App' })
  const [sidebarOpen, setSidebarOpen] = useState(() => !isMobile())

  const [sessionError, setSessionError] = useState(false)
  const [sessionDone, setSessionDone] = useState(false)
  const [sseReconnectKey, setSseReconnectKey] = useState(0)

  // Multi-app state
  const [apps, setApps] = useState<AppInfo[]>([])
  const [appsLoaded, setAppsLoaded] = useState(false)
  const [appsError, setAppsError] = useState(false)
  const [selectedAppId, setSelectedAppId] = useState<number | null>(null)

  const { messages, setMessages, isLoading, setIsLoading, hasPendingAsk, isPaused, tokenUsage, handleSSEEvent, markAskAnswered, resetChat, scrollRef } =
    useChat()

  const wrappedSSEEvent = useCallback(
    (event: Parameters<typeof handleSSEEvent>[0]) => {
      if (event.type === 'error') {
        setSessionError(true)
        setSessionDone(false)
      } else if (event.type === 'done') {
        setSessionError(false)
        setSessionDone(true)
      }
      handleSSEEvent(event)
    },
    [handleSSEEvent],
  )

  // Load available apps on mount
  useEffect(() => {
    listApps()
      .then(a => { setApps(a); setAppsLoaded(true); setAppsError(false) })
      .catch(() => { setAppsLoaded(true); setAppsError(true) })
  }, [])

  // Auto-select when single app
  useEffect(() => {
    if (apps.length === 1 && selectedAppId === null) {
      setSelectedAppId(apps[0].id)
    }
  }, [apps, selectedAppId])

  // Load config when app is selected or session loaded from URL
  useEffect(() => {
    loadConfig(selectedAppId ?? undefined, sessionId ?? undefined).then(config => {
      setAppConfig(config)
      document.title = config.title
    })
  }, [selectedAppId, sessionId])

  // Create session when needed (deferred until app selected for multi-app)
  useEffect(() => {
    if (sessionId) return
    if (!appsLoaded) return // Wait for apps response
    if (apps.length > 1 && selectedAppId === null) return
    let cancelled = false
    createSession(selectedAppId ?? undefined).then(({ session_id }) => {
      if (cancelled) return
      setSessionId(session_id)
    }).catch(() => {
      showToast('Failed to create session', 'error')
    })
    return () => { cancelled = true }
  }, [sessionId, selectedAppId, appsLoaded, apps.length, setSessionId, showToast])

  const [hasHistory, setHasHistory] = useState<boolean | null>(null)
  const historyLoaded = useRef(false)
  useEffect(() => {
    if (!sessionId || historyLoaded.current) return
    historyLoaded.current = true
    loadSession(sessionId).then(history => {
      if (history.length > 0) {
        const msgs = historyToMessages(history)
        setMessages(msgs)
        setHasHistory(true)
      } else {
        setHasHistory(false)
      }
    }).catch(() => {
      showToast('Failed to load session history', 'error')
      setHasHistory(false)
    })
  }, [sessionId, setMessages, markAskAnswered, showToast])

  const { isReconnecting } = useSSE(sessionId, wrappedSSEEvent, { reconnectKey: sseReconnectKey })

  const handleSend = useCallback(
    async (message: string) => {
      if (hasPendingAsk) return
      setSessionError(false)
      setIsLoading(true)
      try {
        const { session_id } = await startChat(message, sessionId ?? undefined)
        setSessionId(session_id)
      } catch (err: unknown) {
        const status = err instanceof ApiError ? err.status : undefined
        if (status === 404) {
          try {
            const { session_id: newId } = await createSession(selectedAppId ?? undefined)
            setSessionId(newId)
            historyLoaded.current = true
            const { session_id } = await startChat(message, newId)
            setSessionId(session_id)
            return
          } catch {
            showToast('Failed to send message', 'error')
            setIsLoading(false)
            return
          }
        }
        showToast('Failed to send message', 'error')
        setIsLoading(false)
      }
    },
    [sessionId, selectedAppId, setIsLoading, hasPendingAsk, setSessionId, showToast],
  )

  const handleRetry = useCallback(async () => {
    if (!sessionId) return
    setSessionError(false)
    setSessionDone(false)
    setIsLoading(true)
    try {
      await retrySession(sessionId)
      setSseReconnectKey((k) => k + 1)
    } catch {
      setIsLoading(false)
      setSessionError(true)
    }
  }, [sessionId, setIsLoading])

  const handleAskSubmit = useCallback(
    async (askId: string, answers: Record<string, unknown>) => {
      if (!sessionId) return
      try {
        await submitAnswers(sessionId, askId, answers)
        setIsLoading(true)
        markAskAnswered(askId, answers)
      } catch (err: unknown) {
        const status = err instanceof ApiError ? err.status : undefined
        if (status === 404 || status === 409) {
          markAskAnswered(askId, answers) // unblock UI
          showToast(
            status === 404
              ? 'Session was lost. Please start a new session.'
              : 'Response timed out. Please start a new session.',
            'error',
          )
          setSessionError(true)
        } else {
          showToast('Failed to submit answers', 'error')
        }
      }
    },
    [sessionId, markAskAnswered, setIsLoading, showToast],
  )

  const handleSelectSession = useCallback(
    (id: string) => {
      if (id === sessionId) {
        if (isMobile()) setSidebarOpen(false)
        return
      }
      // Switch to this session — triggers history load + SSE reconnect
      historyLoaded.current = false
      resetChat()
      setHasHistory(null)
      setSessionError(false)
      setSessionDone(false)
      setSessionId(id)
      if (isMobile()) setSidebarOpen(false)
    },
    [sessionId, setSessionId, resetChat],
  )

  const handleNewSession = useCallback(async () => {
    setSessionId(null)
    resetChat()
    setHasHistory(false)
    setSessionError(false)
    setSessionDone(false)
    historyLoaded.current = false
    if (isMobile()) setSidebarOpen(false)
    if (apps.length > 1) {
      setSelectedAppId(null)
    }
  }, [apps.length, resetChat, setSessionId])

  const handleDeleteSession = useCallback(async (id: string) => {
    try {
      await deleteSession(id)
    } catch {
      showToast('Failed to delete session', 'error')
      return
    }
    if (id === sessionId) {
      setSessionId(null)
      resetChat()
      setHasHistory(false)
      setSessionError(false)
      setSessionDone(false)
      historyLoaded.current = false
      if (apps.length > 1) {
        setSelectedAppId(null)
      }
    }
  }, [sessionId, apps.length, resetChat, setSessionId, showToast])

  const isSessionLoading = hasHistory === null && sessionId !== null
  const showStartScreen = !isSessionLoading && hasHistory === false && messages.length === 0 && !isLoading

  const handleStart = useCallback(() => {
    handleSend('start')
  }, [handleSend])

  function renderMainContent() {
    // Show error when apps fetch failed
    if (appsError && apps.length === 0) {
      return (
        <div data-testid="start-screen" className="start-screen">
          <p className="error-text">Failed to load apps</p>
          <button
            className="start-btn"
            onClick={() => {
              setAppsError(false)
              setAppsLoaded(false)
              listApps()
                .then(a => { setApps(a); setAppsLoaded(true) })
                .catch(() => { setAppsLoaded(true); setAppsError(true) })
            }}
          >
            Retry
          </button>
        </div>
      )
    }

    // Show AppSelector early when waiting for app choice (before session exists)
    if (!sessionId && appsLoaded && apps.length > 1 && selectedAppId === null) {
      return (
        <AppSelector
          apps={apps}
          onSelect={(id) => setSelectedAppId(id)}
        />
      )
    }

    if (isSessionLoading) {
      return (
        <div data-testid="start-screen" className="start-screen">
          <p className="loading-text">Loading...</p>
        </div>
      )
    }

    if (showStartScreen) {
      return (
        <div data-testid="start-screen" className="start-screen">
          <h2>Ready to begin?</h2>
          {appConfig.subtitle && <p className="start-subtitle">{appConfig.subtitle}</p>}
          <button data-testid="start-btn" className="start-btn" onClick={handleStart} disabled={!sessionId || isLoading}>
            {isLoading ? 'Starting...' : 'Start'}
          </button>
        </div>
      )
    }

    return (
      <>
        <MessageList
          messages={messages}
          onAskSubmit={handleAskSubmit}
          scrollRef={scrollRef}
          isLoading={isLoading}
          isPaused={isPaused}
          isReconnecting={isReconnecting}
        />
        {sessionDone && !sessionError && (
          <div data-testid="session-done-banner" className="session-done-banner">
            <span>You can continue this session by sending a message</span>
          </div>
        )}
      </>
    )
  }

  return (
    <div data-testid="chat-container" className={`app-layout${sidebarOpen ? '' : ' sidebar-collapsed'}`}>
      <SessionSidebar
        currentSessionId={sessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onToggle={() => setSidebarOpen(prev => !prev)}
      />

      <div data-testid="main-area" className="main-area">
        <header data-testid="app-header" className="app-header">
          <button data-testid="sidebar-toggle" className="sidebar-toggle" onClick={() => setSidebarOpen(prev => !prev)} title="Session history" aria-label="Toggle session history">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
              <line x1="3" y1="5" x2="15" y2="5" />
              <line x1="3" y1="9" x2="15" y2="9" />
              <line x1="3" y1="13" x2="15" y2="13" />
            </svg>
          </button>
          <h1 title={`v${__APP_VERSION__}`}>{apps.length > 1 && selectedAppId === null ? '' : appConfig.title}</h1>
          {appConfig.model && (apps.length <= 1 || selectedAppId !== null) && (
            <span
              className={`model-badge model-badge--${appConfig.model}`}
              data-testid="session-model-badge"
              title={`Model: ${appConfig.model === 'opus' ? 'Claude Opus' : 'Claude Sonnet'}`}
            >
              {appConfig.model === 'opus' ? 'Opus' : 'Sonnet'}
            </span>
          )}
          <span className="user-identity">{user?.email}</span>
          {user?.is_admin && <a href="/admin" className="header-pill">Admin</a>}
          <button className="header-pill header-pill--danger" onClick={logout} title="Выйти">Выйти</button>
        </header>

        {sessionError && (
          <div className="session-error-banner">
            <span>Session interrupted</span>
            <div className="session-error-actions">
              <button onClick={handleRetry} disabled={isLoading}>{isLoading ? 'Continuing...' : 'Continue'}</button>
              <button onClick={handleNewSession}>New Session</button>
            </div>
          </div>
        )}

        <div data-testid="chat-content" className="chat-content">
          {renderMainContent()}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 8px' }}>
          <TokenCounter usage={tokenUsage} />
          <span className="build-version" style={{ margin: 0 }}>v{__APP_VERSION__}-{__GIT_HASH__}</span>
        </div>
      </div>
    </div>
  )
}
