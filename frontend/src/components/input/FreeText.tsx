interface Props {
  id: string
  label: string
  placeholder?: string
  max_words?: number
  multiline?: boolean
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}

export default function FreeText({
  label,
  placeholder,
  max_words,
  multiline = true,
  value,
  onChange,
  disabled,
}: Props) {
  const wordCount = value.trim() ? value.trim().split(/\s+/).length : 0

  return (
    <div className="widget widget-free-text">
      <label className="question-label">{label}</label>
      {multiline ? (
        <textarea
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          rows={4}
        />
      ) : (
        <input
          type="text"
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
        />
      )}
      {max_words !== undefined && (
        <div className={`word-count ${wordCount > max_words ? 'over' : ''}`}>
          {wordCount}/{max_words}
        </div>
      )}
    </div>
  )
}
