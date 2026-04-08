import type { ChatUserMessage } from '../types'

interface Props {
  message: ChatUserMessage
}

export default function UserMessage({ message }: Props) {
  return (
    <div className="message user-message" data-testid="user-message">
      {Object.entries(message.answers).map(([key, val]) => (
        <div key={key} className="answer-item">
          <span className="answer-value">{String(val)}</span>
        </div>
      ))}
    </div>
  )
}
