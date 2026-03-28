const BASE_URL = ''

export async function startChat(
  message: string,
  sessionId?: string,
): Promise<{ session_id: string }> {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, session_id: sessionId }),
  })
  if (!res.ok) {
    throw new Error(`Chat failed: ${res.status}`)
  }
  return res.json()
}

export async function submitAnswers(
  sessionId: string,
  askId: string,
  answers: Record<string, unknown>,
): Promise<void> {
  const res = await fetch(`${BASE_URL}/answers`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      session_id: sessionId,
      ask_id: askId,
      answers,
    }),
  })
  if (!res.ok) {
    throw new Error(`Submit answers failed: ${res.status}`)
  }
}

export function createSSEUrl(sessionId: string): string {
  return `${BASE_URL}/stream?session_id=${sessionId}`
}
