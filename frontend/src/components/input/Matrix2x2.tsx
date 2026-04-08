import { useState } from 'react'

interface Props {
  id: string
  label: string
  x_axis: string
  y_axis: string
  items: string[]
  value: Record<string, { x: number; y: number }>
  onChange: (value: Record<string, { x: number; y: number }>) => void
  disabled?: boolean
}

export default function Matrix2x2({
  label,
  x_axis,
  y_axis,
  items,
  value,
  onChange,
  disabled,
}: Props) {
  const [activeItem, setActiveItem] = useState<string | null>(null)
  const safeItems = Array.isArray(items) ? items : []
  const safeValue = value && typeof value === 'object' ? value : {}

  const handleClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled || !activeItem) return
    const rect = e.currentTarget.getBoundingClientRect()
    const x = Math.round(((e.clientX - rect.left) / rect.width) * 100)
    const y = Math.round((1 - (e.clientY - rect.top) / rect.height) * 100)
    onChange({ ...safeValue, [activeItem]: { x, y } })
  }

  return (
    <div className="widget widget-matrix-2x2" data-testid="widget-matrix-2x2">
      <label className="question-label">{label}</label>
      <div className="matrix-items">
        {safeItems.map((item) => (
          <button
            key={item}
            className={`matrix-item ${activeItem === item ? 'active' : ''} ${safeValue[item] ? 'placed' : ''}`}
            onClick={() => setActiveItem(item)}
            disabled={disabled}
          >
            {item}
          </button>
        ))}
      </div>
      <div className="matrix-grid" onClick={handleClick}>
        <div className="axis-label x-axis">{x_axis}</div>
        <div className="axis-label y-axis">{y_axis}</div>
        {Object.entries(safeValue).map(([name, pos]) => (
          <div
            key={name}
            className="matrix-point"
            style={{ left: `${pos.x}%`, bottom: `${pos.y}%` }}
            title={name}
          >
            {name.charAt(0)}
          </div>
        ))}
      </div>
    </div>
  )
}
