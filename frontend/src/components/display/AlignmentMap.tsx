interface Props {
  agreed: string[]
  contradicted?: Array<{
    topic: string
    positions: Record<string, string>
    resolution_needed?: boolean
  }>
  surprises?: string[]
}

export default function AlignmentMap({ agreed, contradicted, surprises }: Props) {
  const agreedItems = Array.isArray(agreed) ? agreed : []
  return (
    <div className="widget widget-alignment-map">
      <div className="agreed">
        <h4>Agreed</h4>
        <ul>
          {agreedItems.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
      {Array.isArray(contradicted) && contradicted.length > 0 && (
        <div className="contradicted">
          <h4>Contradicted</h4>
          {contradicted.map((item, i) => (
            <div key={i} className="contradiction">
              <strong>{item.topic}</strong>
              {item.resolution_needed && (
                <span className="resolution-needed"> (needs resolution)</span>
              )}
              <ul>
                {Object.entries(item.positions).map(([name, pos]) => (
                  <li key={name}>
                    {name}: {pos}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
      {Array.isArray(surprises) && surprises.length > 0 && (
        <div className="surprises">
          <h4>Surprises</h4>
          <ul>
            {surprises.map((item, i) => (
              <li key={i}>{item}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
