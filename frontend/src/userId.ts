const USER_ID_KEY = 'user_id'

export function getUserId(): string {
  let id = localStorage.getItem(USER_ID_KEY)
  if (!id) {
    id = crypto.randomUUID().replace(/-/g, '').slice(0, 12)
    localStorage.setItem(USER_ID_KEY, id)
  }
  return id
}
