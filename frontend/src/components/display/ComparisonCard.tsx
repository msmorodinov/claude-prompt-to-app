interface Side {
  label: string
  content: string
}

interface Props {
  left: Side
  right: Side
  diff_note?: string
}

const EMPTY_SIDE: Side = { label: '', content: '' }

export default function ComparisonCard({ left, right, diff_note }: Props) {
  const l = left ?? EMPTY_SIDE
  const r = right ?? EMPTY_SIDE

  return (
    <div className="widget widget-comparison-card">
      <div className="comparison-sides">
        <div className="side left">
          <div className="side-label">{l.label}</div>
          <div className="side-content">{l.content}</div>
        </div>
        <div className="side right">
          <div className="side-label">{r.label}</div>
          <div className="side-content">{r.content}</div>
        </div>
      </div>
      {diff_note && <div className="diff-note">{diff_note}</div>}
    </div>
  )
}
