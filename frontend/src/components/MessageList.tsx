import type { ChatMessage } from '../types'
import AssistantMessage from './AssistantMessage'
import AskMessage from './AskMessage'
import UserMessage from './UserMessage'

interface Props {
  messages: ChatMessage[]
  onAskSubmit: (askId: string, answers: Record<string, unknown>) => void
  scrollRef: React.RefObject<HTMLDivElement | null>
  isLoading: boolean
  title?: string
  readOnly?: boolean
}

export default function MessageList({ messages, onAskSubmit, scrollRef, isLoading, title, readOnly }: Props) {
  return (
    <div className="message-list">
      <header className="app-header">
        <h1>{title ?? 'App'}</h1>
      </header>
      {messages.map((msg, i) => {
        switch (msg.role) {
          case 'assistant':
            return <AssistantMessage key={i} message={msg} />
          case 'ask':
            return <AskMessage key={i} message={msg} onSubmit={onAskSubmit} readOnly={readOnly} />
          case 'user':
            return <UserMessage key={i} message={msg} />
          case 'research':
            return (
              <div key={i} className={`message research-message ${msg.done ? 'done' : 'loading'}`}>
                <span className="research-indicator">{msg.done ? '✓' : '◎'}</span>
                <span>{msg.label}</span>
              </div>
            )
        }
      })}
      {isLoading && (
        <div className="message research-message loading">
          <span className="research-indicator">◎</span>
          <span>Thinking...</span>
        </div>
      )}
      <div ref={scrollRef} />
    </div>
  )
}
