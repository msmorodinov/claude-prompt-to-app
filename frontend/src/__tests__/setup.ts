import '@testing-library/jest-dom'
import { vi } from 'vitest'

// Mock EventSource
class MockEventSource {
  url: string
  readyState = 0
  onopen: (() => void) | null = null
  onmessage: ((e: MessageEvent) => void) | null = null
  onerror: (() => void) | null = null
  private listeners: Record<string, ((e: MessageEvent) => void)[]> = {}

  static CONNECTING = 0
  static OPEN = 1
  static CLOSED = 2

  constructor(url: string) {
    this.url = url
    this.readyState = MockEventSource.OPEN
    // Store for test access
    ;(globalThis as any).__lastEventSource = this
  }

  addEventListener(type: string, handler: (e: MessageEvent) => void) {
    if (!this.listeners[type]) this.listeners[type] = []
    this.listeners[type].push(handler)
  }

  removeEventListener(type: string, handler: (e: MessageEvent) => void) {
    if (this.listeners[type]) {
      this.listeners[type] = this.listeners[type].filter((h) => h !== handler)
    }
  }

  // Helper for tests to simulate events
  __simulateEvent(type: string, data: any) {
    const event = new MessageEvent(type, { data: JSON.stringify(data) })
    if (this.listeners[type]) {
      for (const handler of this.listeners[type]) {
        handler(event)
      }
    }
  }

  __simulateError(readyState?: number) {
    if (readyState !== undefined) {
      this.readyState = readyState
    }
    if (this.onerror) {
      this.onerror()
    }
  }

  close() {
    this.readyState = MockEventSource.CLOSED
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
;(globalThis as any).EventSource = MockEventSource

// Mock navigator.clipboard (configurable so userEvent can override)
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn().mockResolvedValue(undefined),
    readText: vi.fn().mockResolvedValue(''),
    read: vi.fn().mockResolvedValue([]),
    write: vi.fn().mockResolvedValue(undefined),
  },
  writable: true,
  configurable: true,
})
