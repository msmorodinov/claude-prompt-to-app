import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import FreeText from '../../components/input/FreeText'

describe('FreeText', () => {
  it('renders label', () => {
    render(<FreeText id="q1" label="Name?" value="" onChange={vi.fn()} />)
    expect(screen.getByText('Name?')).toBeInTheDocument()
  })

  it('renders textarea by default', () => {
    render(<FreeText id="q1" label="Q" value="" onChange={vi.fn()} />)
    expect(screen.getByRole('textbox')).toBeInTheDocument()
  })

  it('fires onChange on input', () => {
    const onChange = vi.fn()
    render(<FreeText id="q1" label="Q" value="" onChange={onChange} />)
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Hello' } })
    expect(onChange).toHaveBeenCalledWith('Hello')
  })

  it('shows word counter when max_words set', () => {
    render(
      <FreeText
        id="q1"
        label="Q"
        value="one two three"
        onChange={vi.fn()}
        max_words={30}
      />,
    )
    expect(screen.getByText('3/30')).toBeInTheDocument()
  })

  it('shows over class when exceeding max_words', () => {
    const { container } = render(
      <FreeText
        id="q1"
        label="Q"
        value="one two three"
        onChange={vi.fn()}
        max_words={2}
      />,
    )
    expect(container.querySelector('.over')).toBeInTheDocument()
  })
})
