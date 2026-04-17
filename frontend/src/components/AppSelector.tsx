import { useMemo } from 'react'
import type { AppInfo } from '../api'

interface Props {
  apps: AppInfo[]
  onSelect: (appId: number) => void
}

export default function AppSelector({ apps, onSelect }: Props) {
  const { regularApps, personas } = useMemo(() => {
    const regular: AppInfo[] = []
    const persona: AppInfo[] = []
    for (const app of apps) {
      if (app.type === 'persona') {
        persona.push(app)
      } else {
        regular.push(app)
      }
    }
    return { regularApps: regular, personas: persona }
  }, [apps])

  return (
    <div className="app-selector">
      {regularApps.length > 0 && (
        <>
          <h2>Choose your app</h2>
          <div className="app-grid">
            {regularApps.map((app) => (
              <button
                key={app.id}
                className="app-card"
                onClick={() => onSelect(app.id)}
              >
                <h3>{app.title}</h3>
                {app.subtitle && <p>{app.subtitle}</p>}
                {app.model && (
                  <span className={`model-badge model-badge--${app.model}`}>
                    {app.model === 'opus' ? 'Opus' : 'Sonnet'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {personas.length > 0 && (
        <>
          <h2 className="persona-section-title">Talk to a persona</h2>
          <div className="app-grid">
            {personas.map((app) => (
              <button
                key={app.id}
                className="app-card persona-card"
                onClick={() => onSelect(app.id)}
              >
                <h3>{app.title}</h3>
                {app.subtitle && <p className="persona-tagline">{app.subtitle}</p>}
                {app.model && (
                  <span className={`model-badge model-badge--${app.model}`}>
                    {app.model === 'opus' ? 'Opus' : 'Sonnet'}
                  </span>
                )}
              </button>
            ))}
          </div>
        </>
      )}

      {apps.length === 0 && (
        <div className="app-selector-empty">
          <p>No apps available yet.</p>
        </div>
      )}
    </div>
  )
}
