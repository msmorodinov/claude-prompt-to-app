import { useCallback, useEffect, useRef } from 'react'
import type { SSEEvent } from '../types'
import { createSSEUrl } from '../api'

type SSEHandler = (event: SSEEvent) => void

const EVENT_TYPES = [
  'assistant_message',
  'ask_message',
  'user_message',
  'research_start',
  'research_done',
  'stream_delta',
  'done',
  'error',
  'ask_timeout',
] as const

const TERMINAL_EVENTS = new Set(['done', 'error'])
const MAX_RETRIES = 3
const BACKOFF_BASE_MS = 2000

interface UseSSEOptions {
  urlFactory?: (sessionId: string) => string
  /** Change this value to force a reconnect without changing sessionId */
  reconnectKey?: number
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
  const reconnectKey = options?.reconnectKey ?? 0

  const disconnect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close()
      eventSourceRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!sessionId) return

    let receivedTerminal = false
    let retryCount = 0
    let retryTimer: ReturnType<typeof setTimeout> | null = null
    let cancelled = false

    function connect() {
      if (cancelled) return

      const url = urlFactoryRef.current(sessionId!)
      const es = new EventSource(url)
      eventSourceRef.current = es

      for (const eventType of EVENT_TYPES) {
        es.addEventListener(eventType, (e: MessageEvent) => {
          if (TERMINAL_EVENTS.has(eventType)) {
            receivedTerminal = true
          }
          // Reset retry counter on any data event
          retryCount = 0
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
          es.close()
          eventSourceRef.current = null

          if (receivedTerminal || cancelled) return

          if (retryCount < MAX_RETRIES) {
            const delay = BACKOFF_BASE_MS * Math.pow(2, retryCount)
            retryCount++
            retryTimer = setTimeout(connect, delay)
          } else {
            onEventRef.current({ type: 'error', message: 'Connection lost' } as SSEEvent)
          }
        }
      }
    }

    connect()

    return () => {
      cancelled = true
      if (retryTimer) clearTimeout(retryTimer)
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
        eventSourceRef.current = null
      }
    }
  }, [sessionId, reconnectKey])

  return { disconnect }
}
