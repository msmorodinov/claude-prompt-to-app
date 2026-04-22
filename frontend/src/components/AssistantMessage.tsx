import type { ChatAssistantMessage } from '../types'
import MarkdownContent from './MarkdownContent'
import WidgetRenderer from './WidgetRenderer'

interface Props {
  message: ChatAssistantMessage
  sessionId?: string
}

export default function AssistantMessage({ message, sessionId }: Props) {
  return (
    <div className="message assistant-message" data-testid="assistant-message">
      {message.blocks.map((block, i) => (
        <WidgetRenderer key={i} widget={block} sessionId={sessionId} />
      ))}
      {message.streamText && (
        <div className="stream-text">
          <MarkdownContent text={message.streamText} />
          {message.streaming && <span className="cursor">|</span>}
        </div>
      )}
    </div>
  )
}
