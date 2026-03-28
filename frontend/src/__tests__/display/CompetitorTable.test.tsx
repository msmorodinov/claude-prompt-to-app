import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import CompetitorTable from '../../components/display/CompetitorTable'

describe('CompetitorTable', () => {
  const defaultProps = {
    columns: ['Name', 'Position', 'Price'],
    rows: [
      ['Acme', 'Fast and cheap', 'Free'],
      ['Globex', 'Enterprise-grade', '$$$'],
    ],
  }

  it('renders columns as headers', () => {
    render(<CompetitorTable {...defaultProps} />)
    expect(screen.getByText('Name')).toBeInTheDocument()
    expect(screen.getByText('Position')).toBeInTheDocument()
    expect(screen.getByText('Price')).toBeInTheDocument()
  })

  it('renders all rows', () => {
    render(<CompetitorTable {...defaultProps} />)
    expect(screen.getByText('Acme')).toBeInTheDocument()
    expect(screen.getByText('Globex')).toBeInTheDocument()
  })

  it('renders highlights when provided', () => {
    render(
      <CompetitorTable
        {...defaultProps}
        highlights={{
          table_stakes: ['Speed'],
          white_space: ['Compliance'],
        }}
      />,
    )
    expect(screen.getByText(/Speed/)).toBeInTheDocument()
    expect(screen.getByText(/Compliance/)).toBeInTheDocument()
  })
})
