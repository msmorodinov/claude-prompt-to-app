import MarkdownContent from '../MarkdownContent'

interface Props {
  content: string
}

export default function FinalResult({ content }: Props) {
  if (!content) return null
  return (
    <div className="widget widget-final-result" data-testid="widget-final-result">
      <MarkdownContent text={content} className="final-result-content" />
    </div>
  )
}
