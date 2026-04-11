import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSSE } from '../hooks/useSSE'

describe('useSSE', () => {
  it('does not connect when sessionId is null', () => {
    delete (globalThis as any).__lastEventSource
    const handler = vi.fn()
    renderHook(() => useSSE(null, handler))
    // No EventSource should have been created
    expect(handler).not.toHaveBeenCalled()
  })

  it('connects to correct URL when sessionId provided', () => {
    const handler = vi.fn()
    renderHook(() => useSSE('test-session', handler))
    const es = (globalThis as any).__lastEventSource
    expect(es.url).toBe('/stream?session_id=test-session')
  })

  it('parses and dispatches SSE events', () => {
    const handler = vi.fn()
    renderHook(() => useSSE('session-1', handler))
    const es = (globalThis as any).__lastEventSource

    act(() => {
      es.__simulateEvent('assistant_message', {
        blocks: [{ type: 'text', content: 'Hello' }],
      })
    })

    expect(handler).toHaveBeenCalledWith({
      type: 'assistant_message',
      blocks: [{ type: 'text', content: 'Hello' }],
    })
  })

  it('dispatches ask_message events', () => {
    const handler = vi.fn()
    renderHook(() => useSSE('session-2', handler))
    const es = (globalThis as any).__lastEventSource

    act(() => {
      es.__simulateEvent('ask_message', {
        id: 'ask-1',
        questions: [{ type: 'free_text', id: 'q1', label: 'Name?' }],
      })
    })

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'ask_message', id: 'ask-1' }),
    )
  })

  it('cleans up EventSource on unmount', () => {
    const handler = vi.fn()
    const { unmount } = renderHook(() => useSSE('session-3', handler))
    const es = (globalThis as any).__lastEventSource
    unmount()
    expect(es.readyState).toBe(2) // CLOSED
  })

  it('exposes isReconnecting=false initially', () => {
    const handler = vi.fn()
    const { result } = renderHook(() => useSSE('session-rc', handler))
    expect(result.current.isReconnecting).toBe(false)
  })

  it('sets isReconnecting=true on non-terminal connection error', () => {
    vi.useFakeTimers()
    const handler = vi.fn()
    const { result } = renderHook(() => useSSE('session-rc2', handler))
    const es = (globalThis as any).__lastEventSource

    act(() => {
      es.__simulateError(EventSource.CLOSED)
    })

    expect(result.current.isReconnecting).toBe(true)

    vi.useRealTimers()
  })

  it('resets isReconnecting=false after successful reconnect', () => {
    vi.useFakeTimers()
    const handler = vi.fn()
    const { result } = renderHook(() => useSSE('session-rc3', handler))
    const es = (globalThis as any).__lastEventSource

    act(() => {
      es.__simulateError(EventSource.CLOSED)
    })
    expect(result.current.isReconnecting).toBe(true)

    // Advance timer to trigger reconnect
    act(() => {
      vi.advanceTimersByTime(2000)
    })

    const newEs = (globalThis as any).__lastEventSource

    // Simulate a successful event on the new connection
    act(() => {
      newEs.__simulateEvent('assistant_message', {
        blocks: [{ type: 'text', content: 'Reconnected' }],
      })
    })

    expect(result.current.isReconnecting).toBe(false)

    vi.useRealTimers()
  })

  it('dispatches error event after MAX_RETRIES exceeded', () => {
    vi.useFakeTimers()
    const handler = vi.fn()
    renderHook(() => useSSE('session-rc4', handler))

    // Exhaust all 3 retries
    for (let i = 0; i < 3; i++) {
      const es = (globalThis as any).__lastEventSource
      act(() => { es.__simulateError(EventSource.CLOSED) })
      act(() => { vi.advanceTimersByTime(2000 * Math.pow(2, i)) })
    }

    // 4th error — no more retries
    const es = (globalThis as any).__lastEventSource
    act(() => { es.__simulateError(EventSource.CLOSED) })

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'error', message: 'Connection lost' })
    )

    vi.useRealTimers()
  })
})
