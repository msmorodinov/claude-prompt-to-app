import { useCallback, useEffect, useRef } from 'react'
import type { SSEEvent } from '../types'
import { createSSEUrl } from '../api'

export type SSEHandler = (event: SSEEvent) => void

const EVENT_TYPES = [
  'assistant_message',
  'ask_message',
  'user_message',
  'research_start',
  'research_done',
  'stream_delta',
  'done',
  'error',
] as const

interface UseSSEOptions {
  urlFactory?: (sessionId: string) => string
}

export function useSSE(
  sessionId: string | null,
  onEvent: SSEHandler,
  options?: UseSSEOptions,
) {
  const eventSourceRef = useRef<EventSource | null>(null)
  const onEventRef = useRef(onEvent)
  onEventRef.current = onEvent
  const urlFactoryRef = useRef(options?.urlFactory ?? createSSEUrl)
  urlFactoryRef.current = options?.urlFactory ?? createSSEUrl

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!sessionId) return

    const url = urlFactoryRef.current(sessionId)
    const es = new EventSource(url)
    eventSourceRef.current = es

    let receivedTerminal = false

    for (const eventType of EVENT_TYPES) {
      es.addEventListener(eventType, (e: MessageEvent) => {
        if (eventType === 'done' || eventType === 'error') {
          receivedTerminal = true
        }
        try {
          const data = JSON.parse(e.data)
          onEventRef.current({ type: eventType, ...data } as SSEEvent)
        } catch {
          console.error('Failed to parse SSE event:', e.data)
        }
      })
    }

    es.onerror = () => {
      if (es.readyState === EventSource.CLOSED) {
        if (!receivedTerminal) {
          onEventRef.current({ type: 'error', message: 'Connection lost' } as SSEEvent)
        }
        disconnect()
      }
    }

    return () => {
      es.close()
      eventSourceRef.current = null
    }
  }, [sessionId, disconnect])

  return { disconnect }
}
