import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import CopyableBlock from '../../components/display/CopyableBlock'

describe('CopyableBlock', () => {
  it('renders content', () => {
    render(<CopyableBlock content="Copy this text" />)
    expect(screen.getByText('Copy this text')).toBeInTheDocument()
  })

  it('renders label when provided', () => {
    render(<CopyableBlock content="text" label="Exercise" />)
    expect(screen.getByText('Exercise')).toBeInTheDocument()
  })

  it('copies content on button click', async () => {
    render(<CopyableBlock content="Copy me" />)
    fireEvent.click(screen.getByText('Copy'))
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Copy me')
  })
})
