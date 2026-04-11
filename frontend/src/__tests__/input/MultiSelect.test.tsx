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

  it('disables unchecked checkboxes at max_select limit', () => {
    render(<MultiSelect {...defaultProps} max_select={2} value={['A', 'B']} onChange={vi.fn()} />)
    const checkboxes = screen.getAllByRole('checkbox')
    // A and B are checked — should NOT be disabled
    expect(checkboxes[0]).not.toBeDisabled()
    expect(checkboxes[1]).not.toBeDisabled()
    // C is unchecked and at max — should be disabled
    expect(checkboxes[2]).toBeDisabled()
  })

  it('shows constraint hint when max_select defined', () => {
    const { rerender } = render(
      <MultiSelect {...defaultProps} max_select={2} value={[]} onChange={vi.fn()} />,
    )
    expect(screen.getByTestId('constraint-hint')).toHaveTextContent('Select up to 2')

    rerender(
      <MultiSelect {...defaultProps} max_select={2} value={['A', 'B']} onChange={vi.fn()} />,
    )
    expect(screen.getByTestId('constraint-hint')).toHaveTextContent('Maximum 2 selected')
  })

  it('blocks adding beyond max_select', () => {
    const onChange = vi.fn()
    render(<MultiSelect {...defaultProps} max_select={2} value={['A', 'B']} onChange={onChange} />)
    const checkboxes = screen.getAllByRole('checkbox')
    // Attempt to check C (which is disabled at max)
    fireEvent.click(checkboxes[2])
    expect(onChange).not.toHaveBeenCalled()
  })
})
