import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import RankPriorities from '../../components/input/RankPriorities'

describe('RankPriorities', () => {
  const defaultProps = {
    id: 'q1',
    label: 'Rank these',
    items: ['A', 'B', 'C'],
    value: ['A', 'B', 'C'],
    onChange: vi.fn(),
  }

  it('renders all items in order', () => {
    render(<RankPriorities {...defaultProps} />)
    expect(screen.getByText('A')).toBeInTheDocument()
    expect(screen.getByText('B')).toBeInTheDocument()
    expect(screen.getByText('C')).toBeInTheDocument()
  })

  it('moves item down on button click', () => {
    const onChange = vi.fn()
    render(<RankPriorities {...defaultProps} onChange={onChange} />)
    const downButtons = screen.getAllByText('↓')
    fireEvent.click(downButtons[0]) // Move A down
    expect(onChange).toHaveBeenCalledWith(['B', 'A', 'C'])
  })

  it('moves item up on button click', () => {
    const onChange = vi.fn()
    render(<RankPriorities {...defaultProps} onChange={onChange} />)
    const upButtons = screen.getAllByText('↑')
    fireEvent.click(upButtons[1]) // Move B up
    expect(onChange).toHaveBeenCalledWith(['B', 'A', 'C'])
  })
})
