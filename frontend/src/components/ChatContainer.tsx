import { useCallback, useEffect, useRef, useState } from 'react'
import { createSession, loadSession, startChat, submitAnswers } from '../api'
import { historyToMessages, useChat } from '../hooks/useChat'
import { useSSE } from '../hooks/useSSE'
import MessageList from './MessageList'
import InputArea from './InputArea'

const SESSION_KEY = 'session_id'

export default function ChatContainer() {
  const [sessionId, setSessionId] = useState<string | null>(
    () => sessionStorage.getItem(SESSION_KEY),
  )
  const { messages, setMessages, isLoading, setIsLoading, handleSSEEvent, markAskAnswered, scrollRef } =
    useChat()

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

  const historyLoaded = useRef(false)
  useEffect(() => {
    if (!sessionId || historyLoaded.current) return
    historyLoaded.current = true
    loadSession(sessionId).then(history => {
      if (history.length > 0) {
        setMessages(historyToMessages(history))
      }
    }).catch(err => {
      console.error('Failed to load session history:', err)
    })
  }, [sessionId, setMessages])

  useSSE(sessionId, handleSSEEvent)

  const handleSend = useCallback(
    async (message: string) => {
      setIsLoading(true)
      try {
        const { session_id } = await startChat(message, sessionId ?? undefined)
        setSessionId(session_id)
      } catch (err) {
        console.error('Failed to start chat:', err)
        setIsLoading(false)
      }
    },
    [sessionId, setIsLoading],
  )

  const handleAskSubmit = useCallback(
    async (askId: string, answers: Record<string, unknown>) => {
      if (!sessionId) return
      try {
        await submitAnswers(sessionId, askId, answers)
        markAskAnswered(askId, answers)
      } catch (err) {
        console.error('Failed to submit answers:', err)
      }
    },
    [sessionId, markAskAnswered],
  )

  return (
    <div className="chat-container">
      <MessageList
        messages={messages}
        onAskSubmit={handleAskSubmit}
        scrollRef={scrollRef}
        isLoading={isLoading}
      />
      <InputArea onSend={handleSend} disabled={isLoading} />
    </div>
  )
}
