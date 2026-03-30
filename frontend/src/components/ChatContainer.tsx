import { useCallback, useEffect, useRef, useState } from 'react'
import { createSession, loadConfig, loadSession, startChat, submitAnswers } from '../api'
import { historyToMessages, useChat } from '../hooks/useChat'
import { useSSE } from '../hooks/useSSE'
import MessageList from './MessageList'
import InputArea from './InputArea'

const SESSION_KEY = 'session_id'

export default function ChatContainer() {
  const [sessionId, setSessionId] = useState<string | null>(
    () => sessionStorage.getItem(SESSION_KEY),
  )
  const [appTitle, setAppTitle] = useState('App')
  const { messages, setMessages, isLoading, setIsLoading, hasPendingAsk, handleSSEEvent, markAskAnswered, scrollRef } =
    useChat()

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

  const showStartScreen = hasHistory === false && messages.length === 0 && !isLoading

  const handleStart = useCallback(() => {
    handleSend('start')
  }, [handleSend])

  return (
    <div className="chat-container">
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
            messages={messages}
            onAskSubmit={handleAskSubmit}
            scrollRef={scrollRef}
            isLoading={isLoading}
            title={appTitle}
          />
          {!hasPendingAsk && !isLoading && <InputArea onSend={handleSend} />}
        </>
      )}
    </div>
  )
}
