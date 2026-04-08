import { useEffect, useState } from 'react'
import { createAdminSSEUrl, fetchSessionHistory } from '../../api-admin'
import { historyToMessages, useChat } from '../../hooks/useChat'
import { useSSE } from '../../hooks/useSSE'
import MessageList from '../MessageList'

interface Props {
  sessionId: string
}

const noop = () => {}

export default function SessionViewer({ sessionId }: Props) {
  const { messages, setMessages, isLoading, setIsLoading, handleSSEEvent, scrollRef } =
    useChat()
  const [error, setError] = useState<string | null>(null)

  // Load history
  useEffect(() => {
    setMessages([])
    setIsLoading(true)
    setError(null)
    fetchSessionHistory(sessionId)
      .then((history) => {
        setMessages(historyToMessages(history))
        setIsLoading(false)
      })
      .catch((err) => {
        setError(String(err))
        setIsLoading(false)
      })
  }, [sessionId, setMessages, setIsLoading])

  // Subscribe to admin SSE (reuse shared hook with custom URL factory)
  useSSE(sessionId, handleSSEEvent, { urlFactory: createAdminSSEUrl })

  return (
    <div className="session-viewer" data-testid="session-viewer">
      <div className="viewer-header">
        <h3>Session: {sessionId}</h3>
        {error && <span className="viewer-error">{error}</span>}
      </div>
      <div className="viewer-messages">
        <MessageList
          messages={messages}
          onAskSubmit={noop}
          scrollRef={scrollRef}
          isLoading={isLoading}
        />
      </div>
    </div>
  )
}
