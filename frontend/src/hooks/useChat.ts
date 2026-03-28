import { useCallback, useRef, useState } from 'react'
import type {
  ChatAssistantMessage,
  ChatAskMessage,
  ChatMessage,
  ChatResearchMessage,
  ChatUserMessage,
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

  const handleSSEEvent = useCallback(
    (event: SSEEvent) => {
      switch (event.type) {
        case 'assistant_message': {
          const msg: ChatAssistantMessage = {
            role: 'assistant',
            blocks: event.blocks,
          }
          setMessages((prev) => [...prev, msg])
          scrollToBottom()
          break
        }
        case 'ask_message': {
          const msg: ChatAskMessage = {
            role: 'ask',
            id: event.id,
            preamble: event.preamble,
            questions: event.questions,
            answered: false,
          }
          setMessages((prev) => [...prev, msg])
          scrollToBottom()
          break
        }
        case 'user_message': {
          const msg: ChatUserMessage = {
            role: 'user',
            answers: event.answers,
          }
          setMessages((prev) => [...prev, msg])
          scrollToBottom()
          break
        }
        case 'research_start': {
          const msg: ChatResearchMessage = {
            role: 'research',
            label: event.label,
            done: false,
          }
          setMessages((prev) => [...prev, msg])
          break
        }
        case 'research_done': {
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
        }
        case 'stream_delta': {
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
            // Create new streaming message
            const msg: ChatAssistantMessage = {
              role: 'assistant',
              blocks: [],
              streaming: true,
              streamText: event.text,
            }
            return [...prev, msg]
          })
          scrollToBottom()
          break
        }
        case 'done': {
          setIsLoading(false)
          // Finalize any streaming message
          setMessages((prev) => {
            const last = prev[prev.length - 1]
            if (last?.role === 'assistant' && last.streaming) {
              const updated = [...prev]
              updated[updated.length - 1] = {
                ...last,
                streaming: false,
              }
              return updated
            }
            return prev
          })
          break
        }
        case 'error': {
          setIsLoading(false)
          console.error('Agent error:', event.message)
          break
        }
      }
    },
    [scrollToBottom],
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
