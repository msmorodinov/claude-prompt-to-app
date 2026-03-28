interface Props {
  metrics: Array<{
    label: string
    value: number
    max: number
  }>
}

export default function StrengthMeter({ metrics }: Props) {
  const items = Array.isArray(metrics) ? metrics : []
  if (items.length === 0) return null

  return (
    <div className="widget widget-strength-meter">
      {items.map((metric, i) => {
        const max = metric.max || 1
        const value = metric.value ?? 0
        return (
          <div key={metric.label || i} className="metric">
            <div className="metric-header">
              <span className="metric-label">{metric.label}</span>
              <span className="metric-value">
                {value}/{max}
              </span>
            </div>
            <div className="meter-track">
              <div
                className="meter-fill"
                style={{ width: `${(value / max) * 100}%` }}
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}
