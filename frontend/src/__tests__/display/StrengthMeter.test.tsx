import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import StrengthMeter from '../../components/display/StrengthMeter'

describe('StrengthMeter', () => {
  const metrics = [
    { label: 'Specificity', value: 8, max: 10 },
    { label: 'Verifiability', value: 6, max: 10 },
  ]

  it('renders all metrics', () => {
    render(<StrengthMeter metrics={metrics} />)
    expect(screen.getByText('Specificity')).toBeInTheDocument()
    expect(screen.getByText('Verifiability')).toBeInTheDocument()
  })

  it('shows value/max labels', () => {
    render(<StrengthMeter metrics={metrics} />)
    expect(screen.getByText('8/10')).toBeInTheDocument()
    expect(screen.getByText('6/10')).toBeInTheDocument()
  })

  it('renders meter fills with correct width', () => {
    const { container } = render(<StrengthMeter metrics={metrics} />)
    const fills = container.querySelectorAll('.meter-fill')
    expect(fills[0]).toHaveStyle({ width: '80%' })
    expect(fills[1]).toHaveStyle({ width: '60%' })
  })

  it('returns null when metrics is undefined', () => {
    const { container } = render(<StrengthMeter metrics={undefined as any} />)
    expect(container.querySelector('.widget-strength-meter')).not.toBeInTheDocument()
  })

  it('handles max=0 without division by zero', () => {
    const { container } = render(
      <StrengthMeter metrics={[{ label: 'Test', value: 5, max: 0 }]} />,
    )
    const fill = container.querySelector('.meter-fill')
    expect(fill).toBeInTheDocument()
    // max=0 falls back to 1, so width = 500%
    expect(fill).toHaveStyle({ width: '500%' })
  })
})
