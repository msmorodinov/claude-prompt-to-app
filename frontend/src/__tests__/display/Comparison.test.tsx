import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import Comparison from '../../components/display/Comparison'

describe('Comparison', () => {
  it('renders left and right sides', () => {
    render(
      <Comparison
        left={{ label: 'Draft', content: 'We make a platform...' }}
        right={{ label: 'Final', content: 'We help FMCG brand...' }}
      />,
    )
    expect(screen.getByText('Draft')).toBeInTheDocument()
    expect(screen.getByText('Final')).toBeInTheDocument()
    expect(screen.getByText('We make a platform...')).toBeInTheDocument()
    expect(screen.getByText('We help FMCG brand...')).toBeInTheDocument()
  })

  it('renders note when provided', () => {
    render(
      <Comparison
        left={{ label: 'A', content: 'a' }}
        right={{ label: 'B', content: 'b' }}
        note="Major improvement"
      />,
    )
    expect(screen.getByText('Major improvement')).toBeInTheDocument()
  })

  it('renders diff_note for backward compatibility', () => {
    render(
      <Comparison
        left={{ label: 'A', content: 'a' }}
        right={{ label: 'B', content: 'b' }}
        diff_note="Legacy note"
      />,
    )
    expect(screen.getByText('Legacy note')).toBeInTheDocument()
  })

  it('handles undefined left/right without crashing', () => {
    const { container } = render(
      <Comparison left={undefined as any} right={undefined as any} />,
    )
    expect(container.querySelector('.widget-comparison')).toBeInTheDocument()
  })
})
