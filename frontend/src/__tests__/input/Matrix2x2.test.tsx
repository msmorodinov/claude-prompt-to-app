import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Matrix2x2 from '../../components/input/Matrix2x2'

describe('Matrix2x2', () => {
  it('renders label and axis labels', () => {
    render(
      <Matrix2x2
        id="q1"
        label="Effort vs Impact"
        x_axis="Effort"
        y_axis="Impact"
        items={['A', 'B']}
        value={{}}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Effort vs Impact')).toBeInTheDocument()
    expect(screen.getByText('Effort')).toBeInTheDocument()
    expect(screen.getByText('Impact')).toBeInTheDocument()
  })

  it('renders items as buttons', () => {
    render(
      <Matrix2x2
        id="q1"
        label="Q"
        x_axis="X"
        y_axis="Y"
        items={['Item 1', 'Item 2']}
        value={{}}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('Item 1')).toBeInTheDocument()
    expect(screen.getByText('Item 2')).toBeInTheDocument()
  })

  it('renders placed points', () => {
    const { container } = render(
      <Matrix2x2
        id="q1"
        label="Q"
        x_axis="X"
        y_axis="Y"
        items={['A']}
        value={{ A: { x: 50, y: 50 } }}
        onChange={vi.fn()}
      />,
    )
    const point = container.querySelector('.matrix-point')
    expect(point).toBeInTheDocument()
    expect(point).toHaveStyle({ left: '50%', bottom: '50%' })
  })

  it('handles undefined items without crashing', () => {
    const { container } = render(
      <Matrix2x2
        id="q1"
        label="Q"
        x_axis="X"
        y_axis="Y"
        items={undefined as any}
        value={{}}
        onChange={vi.fn()}
      />,
    )
    expect(container.querySelector('.widget-matrix-2x2')).toBeInTheDocument()
  })

  it('handles undefined value without crashing', () => {
    const { container } = render(
      <Matrix2x2
        id="q1"
        label="Q"
        x_axis="X"
        y_axis="Y"
        items={['A']}
        value={undefined as any}
        onChange={vi.fn()}
      />,
    )
    expect(container.querySelector('.widget-matrix-2x2')).toBeInTheDocument()
  })
})
