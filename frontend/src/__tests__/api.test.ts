import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  request,
  startChat,
  submitAnswers,
  createSession,
  loadSession,
  listSessions,
  loadConfig,
  retrySession,
  createSSEUrl,
} from '../api'

// Mock getUserId so fetch headers are predictable
vi.mock('../userId', () => ({
  getUserId: () => 'test-user-id',
}))

const mockFetch = vi.fn()

beforeEach(() => {
  vi.stubGlobal('fetch', mockFetch)
  mockFetch.mockClear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

function makeResponse(body: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    json: vi.fn().mockResolvedValue(body),
  }
}

describe('request()', () => {
  it('sends correct headers including X-User-Id', async () => {
    mockFetch.mockResolvedValue(makeResponse({ ok: true }))
    await request('/test')
    expect(mockFetch).toHaveBeenCalledWith(
      '/test',
      expect.objectContaining({
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
          'X-User-Id': 'test-user-id',
        }),
      }),
    )
  })

  it('returns parsed JSON on success', async () => {
    mockFetch.mockResolvedValue(makeResponse({ data: 42 }))
    const result = await request<{ data: number }>('/test')
    expect(result).toEqual({ data: 42 })
  })

  it('throws on non-ok response (GET)', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, false, 404))
    await expect(request('/missing')).rejects.toThrow('GET /missing failed: 404')
  })

  it('throws on non-ok response (POST) with method in message', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, false, 500))
    await expect(
      request('/broken', { method: 'POST' }),
    ).rejects.toThrow('POST /broken failed: 500')
  })

  it('merges extra headers without losing Content-Type', async () => {
    mockFetch.mockResolvedValue(makeResponse({}))
    await request('/test', { headers: { 'X-Custom': 'yes' } })
    const [, options] = mockFetch.mock.calls[0]
    expect(options.headers['Content-Type']).toBe('application/json')
    expect(options.headers['X-Custom']).toBe('yes')
  })
})

describe('startChat()', () => {
  it('POSTs to /chat with message and session_id', async () => {
    mockFetch.mockResolvedValue(makeResponse({ session_id: 'sess-1' }))
    const result = await startChat('hello', 'sess-1')
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/chat')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ message: 'hello', session_id: 'sess-1' })
    expect(result).toEqual({ session_id: 'sess-1' })
  })

  it('POSTs to /chat without session_id when omitted', async () => {
    mockFetch.mockResolvedValue(makeResponse({ session_id: 'new-sess' }))
    await startChat('hi')
    const [, opts] = mockFetch.mock.calls[0]
    // JSON.stringify omits undefined values
    expect(JSON.parse(opts.body)).toEqual({ message: 'hi' })
  })
})

describe('submitAnswers()', () => {
  it('POSTs to /answers with session_id, ask_id, answers', async () => {
    mockFetch.mockResolvedValue(makeResponse({}))
    await submitAnswers('sess-1', 'ask-1', { q1: 'yes' })
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/answers')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({
      session_id: 'sess-1',
      ask_id: 'ask-1',
      answers: { q1: 'yes' },
    })
  })

  it('throws when response is not ok', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, false, 400))
    await expect(submitAnswers('s', 'a', {})).rejects.toThrow()
  })
})

describe('createSession()', () => {
  it('POSTs to /sessions/create', async () => {
    mockFetch.mockResolvedValue(makeResponse({ session_id: 'new-sess' }))
    const result = await createSession()
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/sessions/create')
    expect(opts.method).toBe('POST')
    expect(result).toEqual({ session_id: 'new-sess' })
  })
})

describe('loadSession()', () => {
  it('GETs /sessions/{id} and returns history', async () => {
    const history = [{ role: 'user', content: { text: 'hi' } }]
    mockFetch.mockResolvedValue(makeResponse(history))
    const result = await loadSession('sess-1')
    expect(mockFetch).toHaveBeenCalledWith('/sessions/sess-1', expect.anything())
    expect(result).toEqual(history)
  })

  it('returns empty array on fetch error (fallback)', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, false, 404))
    const result = await loadSession('missing-sess')
    expect(result).toEqual([])
  })

  it('returns empty array when fetch rejects', async () => {
    mockFetch.mockRejectedValue(new Error('network error'))
    const result = await loadSession('sess-x')
    expect(result).toEqual([])
  })
})

describe('listSessions()', () => {
  it('GETs /sessions and returns list', async () => {
    const sessions = [
      { id: 's1', created_at: '2024-01-01', title: 'Session 1', status: 'done', message_count: 3 },
    ]
    mockFetch.mockResolvedValue(makeResponse(sessions))
    const result = await listSessions()
    expect(mockFetch).toHaveBeenCalledWith('/sessions', expect.anything())
    expect(result).toEqual(sessions)
  })

  it('throws when response is not ok', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, false, 500))
    await expect(listSessions()).rejects.toThrow()
  })
})

describe('loadConfig()', () => {
  it('GETs /config and returns app config', async () => {
    mockFetch.mockResolvedValue(makeResponse({ title: 'My App', subtitle: 'Sub' }))
    const result = await loadConfig()
    expect(mockFetch).toHaveBeenCalledWith('/config', expect.anything())
    expect(result).toEqual({ title: 'My App', subtitle: 'Sub' })
  })

  it('returns fallback { title: "App" } on fetch error', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, false, 500))
    const result = await loadConfig()
    expect(result).toEqual({ title: 'App' })
  })

  it('returns fallback when fetch rejects', async () => {
    mockFetch.mockRejectedValue(new Error('network down'))
    const result = await loadConfig()
    expect(result).toEqual({ title: 'App' })
  })
})

describe('retrySession()', () => {
  it('POSTs to /chat/retry with session_id', async () => {
    mockFetch.mockResolvedValue(makeResponse({ session_id: 'sess-1' }))
    const result = await retrySession('sess-1')
    const [url, opts] = mockFetch.mock.calls[0]
    expect(url).toBe('/chat/retry')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body)).toEqual({ session_id: 'sess-1' })
    expect(result).toEqual({ session_id: 'sess-1' })
  })

  it('throws when response is not ok', async () => {
    mockFetch.mockResolvedValue(makeResponse(null, false, 500))
    await expect(retrySession('sess-1')).rejects.toThrow()
  })
})

describe('createSSEUrl()', () => {
  it('returns correct SSE URL with session_id', () => {
    expect(createSSEUrl('abc-123')).toBe('/stream?session_id=abc-123')
  })

  it('handles session_id with special characters', () => {
    expect(createSSEUrl('sess/01')).toBe('/stream?session_id=sess/01')
  })
})
