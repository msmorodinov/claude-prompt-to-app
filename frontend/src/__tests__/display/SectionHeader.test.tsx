import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import SectionHeader from '../../components/display/SectionHeader'

describe('SectionHeader', () => {
  it('renders title', () => {
    render(<SectionHeader title="THE CUSTOMER TEST" />)
    expect(screen.getByText('THE CUSTOMER TEST')).toBeInTheDocument()
  })

  it('renders subtitle when provided', () => {
    render(<SectionHeader title="Title" subtitle="Sub title" />)
    expect(screen.getByText('Sub title')).toBeInTheDocument()
  })

  it('does not render subtitle when not provided', () => {
    const { container } = render(<SectionHeader title="Title" />)
    expect(container.querySelector('.subtitle')).not.toBeInTheDocument()
  })

  it('returns null for undefined title', () => {
    const { container } = render(<SectionHeader title={undefined as any} />)
    expect(container.querySelector('.widget-section-header')).not.toBeInTheDocument()
  })

  it('returns null for empty title', () => {
    const { container } = render(<SectionHeader title="" />)
    expect(container.querySelector('.widget-section-header')).not.toBeInTheDocument()
  })
})
