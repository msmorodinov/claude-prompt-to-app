import { renderHook, act } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { useChat } from '../hooks/useChat'

describe('useChat', () => {
  it('starts with empty messages', () => {
    const { result } = renderHook(() => useChat())
    expect(result.current.messages).toEqual([])
    expect(result.current.isLoading).toBe(false)
  })

  it('handles assistant_message event', () => {
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.handleSSEEvent({
        type: 'assistant_message',
        blocks: [{ type: 'text', content: 'Hello' }],
      })
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].role).toBe('assistant')
  })

  it('handles ask_message event', () => {
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.handleSSEEvent({
        type: 'ask_message',
        id: 'ask-1',
        questions: [{ type: 'free_text', id: 'q1', label: 'Name?' }],
      })
    })
    expect(result.current.messages).toHaveLength(1)
    const msg = result.current.messages[0]
    expect(msg.role).toBe('ask')
    if (msg.role === 'ask') {
      expect(msg.answered).toBe(false)
    }
  })

  it('handles user_message event', () => {
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.handleSSEEvent({
        type: 'user_message',
        answers: { q1: 'Hello' },
      })
    })
    expect(result.current.messages).toHaveLength(1)
    expect(result.current.messages[0].role).toBe('user')
  })

  it('handles stream_delta - creates new streaming message', () => {
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.handleSSEEvent({ type: 'stream_delta', text: 'Hello ' })
    })
    expect(result.current.messages).toHaveLength(1)
    const msg = result.current.messages[0]
    if (msg.role === 'assistant') {
      expect(msg.streaming).toBe(true)
      expect(msg.streamText).toBe('Hello ')
    }
  })

  it('handles stream_delta - appends to existing streaming message', () => {
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.handleSSEEvent({ type: 'stream_delta', text: 'Hello ' })
    })
    act(() => {
      result.current.handleSSEEvent({ type: 'stream_delta', text: 'world' })
    })
    expect(result.current.messages).toHaveLength(1)
    const msg = result.current.messages[0]
    if (msg.role === 'assistant') {
      expect(msg.streamText).toBe('Hello world')
    }
  })

  it('handles done event - stops loading', () => {
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.setIsLoading(true)
    })
    act(() => {
      result.current.handleSSEEvent({ type: 'done' })
    })
    expect(result.current.isLoading).toBe(false)
  })

  it('handles research_start/done events', () => {
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.handleSSEEvent({
        type: 'research_start',
        label: 'Searching...',
      })
    })
    expect(result.current.messages).toHaveLength(1)
    if (result.current.messages[0].role === 'research') {
      expect(result.current.messages[0].done).toBe(false)
    }

    act(() => {
      result.current.handleSSEEvent({
        type: 'research_done',
        label: 'Done',
      })
    })
    if (result.current.messages[0].role === 'research') {
      expect(result.current.messages[0].done).toBe(true)
    }
  })

  it('markAskAnswered updates ask message', () => {
    const { result } = renderHook(() => useChat())
    act(() => {
      result.current.handleSSEEvent({
        type: 'ask_message',
        id: 'ask-1',
        questions: [{ type: 'free_text', id: 'q1', label: 'Name?' }],
      })
    })
    act(() => {
      result.current.markAskAnswered('ask-1', { q1: 'Alice' })
    })
    const msg = result.current.messages[0]
    if (msg.role === 'ask') {
      expect(msg.answered).toBe(true)
      expect(msg.answers).toEqual({ q1: 'Alice' })
    }
  })
})
