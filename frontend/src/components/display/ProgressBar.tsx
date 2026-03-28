interface Props {
  label: string
  percent: number
}

export default function ProgressBar({ label, percent }: Props) {
  const pct = Number.isFinite(percent) ? percent : 0
  return (
    <div className="widget widget-progress">
      <div className="progress-label">{label || ''}</div>
      <div className="progress-track">
        <div
          className="progress-fill"
          style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
        />
      </div>
      <div className="progress-percent">{Math.round(pct)}%</div>
    </div>
  )
}
