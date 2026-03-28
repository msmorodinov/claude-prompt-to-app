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
  value,
  onChange,
  disabled,
}: Props) {
  const options = useMemo(() => rawOptions.map(normalizeOption), [rawOptions])
  const toggle = (opt: string) => {
    if (value.includes(opt)) {
      onChange(value.filter((v) => v !== opt))
    } else {
      onChange([...value, opt])
    }
  }

  return (
    <div className="widget widget-multi-select">
      <label className="question-label">{label}</label>
      <div className="options">
        {options.map((opt) => (
          <label key={opt} className="option">
            <input
              type="checkbox"
              name={`${id}-${opt}`}
              checked={value.includes(opt)}
              onChange={() => toggle(opt)}
              disabled={disabled}
            />
            <span>{opt}</span>
          </label>
        ))}
      </div>
    </div>
  )
}
