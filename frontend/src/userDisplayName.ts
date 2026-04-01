import { getUserId } from './userId'

const DISPLAY_NAME_KEY = 'user_display_name'

const ADJECTIVES = [
  'Blue', 'Red', 'Gold', 'Silver', 'Jade', 'Amber', 'Coral', 'Ivory',
  'Onyx', 'Pearl', 'Ruby', 'Sage', 'Teal', 'Violet', 'White', 'Black',
  'Crisp', 'Dark', 'Deep', 'Dusk', 'Fern', 'Frost', 'Iron', 'Mist',
  'Moon', 'Nova', 'Pine', 'Sand', 'Star', 'Storm',
]

const NOUNS = [
  'Fox', 'Hawk', 'Wolf', 'Bear', 'Lynx', 'Deer', 'Hare', 'Crow',
  'Dove', 'Elk', 'Finch', 'Goat', 'Ibis', 'Jay', 'Kite', 'Lark',
  'Mink', 'Newt', 'Oryx', 'Puma', 'Quail', 'Raven', 'Swan', 'Toad',
  'Vole', 'Wren', 'Yak', 'Zebu', 'Crane', 'Eagle',
]

/**
 * Deterministic hash of a string to a number.
 * Uses djb2 algorithm for fast, uniform distribution.
 */
function djb2Hash(s: string): number {
  let hash = 5381
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) ^ s.charCodeAt(i)
    hash = hash >>> 0 // keep unsigned 32-bit
  }
  return hash
}

/**
 * Generate a deterministic human-friendly display name from a userId.
 * Same userId always produces the same "Adjective Noun" name.
 */
export function generateDisplayName(userId: string): string {
  const hash = djb2Hash(userId)
  const adjIdx = hash % ADJECTIVES.length
  const nounIdx = Math.floor(hash / ADJECTIVES.length) % NOUNS.length
  return `${ADJECTIVES[adjIdx]} ${NOUNS[nounIdx]}`
}

/**
 * Get the display name for the current user.
 * Reads from localStorage if cached; generates and caches if missing.
 */
export function getUserDisplayName(): string {
  const cached = localStorage.getItem(DISPLAY_NAME_KEY)
  if (cached) return cached

  const name = generateDisplayName(getUserId())
  localStorage.setItem(DISPLAY_NAME_KEY, name)
  return name
}
