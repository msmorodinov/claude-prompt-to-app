import { useState } from 'react'

interface Props {
  onSend: (message: string) => void
  disabled?: boolean
}

export default function InputArea({ onSend, disabled }: Props) {
  const [input, setInput] = useState('')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = input.trim()
    if (!trimmed || disabled) return
    onSend(trimmed)
    setInput('')
  }

  return (
    <form className="input-area" onSubmit={handleSubmit}>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Type a message..."
        disabled={disabled}
      />
      <button type="submit" disabled={disabled || !input.trim()}>
        Send
      </button>
    </form>
  )
}
