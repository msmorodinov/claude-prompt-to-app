import type { AppInfo } from '../api'

interface Props {
  apps: AppInfo[]
  onSelect: (appId: number) => void
}

export default function AppSelector({ apps, onSelect }: Props) {
  return (
    <div className="app-selector">
      <h2>Choose your app</h2>
      <div className="app-grid">
        {apps.map((app) => (
          <button
            key={app.id}
            className="app-card"
            onClick={() => onSelect(app.id)}
          >
            <h3>{app.title}</h3>
            {app.subtitle && <p>{app.subtitle}</p>}
          </button>
        ))}
      </div>
    </div>
  )
}
