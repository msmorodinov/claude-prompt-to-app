import MarkdownContent from '../MarkdownContent'

interface Side {
  label: string
  content: string
}

interface Props {
  left: Side
  right: Side
  note?: string
  diff_note?: string
}

const EMPTY_SIDE: Side = { label: '', content: '' }

export default function Comparison({ left, right, note, diff_note }: Props) {
  const l = left ?? EMPTY_SIDE
  const r = right ?? EMPTY_SIDE
  const displayNote = note ?? diff_note

  return (
    <div className="widget widget-comparison" data-testid="widget-comparison">
      <div className="comparison-sides">
        <div className="side left">
          <div className="side-label">{l.label}</div>
          <div className="side-content">
            <MarkdownContent text={l.content} />
          </div>
        </div>
        <div className="side right">
          <div className="side-label">{r.label}</div>
          <div className="side-content">
            <MarkdownContent text={r.content} />
          </div>
        </div>
      </div>
      {displayNote && <div className="diff-note">{displayNote}</div>}
    </div>
  )
}
