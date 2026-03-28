import { useMemo } from 'react'

interface Props {
  columns?: string[]
  rows?: string[][]
  caption?: string
  highlights?: Record<string, string[]>
}

function normalize(props: Props): { columns: string[]; rows: string[][] } {
  if (props.columns && props.rows) {
    return { columns: props.columns, rows: props.rows }
  }

  return { columns: [], rows: [] }
}

export default function DataTable(props: Props) {
  const { columns, rows } = useMemo(() => normalize(props), [props])

  if (columns.length === 0) {
    return null
  }

  return (
    <div className="widget widget-data-table">
      <div className="table-scroll-wrapper">
      <table>
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={col}>{col}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              {row.map((cell, j) => (
                <td key={j}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      </div>
      {props.caption && <div className="table-caption">{props.caption}</div>}
      {props.highlights && Object.keys(props.highlights).length > 0 && (
        <div className="highlights">
          {Object.entries(props.highlights).map(([label, items]) => (
            items.length > 0 && (
              <div key={label} className="highlight-group">
                <span className="label">
                  {label.charAt(0).toUpperCase() + label.slice(1).replace(/_/g, ' ')}:
                </span>{' '}
                {items.join(', ')}
              </div>
            )
          ))}
        </div>
      )}
    </div>
  )
}
