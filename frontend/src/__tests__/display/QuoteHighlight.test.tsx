import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import QuoteHighlight from '../../components/display/QuoteHighlight'

describe('QuoteHighlight', () => {
  it('renders quote', () => {
    render(<QuoteHighlight quote="Important insight" />)
    expect(screen.getByText('Important insight')).toBeInTheDocument()
  })

  it('renders attribution when provided', () => {
    render(<QuoteHighlight quote="Quote" attribution="from Q2" />)
    expect(screen.getByText('from Q2')).toBeInTheDocument()
  })

  it('renders note when provided', () => {
    render(<QuoteHighlight quote="Quote" note="Key takeaway" />)
    expect(screen.getByText('Key takeaway')).toBeInTheDocument()
  })
})
