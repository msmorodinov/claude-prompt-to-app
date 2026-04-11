import type { ChatMessage } from '../types'
import AssistantMessage from './AssistantMessage'
import AskMessage from './AskMessage'
import UserMessage from './UserMessage'

interface Props {
  messages: ChatMessage[]
  onAskSubmit: (askId: string, answers: Record<string, unknown>) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  isLoading: boolean
  isPaused?: boolean
  isReconnecting?: boolean
}

export default function MessageList({ messages, onAskSubmit, scrollRef, isLoading, isPaused, isReconnecting }: Props) {
  return (
    <div className="message-list" data-testid="message-list">
      {messages.map((msg, i) => {
        switch (msg.role) {
          case 'assistant':
            return <AssistantMessage key={i} message={msg} />
          case 'ask':
            return <AskMessage key={i} message={msg} onSubmit={onAskSubmit} />
          case 'user': {
            // Find preceding ask message to get question labels
            let questions: import('../types').InputQuestion[] | undefined
            for (let j = i - 1; j >= 0; j--) {
              if (messages[j].role === 'ask') {
                questions = (messages[j] as import('../types').ChatAskMessage).questions
                break
              }
            }
            return <UserMessage key={i} message={msg} questions={questions} />
          }
          case 'research':
            return (
              <div key={i} className={`message research-message ${msg.done ? 'done' : 'loading'}`}>
                <span className="research-indicator">{msg.done ? '✓' : '◎'}</span>
                <span>{msg.label}</span>
              </div>
            )
        }
      })}
      {isReconnecting && (
        <div className="message research-message loading" data-testid="reconnecting-banner">
          <span className="research-indicator">◎</span>
          <span>Reconnecting...</span>
        </div>
      )}
      {isLoading && !isReconnecting && (
        <div className="message research-message loading">
          <span className="research-indicator">◎</span>
          <span>Thinking...</span>
        </div>
      )}
      {isPaused && (
        <div className="message research-message done">
          <span className="research-indicator">⏸</span>
          <span>Сессия приостановлена. Вы можете продолжить ответ.</span>
        </div>
      )}
      <div ref={scrollRef} />
    </div>
  )
}
