import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SliderScale from '../../components/input/SliderScale'

describe('SliderScale', () => {
  it('renders label', () => {
    render(
      <SliderScale
        id="q1"
        label="Rate PMF"
        min={1}
        max={10}
        value={5}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Rate PMF')).toBeInTheDocument()
  })

  it('renders min/max labels when provided', () => {
    render(
      <SliderScale
        id="q1"
        label="Q"
        min={1}
        max={10}
        value={5}
        onChange={vi.fn()}
        min_label="Low"
        max_label="High"
      />,
    )
    expect(screen.getByText('Low')).toBeInTheDocument()
    expect(screen.getByText('High')).toBeInTheDocument()
  })

  it('shows current value', () => {
    render(
      <SliderScale
        id="q1"
        label="Q"
        min={1}
        max={10}
        value={7}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('7')).toBeInTheDocument()
  })
})
