import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ProgressBar from '../../components/display/ProgressBar'

describe('ProgressBar', () => {
  it('renders label and percent', () => {
    render(<ProgressBar label="Research" percent={60} />)
    expect(screen.getByText('Research')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
  })

  it('renders fill with correct width', () => {
    const { container } = render(<ProgressBar label="Test" percent={75} />)
    const fill = container.querySelector('.progress-fill')
    expect(fill).toHaveStyle({ width: '75%' })
  })

  it('clamps percent between 0 and 100', () => {
    const { container } = render(<ProgressBar label="Test" percent={150} />)
    const fill = container.querySelector('.progress-fill')
    expect(fill).toHaveStyle({ width: '100%' })
  })
})
