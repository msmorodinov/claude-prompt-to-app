interface Props {
  quote: string
  attribution?: string
  source?: string
  note?: string
  comment?: string
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
