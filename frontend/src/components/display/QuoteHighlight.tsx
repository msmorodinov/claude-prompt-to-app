interface Props {
  quote: string
  attribution?: string
  source?: string   // Claude may use "source" instead of "attribution"
  note?: string
  comment?: string  // Claude may use "comment" instead of "note"
}

export default function QuoteHighlight({ quote, attribution, source, note, comment }: Props) {
  const displayAttribution = attribution || source
  const displayNote = note || comment

  return (
    <div className="widget widget-quote-highlight">
      <blockquote>{quote}</blockquote>
      {displayAttribution && <cite>{displayAttribution}</cite>}
      {displayNote && <p className="note">{displayNote}</p>}
    </div>
  )
}
