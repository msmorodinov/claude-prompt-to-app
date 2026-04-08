import type { ChatAssistantMessage } from '../types'
import MarkdownContent from './MarkdownContent'
import WidgetRenderer from './WidgetRenderer'

interface Props {
  message: ChatAssistantMessage
}

export default function AssistantMessage({ message }: Props) {
  return (
    <div className="message assistant-message" data-testid="assistant-message">
      {message.blocks.map((block, i) => (
        <WidgetRenderer key={i} widget={block} />
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
