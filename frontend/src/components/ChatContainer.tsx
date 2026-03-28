import { useCallback, useState } from 'react'
import { startChat, submitAnswers } from '../api'
import { useChat } from '../hooks/useChat'
import { useSSE } from '../hooks/useSSE'
import MessageList from './MessageList'
import InputArea from './InputArea'

export default function ChatContainer() {
  const [sessionId, setSessionId] = useState<string | null>(null)
  const { messages, isLoading, setIsLoading, handleSSEEvent, markAskAnswered, scrollRef } =
    useChat()

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
      />
      <InputArea onSend={handleSend} disabled={isLoading} />
    </div>
  )
}
