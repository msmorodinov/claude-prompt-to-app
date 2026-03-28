interface Props {
  content: string
}

export default function FinalResult({ content }: Props) {
  const text = content || ''
  if (!text) return null
  return (
    <div className="widget widget-final-result">
      <div className="final-result-content">{text}</div>
    </div>
  )
}
