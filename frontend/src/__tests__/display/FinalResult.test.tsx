import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import FinalResult from '../../components/display/FinalResult'

describe('FinalResult', () => {
  it('renders content', () => {
    render(<FinalResult content="Positioning Statement: We help..." />)
    expect(screen.getByText('Positioning Statement: We help...')).toBeInTheDocument()
  })

  it('has accent styling class', () => {
    const { container } = render(<FinalResult content="test" />)
    expect(container.querySelector('.widget-final-result')).toBeInTheDocument()
  })

  it('returns null for empty content', () => {
    const { container } = render(<FinalResult content="" />)
    expect(container.querySelector('.widget-final-result')).not.toBeInTheDocument()
  })

  it('returns null for undefined content', () => {
    const { container } = render(<FinalResult content={undefined as any} />)
    expect(container.querySelector('.widget-final-result')).not.toBeInTheDocument()
  })
})
