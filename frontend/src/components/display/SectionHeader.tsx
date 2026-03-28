interface Props {
  title: string
  subtitle?: string
}

export default function SectionHeader({ title, subtitle }: Props) {
  if (!title) return null
  return (
    <div className="widget widget-section-header">
      <h2>{title}</h2>
      {subtitle && <p className="subtitle">{subtitle}</p>}
    </div>
  )
}
