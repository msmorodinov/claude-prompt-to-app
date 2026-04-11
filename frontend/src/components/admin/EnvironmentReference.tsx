import { useState } from 'react'
import type { EnvironmentInfo, WidgetInfo, McpServer } from '../../api-admin'

interface Props {
  data: EnvironmentInfo
  mcpServers?: McpServer[]
  onClose?: () => void
}

function Section({
  title,
  children,
}: {
  title: string
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(true)
  return (
    <div className="env-section">
      <button
        className="env-section-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="env-section-arrow">{open ? '\u25BE' : '\u25B8'}</span>
        <span className="env-section-title">{title}</span>
      </button>
      {open && <div className="env-section-body">{children}</div>}
    </div>
  )
}

function WidgetList({ widgets }: { widgets: WidgetInfo[] }) {
  return (
    <div className="env-widget-list">
      {widgets.map((w) => (
        <div key={w.type} className="env-widget-card">
          <span className="env-widget-type">{w.type}</span>
          {w.description && (
            <span className="env-widget-desc">{w.description}</span>
          )}
          <div className="env-widget-fields">
            {w.required.map((f) => (
              <span key={f} className="env-field env-field--required">
                {f}
              </span>
            ))}
            {w.optional.map((f) => (
              <span key={f} className="env-field env-field--optional">
                {f}
              </span>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

const STATUS_LABELS: Record<McpServer['status'], string> = {
  connected: 'Connected',
  needs_auth: 'Needs auth',
  error: 'Error',
}

function McpServerList({ servers }: { servers: McpServer[] }) {
  return (
    <div className="env-mcp-list">
      {servers.map((s) => (
        <div key={s.name} className="env-mcp-card">
          <span className={`env-mcp-dot env-mcp-dot--${s.status}`} />
          <span className="env-mcp-name">{s.name}</span>
          <span className="env-mcp-status">{STATUS_LABELS[s.status]}</span>
        </div>
      ))}
    </div>
  )
}

export default function EnvironmentReference({ data, mcpServers = [], onClose }: Props) {
  return (
    <div className="env-reference">
      <div className="env-reference-header">
        <span className="env-reference-title">Environment Reference</span>
        {onClose && (
          <button className="env-reference-close" onClick={onClose}>
            &times;
          </button>
        )}
      </div>

      <Section title={`MCP Servers (${mcpServers.length})`}>
        <McpServerList servers={mcpServers} />
      </Section>

      <Section title={`Display Widgets — show (${data.display_widgets.length})`}>
        <WidgetList widgets={data.display_widgets} />
      </Section>

      <Section title={`Input Widgets — ask (${data.input_widgets.length})`}>
        <WidgetList widgets={data.input_widgets} />
      </Section>

      <Section title={`Tools (${data.tools.length})`}>
        <div className="env-tool-list">
          {data.tools.map((t) => (
            <div key={t.name} className="env-tool-card">
              <span className="env-tool-name">{t.name}</span>
              <span className="env-tool-desc">{t.description}</span>
              <span className="env-tool-behavior">{t.behavior}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  )
}
