import type { TokenUsage } from '../hooks/useChat'

const CONTEXT_WINDOW = 200_000

function formatTokens(n: number): string {
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`
  return String(n)
}

interface TokenCounterProps {
  usage: TokenUsage
}

export default function TokenCounter({ usage }: TokenCounterProps) {
  if (usage.input === 0 && usage.output === 0) return null

  const pct = Math.min(100, (usage.input / CONTEXT_WINDOW) * 100)
  const color =
    pct > 80 ? 'var(--color-error, #e85454)' :
    pct > 50 ? 'var(--color-warning, #e8c46c)' :
    'var(--text-tertiary, #555)'

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '4px 12px',
      fontSize: 11,
      fontFamily: 'var(--font-mono, "JetBrains Mono", monospace)',
      color: 'var(--text-tertiary, #555)',
      userSelect: 'none',
    }}>
      <span title="Input tokens">↓ {formatTokens(usage.input)}</span>
      <span title="Output tokens">↑ {formatTokens(usage.output)}</span>
      <div style={{
        width: 48,
        height: 4,
        borderRadius: 2,
        background: 'var(--surface-secondary, #1a1a1d)',
        overflow: 'hidden',
      }}>
        <div style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: 2,
          background: color,
          transition: 'width 0.3s ease, background 0.3s ease',
        }} />
      </div>
      <span style={{ color }}>{pct.toFixed(0)}%</span>
    </div>
  )
}
