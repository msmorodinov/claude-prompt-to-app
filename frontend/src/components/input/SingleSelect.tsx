import { useMemo, useState } from 'react'
import type { SelectOption } from '../../types'
import { normalizeOption } from '../../types'

interface Props {
  id: string
  label: string
  options: SelectOption[]
  allow_custom?: boolean
  value: string | undefined
  onChange: (value: string) => void
  disabled?: boolean
}

export default function SingleSelect({
  id,
  label,
  options: rawOptions,
  allow_custom,
  value,
  onChange,
  disabled,
}: Props) {
  const options = useMemo(() => rawOptions.map(normalizeOption), [rawOptions])
  const [customValue, setCustomValue] = useState('')
  const isCustomSelected = value !== undefined && !options.includes(value)

  return (
    <div className="widget widget-single-select">
      <label className="question-label">{label}</label>
      <div className="options">
        {options.map((opt) => (
          <label key={opt} className="option">
            <input
              type="radio"
              name={id}
              value={opt}
              checked={value === opt}
              onChange={() => onChange(opt)}
              disabled={disabled}
            />
            <span>{opt}</span>
          </label>
        ))}
        {allow_custom && (
          <label className="option custom-option">
            <input
              type="radio"
              name={id}
              checked={isCustomSelected}
              onChange={() => onChange(customValue || '')}
              disabled={disabled}
            />
            <input
              type="text"
              placeholder="Other..."
              value={isCustomSelected ? value : customValue}
              onChange={(e) => {
                setCustomValue(e.target.value)
                if (isCustomSelected) {
                  onChange(e.target.value)
                }
              }}
              onFocus={() => onChange(customValue || '')}
              disabled={disabled}
            />
          </label>
        )}
      </div>
    </div>
  )
}
