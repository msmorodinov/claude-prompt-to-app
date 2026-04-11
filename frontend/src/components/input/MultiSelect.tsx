import { useMemo } from 'react'
import type { SelectOption } from '../../types'
import { normalizeOption } from '../../types'

interface Props {
  id: string
  label: string
  options: SelectOption[]
  min_select?: number
  max_select?: number
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}

export default function MultiSelect({
  id,
  label,
  options: rawOptions,
  min_select,
  max_select,
  value,
  onChange,
  disabled,
}: Props) {
  const options = useMemo(() => rawOptions.map(normalizeOption), [rawOptions])
  const atMax = max_select !== undefined && value.length >= max_select

  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt))
    } else {
      if (atMax) return
      onChange([...value, opt])
    }
  }

  const constraintText = (() => {
    if (max_select !== undefined) {
      const base = atMax ? `Maximum ${max_select} selected` : `Select up to ${max_select}`
      const minSuffix =
        min_select !== undefined && value.length < min_select
          ? ` (minimum ${min_select})`
          : ''
      return base + minSuffix
    }
    if (min_select !== undefined && value.length < min_select) {
      return `minimum ${min_select}`
    }
    return null
  })()

  return (
    <div className="widget widget-multi-select" data-testid="widget-multi-select">
      <label className="question-label">{label}</label>
      <div className="options">
        {options.map((opt) => (
          <label key={opt} className="option">
            <input
              type="checkbox"
              name={`${id}-${opt}`}
              checked={value.includes(opt)}
              onChange={() => toggle(opt)}
              disabled={disabled || (atMax && !value.includes(opt))}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
      {constraintText !== null && (
        <div className="constraint-hint" data-testid="constraint-hint">
          {constraintText}
        </div>
      )}
    </div>
  )
}
