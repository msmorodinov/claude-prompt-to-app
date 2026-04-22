import type { ImageSelectQuestion } from '../../types'

interface Props {
  question: ImageSelectQuestion
  value: string | string[] | undefined
  onChange: (id: string, value: string | string[]) => void
  readOnly?: boolean
}

export default function ImageSelect({ question, value, onChange, readOnly }: Props) {
  const images = [...question.images].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))
  const isMulti = question.multi === true
  const selected: string[] = Array.isArray(value)
    ? value
    : value
      ? [value as string]
      : []

  const toggle = (imgId: string) => {
    if (readOnly) return
    if (isMulti) {
      const next = selected.includes(imgId)
        ? selected.filter((id) => id !== imgId)
        : [...selected, imgId]
      onChange(question.id, next)
    } else {
      onChange(question.id, imgId)
    }
  }

  return (
    <div className="image-select">
      <div className="image-select-label">{question.label}</div>
      <div className="image-select-grid">
        {images.map((img) => {
          const isSelected = selected.includes(img.id)
          return (
            <div
              key={img.id}
              className={`image-select-item ${isSelected ? 'selected' : ''} ${readOnly ? 'readonly' : ''}`}
              onClick={() => toggle(img.id)}
              role={isMulti ? 'checkbox' : 'radio'}
              aria-checked={isSelected}
              tabIndex={readOnly ? -1 : 0}
              onKeyDown={(e) => e.key === 'Enter' && toggle(img.id)}
              aria-label={img.caption || img.id}
            >
              <img
                src={img.url || img.file}
                alt={img.caption || img.id}
                className="image-select-thumb"
              />
              {isSelected && <div className="image-select-check">✓</div>}
              {img.caption && <p className="image-select-caption">{img.caption}</p>}
            </div>
          )
        })}
      </div>
    </div>
  )
}
