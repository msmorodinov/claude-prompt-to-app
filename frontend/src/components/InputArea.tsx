import { useState } from 'react'

interface Props {
  onSend: (message: string) => void
}

export default function InputArea({ onSend }: Props) {
  const [input, setInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed) return
    onSend(trimmed)
    setInput('')
  }

  return (
    <form className="input-area" onSubmit={handleSubmit}>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask a follow-up..."
      />
      <button type="submit" disabled={!input.trim()}>
        Send
      </button>
    </form>
  )
}
