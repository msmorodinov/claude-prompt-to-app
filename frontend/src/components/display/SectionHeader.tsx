interface Props {
  title: string
  subtitle?: string
}

export default function SectionHeader({ title, subtitle }: Props) {
  const t = title || ''
  if (!t) return null
  return (
    <div className="widget widget-section-header">
      <h2>{t}</h2>
      {subtitle && <p className="subtitle">{subtitle}</p>}
    </div>
  )
}
