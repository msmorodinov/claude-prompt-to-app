import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CategoryList from '../../components/display/CategoryList'

describe('CategoryList', () => {
  it('renders categories', () => {
    render(
      <CategoryList
        categories={[
          { label: 'Strengths', items: ['Speed', 'Reliability'] },
          { label: 'Weaknesses', items: ['Price'] },
        ]}
      />,
    )
    expect(screen.getByText('Strengths')).toBeInTheDocument()
    expect(screen.getByText('Speed')).toBeInTheDocument()
    expect(screen.getByText('Weaknesses')).toBeInTheDocument()
    expect(screen.getByText('Price')).toBeInTheDocument()
  })

  it('renders with style classes', () => {
    const { container } = render(
      <CategoryList
        categories={[
          { label: 'Good', items: ['Item'], style: 'success' },
          { label: 'Bad', items: ['Issue'], style: 'warning' },
        ]}
      />,
    )
    expect(container.querySelector('.category-success')).toBeInTheDocument()
    expect(container.querySelector('.category-warning')).toBeInTheDocument()
  })

  it('handles legacy agreed/contradicted/surprises format', () => {
    render(
      <CategoryList
        categories={undefined as any}
        agreed={['Customer = brand managers', 'Gap = no track record']}
        contradicted={[
          {
            topic: 'Core bet',
            positions: { Alice: 'Go deep', Bob: 'Expand' },
            resolution_needed: true,
          },
        ]}
        surprises={['Unexpected insight']}
      />,
    )
    expect(screen.getByText('Customer = brand managers')).toBeInTheDocument()
    expect(screen.getByText(/Core bet/)).toBeInTheDocument()
    expect(screen.getByText(/needs resolution/)).toBeInTheDocument()
    expect(screen.getByText('Unexpected insight')).toBeInTheDocument()
  })

  it('returns null when categories is empty', () => {
    const { container } = render(<CategoryList categories={[]} />)
    expect(container.querySelector('.widget-category-list')).not.toBeInTheDocument()
  })
})
