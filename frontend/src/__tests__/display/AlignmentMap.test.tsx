import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import AlignmentMap from '../../components/display/AlignmentMap'

describe('AlignmentMap', () => {
  it('renders agreed items', () => {
    render(<AlignmentMap agreed={['Customer = brand managers', 'Gap = no track record']} />)
    expect(screen.getByText('Customer = brand managers')).toBeInTheDocument()
    expect(screen.getByText('Gap = no track record')).toBeInTheDocument()
  })

  it('renders contradicted items', () => {
    render(
      <AlignmentMap
        agreed={['Item']}
        contradicted={[
          {
            topic: 'Core bet',
            positions: { Alice: 'Go deep', Bob: 'Expand' },
            resolution_needed: true,
          },
        ]}
      />,
    )
    expect(screen.getByText('Core bet')).toBeInTheDocument()
    expect(screen.getByText(/needs resolution/)).toBeInTheDocument()
  })

  it('renders surprises', () => {
    render(<AlignmentMap agreed={['Item']} surprises={['Unexpected insight']} />)
    expect(screen.getByText('Unexpected insight')).toBeInTheDocument()
  })

  it('handles undefined agreed without crashing', () => {
    const { container } = render(<AlignmentMap agreed={undefined as any} />)
    expect(container.querySelector('.widget-alignment-map')).toBeInTheDocument()
  })
})
