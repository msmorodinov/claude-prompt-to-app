import { useCallback, useRef, useState } from 'react'
import type {
  ChatAssistantMessage,
  ChatMessage,
  SSEEvent,
} from '../types'

export function useChat() {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  const scrollToBottom = useCallback(() => {
    requestAnimationFrame(() => {
      scrollRef.current?.scrollIntoView({ behavior: 'smooth' })
    })
  }, [])

  const appendMessage = useCallback(
    (msg: ChatMessage, scroll = true) => {
      setMessages((prev) => [...prev, msg])
      if (scroll) scrollToBottom()
    },
    [scrollToBottom],
  )

  const handleSSEEvent = useCallback(
    (event: SSEEvent) => {
      switch (event.type) {
        case 'assistant_message':
          appendMessage({ role: 'assistant', blocks: event.blocks })
          break

        case 'ask_message':
          appendMessage({
            role: 'ask',
            id: event.id,
            preamble: event.preamble,
            questions: event.questions,
            answered: false,
          })
          break

        case 'user_message':
          appendMessage({ role: 'user', answers: event.answers })
          break

        case 'research_start':
          appendMessage({ role: 'research', label: event.label, done: false }, false)
          break

        case 'research_done':
          setMessages((prev) => {
            const updated = [...prev]
            for (let i = updated.length - 1; i >= 0; i--) {
              const m = updated[i]
              if (m.role === 'research' && !m.done) {
                updated[i] = { ...m, done: true }
                break
              }
            }
            return updated
          })
          break

        case 'stream_delta':
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant' && last.streaming) {
              const updated = [...prev]
              updated[updated.length - 1] = {
                ...last,
                streamText: (last.streamText || '') + event.text,
              }
              return updated
            }
            return [
              ...prev,
              { role: 'assistant', blocks: [], streaming: true, streamText: event.text } as ChatAssistantMessage,
            ]
          })
          scrollToBottom()
          break

        case 'done':
          setIsLoading(false)
          setMessages((prev) =>
            prev.map((m) => {
              if (m.role === 'assistant' && m.streaming) return { ...m, streaming: false }
              if (m.role === 'research' && !m.done) return { ...m, done: true }
              return m
            }),
          )
          break

        case 'error':
          setIsLoading(false)
          setMessages((prev) => {
            const cleared = prev.map((m) => {
              if (m.role === 'research' && !m.done) return { ...m, done: true }
              return m
            })
            return [
              ...cleared,
              {
                role: 'assistant' as const,
                blocks: [{ type: 'text' as const, content: `Error: ${event.message}` }],
              },
            ]
          })
          break
      }
    },
    [appendMessage, scrollToBottom],
  )

  const markAskAnswered = useCallback(
    (askId: string, answers: Record<string, unknown>) => {
      setMessages((prev) =>
        prev.map((m) =>
          m.role === 'ask' && m.id === askId
            ? { ...m, answered: true, answers }
            : m,
        ),
      )
    },
    [],
  )

  return {
    messages,
    isLoading,
    setIsLoading,
    handleSSEEvent,
    markAskAnswered,
    scrollRef,
  }
}
