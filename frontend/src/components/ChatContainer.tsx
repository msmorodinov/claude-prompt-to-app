import { useCallback, useEffect, useRef, useState } from 'react'
import { createSession, loadConfig, loadSession, retrySession, startChat, submitAnswers } from '../api'
import { historyToMessages, useChat } from '../hooks/useChat'
import { useSSE } from '../hooks/useSSE'
import MessageList from './MessageList'
import SessionSidebar from './SessionSidebar'

const SESSION_KEY = 'session_id'

export default function ChatContainer() {
  const [sessionId, setSessionId] = useState<string | null>(
    () => sessionStorage.getItem(SESSION_KEY),
  )
  const [appTitle, setAppTitle] = useState('App')
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [viewingSessionId, setViewingSessionId] = useState<string | null>(null)
  const [viewedMessages, setViewedMessages] = useState<ReturnType<typeof historyToMessages>>([])

  const [sessionError, setSessionError] = useState(false)
  const [sessionDone, setSessionDone] = useState(false)

  const { messages, setMessages, isLoading, setIsLoading, hasPendingAsk, handleSSEEvent, markAskAnswered, scrollRef } =
    useChat()

  const isViewingPast = viewingSessionId !== null && viewingSessionId !== sessionId

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

  useEffect(() => {
    loadConfig().then(c => setAppTitle(c.title))
  }, [])

  useEffect(() => {
    if (sessionId) return
    let cancelled = false
    createSession().then(({ session_id }) => {
      if (cancelled) return
      setSessionId(session_id)
      sessionStorage.setItem(SESSION_KEY, session_id)
    }).catch((err) => {
      console.error('Failed to create session:', err)
    })
    return () => { cancelled = true }
  }, [sessionId])

  const [hasHistory, setHasHistory] = useState<boolean | null>(null)
  const historyLoaded = useRef(false)
  useEffect(() => {
    if (!sessionId || historyLoaded.current) return
    historyLoaded.current = true
    loadSession(sessionId).then(history => {
      if (history.length > 0) {
        setMessages(historyToMessages(history))
        setHasHistory(true)
      } else {
        setHasHistory(false)
      }
    }).catch(err => {
      console.error('Failed to load session history:', err)
      setHasHistory(false)
    })
  }, [sessionId, setMessages])

  useSSE(sessionId, wrappedSSEEvent)

  const handleSend = useCallback(
    async (message: string) => {
      if (hasPendingAsk) return
      setSessionError(false)
      setIsLoading(true)
      try {
        const { session_id } = await startChat(message, sessionId ?? undefined)
        setSessionId(session_id)
      } catch (err: unknown) {
        // Session lost after server restart — create new and retry
        const is404 = err instanceof Error && err.message.includes('404')
        if (is404) {
          try {
            const { session_id: newId } = await createSession()
            setSessionId(newId)
            sessionStorage.setItem(SESSION_KEY, newId)
            historyLoaded.current = true
            const { session_id } = await startChat(message, newId)
            setSessionId(session_id)
            return
          } catch (retryErr) {
            console.error('Retry after new session failed:', retryErr)
          }
        }
        console.error('Failed to start chat:', err)
        setIsLoading(false)
      }
    },
    [sessionId, setIsLoading, hasPendingAsk],
  )

  const handleRetry = useCallback(async () => {
    if (!sessionId) return
    setSessionError(false)
    setSessionDone(false)
    setIsLoading(true)
    try {
      await retrySession(sessionId)
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
      } catch (err) {
        console.error('Failed to submit answers:', err)
      }
    },
    [sessionId, markAskAnswered, setIsLoading],
  )

  const handleSelectSession = useCallback(
    async (id: string) => {
      if (id === sessionId) {
        setViewingSessionId(null)
        setViewedMessages([])
        return
      }
      try {
        const history = await loadSession(id)
        setViewedMessages(historyToMessages(history))
        setViewingSessionId(id)
      } catch (err) {
        console.error('Failed to load session:', err)
      }
    },
    [sessionId],
  )

  const handleNewSession = useCallback(async () => {
    try {
      const { session_id } = await createSession()
      setSessionId(session_id)
      sessionStorage.setItem(SESSION_KEY, session_id)
      setMessages([])
      setIsLoading(false)
      setHasHistory(false)
      setSessionError(false)
      setSessionDone(false)
      setViewingSessionId(null)
      setViewedMessages([])
      historyLoaded.current = false
      setSidebarOpen(false)
    } catch (err) {
      console.error('Failed to create session:', err)
    }
  }, [setMessages, setIsLoading])

  const handleBackToCurrent = useCallback(() => {
    setViewingSessionId(null)
    setViewedMessages([])
  }, [])

  const isSessionLoading = hasHistory === null
  const showStartScreen = !isSessionLoading && hasHistory === false && messages.length === 0 && !isLoading && !isViewingPast

  const handleStart = useCallback(() => {
    handleSend('start')
  }, [handleSend])

  const displayMessages = isViewingPast ? viewedMessages : messages

  return (
    <div className="chat-container">
      <SessionSidebar
        currentSessionId={isViewingPast ? viewingSessionId : sessionId}
        onSelectSession={handleSelectSession}
        onNewSession={handleNewSession}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
      />

      {isViewingPast && (
        <div className="readonly-banner">
          <span>Viewing past session</span>
          <button onClick={handleBackToCurrent}>Back to current</button>
        </div>
      )}

      {sessionError && !isViewingPast && (
        <div className="session-error-banner">
          <span>Session interrupted</span>
          <div className="session-error-actions">
            <button onClick={handleRetry}>Continue</button>
            <button onClick={handleNewSession}>New Session</button>
          </div>
        </div>
      )}

      {isSessionLoading ? (
        <div className="start-screen">
          <p className="loading-text">Loading...</p>
        </div>
      ) : showStartScreen ? (
        <div className="start-screen">
          <h2>Ready to begin?</h2>
          <button className="start-btn" onClick={handleStart}>
            Start
          </button>
        </div>
      ) : (
        <>
          <MessageList
            messages={displayMessages}
            onAskSubmit={handleAskSubmit}
            scrollRef={scrollRef}
            isLoading={!isViewingPast && isLoading}
            title={appTitle}
            readOnly={isViewingPast}
            onToggleSidebar={() => setSidebarOpen(true)}
          />
          {!isViewingPast && sessionDone && !sessionError && (
            <div className="session-done-banner">
              <span>Session complete</span>
              <button className="start-btn" onClick={handleNewSession}>New Session</button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
