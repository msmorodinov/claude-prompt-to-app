import { useState } from 'react'

interface Props {
  id: string
  label: string
  min_tags?: number
  max_tags?: number
  placeholder?: string
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}

export default function TagInput({
  label,
  max_tags,
  placeholder = 'Type and press Enter',
  value,
  onChange,
  disabled,
}: Props) {
  const [input, setInput] = useState('')

  const addTag = () => {
    const tag = input.trim()
    if (!tag || value.includes(tag)) return
    if (max_tags && value.length >= max_tags) return
    onChange([...value, tag])
    setInput('')
  }

  const removeTag = (tag: string) => {
    if (disabled) return
    onChange(value.filter((v) => v !== tag))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      addTag()
    }
  }

  return (
    <div className="widget widget-tag-input" data-testid="widget-tag-input">
      <label className="question-label">{label}</label>
      <div className="tags">
        {value.map((tag) => (
          <span key={tag} className="tag" data-testid="tag">
            {tag}
            {!disabled && (
              <button onClick={() => removeTag(tag)} className="tag-remove">
                ×
              </button>
            )}
          </span>
        ))}
      </div>
      {!disabled && (
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          disabled={max_tags !== undefined && value.length >= max_tags}
        />
      )}
      {max_tags !== undefined && (
        <p className="constraint-hint" data-testid="constraint-hint">
          {value.length >= max_tags
            ? `Maximum ${max_tags} tags reached`
            : `${value.length} / ${max_tags} tags`}
        </p>
      )}
    </div>
  )
}
