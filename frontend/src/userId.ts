const USER_ID_KEY = 'user_id'

export function getUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY)
  if (!id) {
    const bytes = new Uint8Array(6)
    crypto.getRandomValues(bytes)
    id = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
    localStorage.setItem(USER_ID_KEY, id)
  }
  return id
}
