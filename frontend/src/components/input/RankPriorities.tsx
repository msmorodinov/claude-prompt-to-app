interface Props {
  id: string
  label: string
  items: string[]
  value: string[]
  onChange: (value: string[]) => void
  disabled?: boolean
}

export default function RankPriorities({
  label,
  value,
  onChange,
  disabled,
}: Props) {
  const moveUp = (index: number) => {
    if (index === 0 || disabled) return
    const newItems = [...value]
    ;[newItems[index - 1], newItems[index]] = [newItems[index], newItems[index - 1]]
    onChange(newItems)
  }

  const moveDown = (index: number) => {
    if (index === value.length - 1 || disabled) return
    const newItems = [...value]
    ;[newItems[index], newItems[index + 1]] = [newItems[index + 1], newItems[index]]
    onChange(newItems)
  }

  return (
    <div className="widget widget-rank-priorities">
      <label className="question-label">{label}</label>
      <ol className="rank-list">
        {value.map((item, i) => (
          <li key={item} className="rank-item">
            <span className="rank-number">{i + 1}</span>
            <span className="rank-text">{item}</span>
            <div className="rank-controls">
              <button
                onClick={() => moveUp(i)}
                disabled={i === 0 || disabled}
                className="rank-btn"
              >
                ↑
              </button>
              <button
                onClick={() => moveDown(i)}
                disabled={i === value.length - 1 || disabled}
                className="rank-btn"
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
