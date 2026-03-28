interface Props {
  label: string
  percent: number
}

export default function ProgressBar({ label, percent }: Props) {
  const clamped = Math.min(100, Math.max(0, Number.isFinite(percent) ? percent : 0))

  return (
    <div className="widget widget-progress">
      <div className="progress-label">{label}</div>
      <div className="progress-track">
        <div className="progress-fill" style={{ width: `${clamped}%` }} />
      </div>
      <div className="progress-percent">{Math.round(clamped)}%</div>
    </div>
  )
}
