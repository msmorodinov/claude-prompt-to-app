import type { ChatUserMessage, InputQuestion } from '../types'

interface Props {
  message: ChatUserMessage
  questions?: InputQuestion[]
}

export default function UserMessage({ message, questions }: Props) {
  const labelMap = new Map<string, string>()
  if (questions) {
    for (const q of questions) {
      labelMap.set(q.id, q.label)
    }
  }

  return (
    <div className="message user-message" data-testid="user-message">
      {Object.entries(message.answers).map(([key, val]) => {
        const label = labelMap.get(key)
        const displayValue = Array.isArray(val) ? val.join(', ') : String(val)
        return (
          <div key={key} className="answer-item">
            {label && <span className="answer-label">{label}</span>}
            <span className="answer-value">{displayValue}</span>
          </div>
        )
      })}
    </div>
  )
}
