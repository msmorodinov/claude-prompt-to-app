interface Props {
  content: string
}

export default function FinalResult({ content }: Props) {
  if (!content) return null
  return (
    <div className="widget widget-final-result">
      <div className="final-result-content">{content}</div>
    </div>
  )
}
