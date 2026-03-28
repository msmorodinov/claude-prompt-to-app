interface Props {
  content: string
}

export default function TextWidget({ content }: Props) {
  const text = content || ''
  if (!text) return null
  return <div className="widget widget-text">{text}</div>
}
