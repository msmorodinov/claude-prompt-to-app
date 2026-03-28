interface Props {
  id: string
  label: string
  min: number
  max: number
  step?: number
  min_label?: string
  max_label?: string
  value: number
  onChange: (value: number) => void
  disabled?: boolean
}

export default function SliderScale({
  label,
  min,
  max,
  step = 1,
  min_label,
  max_label,
  value,
  onChange,
  disabled,
}: Props) {
  return (
    <div className="widget widget-slider-scale">
      <label className="question-label">{label}</label>
      <div className="slider-container">
        {min_label && <span className="slider-label-min">{min_label}</span>}
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          disabled={disabled}
        />
        {max_label && <span className="slider-label-max">{max_label}</span>}
      </div>
      <div className="slider-value">{value}</div>
    </div>
  )
}
