import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import TextWidget from '../../components/display/TextWidget'

describe('TextWidget', () => {
  it('renders content', () => {
    render(<TextWidget content="Hello world" />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('has correct CSS class', () => {
    const { container } = render(<TextWidget content="test" />)
    expect(container.querySelector('.widget-text')).toBeInTheDocument()
  })

  it('returns null for empty content', () => {
    const { container } = render(<TextWidget content="" />)
    expect(container.querySelector('.widget-text')).not.toBeInTheDocument()
  })

  it('returns null for undefined content', () => {
    const { container } = render(<TextWidget content={undefined as any} />)
    expect(container.querySelector('.widget-text')).not.toBeInTheDocument()
  })
})
