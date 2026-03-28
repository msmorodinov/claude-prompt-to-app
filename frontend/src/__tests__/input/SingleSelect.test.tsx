import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import SingleSelect from '../../components/input/SingleSelect'

describe('SingleSelect', () => {
  const defaultProps = {
    id: 'q1',
    label: 'Pick one',
    options: ['Option A', 'Option B', 'Option C'],
    value: undefined as string | undefined,
    onChange: vi.fn(),
  }

  it('renders label and options', () => {
    render(<SingleSelect {...defaultProps} />)
    expect(screen.getByText('Pick one')).toBeInTheDocument()
    expect(screen.getByText('Option A')).toBeInTheDocument()
    expect(screen.getByText('Option B')).toBeInTheDocument()
    expect(screen.getByText('Option C')).toBeInTheDocument()
  })

  it('fires onChange when option selected', () => {
    const onChange = vi.fn()
    render(<SingleSelect {...defaultProps} onChange={onChange} />)
    const radios = screen.getAllByRole('radio')
    fireEvent.click(radios[1])
    expect(onChange).toHaveBeenCalledWith('Option B')
  })

  it('shows custom input when allow_custom is true', () => {
    render(<SingleSelect {...defaultProps} allow_custom />)
    expect(screen.getByPlaceholderText('Other...')).toBeInTheDocument()
  })

  it('disables options when disabled', () => {
    render(<SingleSelect {...defaultProps} disabled />)
    const radios = screen.getAllByRole('radio')
    radios.forEach((r) => expect(r).toBeDisabled())
  })
})
