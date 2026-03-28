import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ComparisonCard from '../../components/display/ComparisonCard'

describe('ComparisonCard', () => {
  it('renders left and right sides', () => {
    render(
      <ComparisonCard
        left={{ label: 'Draft', content: 'We make a platform...' }}
        right={{ label: 'Final', content: 'We help FMCG brand...' }}
      />,
    )
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('Final')).toBeInTheDocument()
    expect(screen.getByText('We make a platform...')).toBeInTheDocument()
    expect(screen.getByText('We help FMCG brand...')).toBeInTheDocument()
  })

  it('renders diff_note when provided', () => {
    render(
      <ComparisonCard
        left={{ label: 'A', content: 'a' }}
        right={{ label: 'B', content: 'b' }}
        diff_note="Major improvement"
      />,
    )
    expect(screen.getByText('Major improvement')).toBeInTheDocument()
  })

  it('handles undefined left/right without crashing', () => {
    const { container } = render(
      <ComparisonCard left={undefined as any} right={undefined as any} />,
    )
    expect(container.querySelector('.widget-comparison-card')).toBeInTheDocument()
  })
})
