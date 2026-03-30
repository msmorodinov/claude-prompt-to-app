import { useCallback, useEffect, useRef, useState } from 'react'
import { createSession, loadConfig, loadSession, startChat, submitAnswers } from '../api'
import { historyToMessages, useChat } from '../hooks/useChat'
import { useSSE } from '../hooks/useSSE'
import MessageList from './MessageList'
import InputArea from './InputArea'
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

  const { messages, setMessages, isLoading, setIsLoading, hasPendingAsk, handleSSEEvent, markAskAnswered, scrollRef } =
    useChat()

  const isViewingPast = viewingSessionId !== null && viewingSessionId !== sessionId

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

  useSSE(sessionId, handleSSEEvent)

  const handleSend = useCallback(
    async (message: string) => {
      if (hasPendingAsk) return
      setIsLoading(true)
      try {
        const { session_id } = await startChat(message, sessionId ?? undefined)
        setSessionId(session_id)
      } catch (err) {
        console.error('Failed to start chat:', err)
        setIsLoading(false)
      }
    },
    [sessionId, setIsLoading, hasPendingAsk],
  )

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

  const showStartScreen = hasHistory === false && messages.length === 0 && !isLoading && !isViewingPast

  const handleStart = useCallback(() => {
    handleSend('start')
  }, [handleSend])

  const displayMessages = isViewingPast ? viewedMessages : messages

  return (
    <div className="chat-container">
      <button
        className="sidebar-toggle"
        onClick={() => setSidebarOpen(true)}
        title="Session history"
      >
        &#9776;
      </button>

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

      {showStartScreen ? (
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
          />
          {!isViewingPast && !hasPendingAsk && !isLoading && <InputArea onSend={handleSend} />}
        </>
      )}
    </div>
  )
}
