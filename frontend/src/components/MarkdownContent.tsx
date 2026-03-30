import { useMemo } from 'react'
import { marked } from 'marked'
import DOMPurify from 'dompurify'

interface Props {
  text: string
  className?: string
}

marked.setOptions({
  breaks: true,
  gfm: true,
})

export default function MarkdownContent({ text, className }: Props) {
  const html = useMemo(() => {
    const raw = marked.parse(text, { async: false })
    return DOMPurify.sanitize(raw)
  }, [text])

  return (
    <div
      className={`markdown-content ${className ?? ''}`}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}
