import { useState } from 'react'

interface Props {
  content: string
  label?: string
}

export default function CopyableBlock({ content, label }: Props) {
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    await navigator.clipboard.writeText(content)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="widget widget-copyable" data-testid="widget-copyable">
      {label && <div className="copyable-label">{label}</div>}
      <pre className="copyable-content" data-testid="copyable-content">{content}</pre>
      <button onClick={handleCopy} className="copy-btn" data-testid="copy-btn">
        {copied ? 'Copied!' : 'Copy'}
      </button>
    </div>
  )
}
