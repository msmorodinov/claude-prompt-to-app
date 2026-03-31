import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { getUserId } from '../userId'

describe('getUserId()', () => {
  let store: Record<string, string> = {}

  beforeEach(() => {
    store = {}
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => store[key] ?? null,
      setItem: (key: string, value: string) => { store[key] = value },
      removeItem: (key: string) => { delete store[key] },
      clear: () => { store = {} },
    })

    // Mock crypto.getRandomValues to produce deterministic bytes
    vi.stubGlobal('crypto', {
      getRandomValues: (buf: Uint8Array) => {
        for (let i = 0; i < buf.length; i++) buf[i] = i + 1
        return buf
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('generates a new ID when localStorage is empty', () => {
    const id = getUserId()
    expect(typeof id).toBe('string')
    expect(id.length).toBeGreaterThan(0)
  })

  it('generated ID is a hex string (12 chars for 6 bytes)', () => {
    const id = getUserId()
    expect(id).toMatch(/^[0-9a-f]+$/)
    expect(id).toHaveLength(12)
  })

  it('persists the generated ID to localStorage', () => {
    const id = getUserId()
    expect(store['user_id']).toBe(id)
  })

  it('returns the same ID on repeated calls', () => {
    const first = getUserId()
    const second = getUserId()
    expect(first).toBe(second)
  })

  it('returns existing ID from localStorage without generating a new one', () => {
    store['user_id'] = 'existing-id-abc'
    const id = getUserId()
    expect(id).toBe('existing-id-abc')
  })

  it('does not call getRandomValues when ID already exists', () => {
    store['user_id'] = 'already-there'
    const cryptoSpy = vi.spyOn(crypto, 'getRandomValues')
    getUserId()
    expect(cryptoSpy).not.toHaveBeenCalled()
  })

  it('generates different IDs across fresh stores (non-deterministic check via two instances)', () => {
    // First call generates from our deterministic mock → fixed value
    const id1 = getUserId()
    // Clear store and change mock to produce different bytes
    store = {}
    vi.stubGlobal('crypto', {
      getRandomValues: (buf: Uint8Array) => {
        for (let i = 0; i < buf.length; i++) buf[i] = 255 - i
        return buf
      },
    })
    const id2 = getUserId()
    expect(id1).not.toBe(id2)
  })
})
