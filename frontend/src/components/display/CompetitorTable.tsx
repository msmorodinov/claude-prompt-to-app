import { useMemo } from 'react'

interface Competitor {
  name: string
  positioning?: string
  strengths?: string
  weakness?: string
  [key: string]: string | undefined
}

interface Props {
  columns?: string[]
  rows?: string[][]
  competitors?: Competitor[]
  highlights?: {
    table_stakes?: string[]
    white_space?: string[]
  }
}

/**
 * Claude may send competitor_table in two formats:
 * 1. {columns, rows} — explicit table
 * 2. {competitors: [{name, positioning, strengths, weakness, ...}]} — object array
 * We normalize both to columns/rows.
 */
function normalize(props: Props): { columns: string[]; rows: string[][] } {
  if (props.columns && props.rows) {
    return { columns: props.columns, rows: props.rows }
  }

  if (props.competitors && props.competitors.length > 0) {
    // Auto-detect columns from object keys
    const allKeys = new Set<string>()
    for (const c of props.competitors) {
      for (const key of Object.keys(c)) {
        allKeys.add(key)
      }
    }
    const columns = Array.from(allKeys)
    const rows = props.competitors.map((c) =>
      columns.map((col) => c[col] ?? '')
    )
    // Capitalize column headers
    const headers = columns.map(
      (c) => c.charAt(0).toUpperCase() + c.slice(1).replace(/_/g, ' ')
    )
    return { columns: headers, rows }
  }

  return { columns: [], rows: [] }
}

export default function CompetitorTable(props: Props) {
  const { columns, rows } = useMemo(() => normalize(props), [props])

  if (columns.length === 0) {
    return null
  }

  return (
    <div className="widget widget-competitor-table">
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
      {props.highlights && (
        <div className="highlights">
          {props.highlights.table_stakes && props.highlights.table_stakes.length > 0 && (
            <div className="table-stakes">
              <span className="label">Table stakes:</span>{' '}
              {props.highlights.table_stakes.join(', ')}
            </div>
          )}
          {props.highlights.white_space && props.highlights.white_space.length > 0 && (
            <div className="white-space">
              <span className="label">White space:</span>{' '}
              {props.highlights.white_space.join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
