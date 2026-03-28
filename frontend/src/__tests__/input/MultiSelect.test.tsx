import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import MultiSelect from '../../components/input/MultiSelect'

describe('MultiSelect', () => {
  const defaultProps = {
    id: 'q1',
    label: 'Select many',
    options: ['A', 'B', 'C'],
    value: [] as string[],
    onChange: vi.fn(),
  }

  it('renders checkboxes for each option', () => {
    render(<MultiSelect {...defaultProps} />)
    expect(screen.getAllByRole('checkbox')).toHaveLength(3)
  })

  it('fires onChange with added item', () => {
    const onChange = vi.fn()
    render(<MultiSelect {...defaultProps} onChange={onChange} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[1])
    expect(onChange).toHaveBeenCalledWith(['B'])
  })

  it('fires onChange removing item', () => {
    const onChange = vi.fn()
    render(<MultiSelect {...defaultProps} value={['A', 'B']} onChange={onChange} />)
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    expect(onChange).toHaveBeenCalledWith(['B'])
  })
})
