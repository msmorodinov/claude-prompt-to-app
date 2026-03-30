import MarkdownContent from '../MarkdownContent'

interface Props {
  content: string
}

export default function TextWidget({ content }: Props) {
  if (!content) return null
  return (
    <div className="widget widget-text">
      <MarkdownContent text={content} />
    </div>
  )
}
