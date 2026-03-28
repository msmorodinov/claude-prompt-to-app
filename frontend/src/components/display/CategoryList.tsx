interface Category {
  label: string
  items: string[]
  style?: 'default' | 'success' | 'warning' | 'error'
}

interface Props {
  categories: Category[]
  // Legacy props for backward compatibility
  agreed?: string[]
  contradicted?: Array<{
    topic: string
    positions: Record<string, string>
    resolution_needed?: boolean
  }>
  surprises?: string[]
}

function normalizeLegacy(props: Props): Category[] {
  if (props.categories && Array.isArray(props.categories)) {
    return props.categories
  }

  const cats: Category[] = []

  if (Array.isArray(props.agreed) && props.agreed.length > 0) {
    cats.push({ label: 'Agreed', items: props.agreed, style: 'success' })
  }

  if (Array.isArray(props.contradicted) && props.contradicted.length > 0) {
    const items = props.contradicted.map((c) => {
      const positions = Object.entries(c.positions)
        .map(([name, pos]) => `${name}: ${pos}`)
        .join('; ')
      const suffix = c.resolution_needed ? ' (needs resolution)' : ''
      return `${c.topic} — ${positions}${suffix}`
    })
    cats.push({ label: 'Contradicted', items, style: 'warning' })
  }

  if (Array.isArray(props.surprises) && props.surprises.length > 0) {
    cats.push({ label: 'Surprises', items: props.surprises })
  }

  return cats
}

export default function CategoryList(props: Props) {
  const categories = normalizeLegacy(props)

  if (categories.length === 0) return null

  const styleClass = (style?: string) => {
    if (!style || style === 'default') return ''
    return ` category-${style}`
  }

  return (
    <div className="widget widget-category-list">
      {categories.map((cat, i) => (
        <div key={cat.label || i} className={`category${styleClass(cat.style)}`}>
          <h4>{cat.label}</h4>
          <ul>
            {cat.items.map((item, j) => (
              <li key={j}>{item}</li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  )
}
