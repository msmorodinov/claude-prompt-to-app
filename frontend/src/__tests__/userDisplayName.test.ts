import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { generateDisplayName, getUserDisplayName } from '../userDisplayName'

const DISPLAY_NAME_KEY = 'user_display_name'

beforeEach(() => {
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('generateDisplayName()', () => {
  it('returns a non-empty string', () => {
    const name = generateDisplayName('abc123')
    expect(typeof name).toBe('string')
    expect(name.length).toBeGreaterThan(0)
  })

  it('is deterministic — same userId always produces same name', () => {
    const name1 = generateDisplayName('user-abc-def')
    const name2 = generateDisplayName('user-abc-def')
    expect(name1).toBe(name2)
  })

  it('produces different names for different userIds', () => {
    const names = new Set([
      generateDisplayName('aaa111'),
      generateDisplayName('bbb222'),
      generateDisplayName('ccc333'),
      generateDisplayName('ddd444'),
    ])
    // With 900 combinations it's essentially impossible for all 4 to collide
    expect(names.size).toBeGreaterThan(1)
  })

  it('produces a two-word name with a space', () => {
    const name = generateDisplayName('test-user-id')
    expect(name).toMatch(/^\S+ \S+$/)
  })
})

describe('getUserDisplayName()', () => {
  it('generates a name when localStorage is empty', () => {
    const name = getUserDisplayName()
    expect(typeof name).toBe('string')
    expect(name.length).toBeGreaterThan(0)
  })

  it('stores the generated name in localStorage', () => {
    getUserDisplayName()
    expect(localStorage.getItem(DISPLAY_NAME_KEY)).not.toBeNull()
  })

  it('returns the cached name on subsequent calls', () => {
    const first = getUserDisplayName()
    const second = getUserDisplayName()
    expect(first).toBe(second)
  })

  it('returns the cached value if already set in localStorage', () => {
    localStorage.setItem(DISPLAY_NAME_KEY, 'Cached Name')
    const name = getUserDisplayName()
    expect(name).toBe('Cached Name')
  })
})
