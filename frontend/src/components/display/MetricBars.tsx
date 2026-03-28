interface Props {
  metrics: Array<{
    label: string
    value: number
    max: number
    unit?: string
  }>
}

export default function MetricBars({ metrics }: Props) {
  const items = Array.isArray(metrics) ? metrics : []
  if (items.length === 0) return null

  return (
    <div className="widget widget-metric-bars">
      {items.map((metric, i) => {
        const max = metric.max || 1
        const value = metric.value ?? 0
        const display = metric.unit ? `${value}${metric.unit}` : `${value}/${max}`
        return (
          <div key={metric.label || i} className="metric">
            <div className="metric-header">
              <span className="metric-label">{metric.label}</span>
              <span className="metric-value">{display}</span>
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
