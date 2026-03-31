import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import EnvironmentReference from '../components/admin/EnvironmentReference'
import type { EnvironmentInfo } from '../api-admin'

const mockData: EnvironmentInfo = {
  display_widgets: [
    { type: 'text', description: 'Markdown content', required: ['content'], optional: [] },
    { type: 'section_header', description: '', required: ['title'], optional: ['subtitle'] },
  ],
  input_widgets: [
    { type: 'free_text', description: '', required: ['id', 'label'], optional: ['placeholder', 'max_words', 'multiline'] },
  ],
  tools: [
    { name: 'show', description: 'Display content', behavior: 'Fire-and-forget' },
    { name: 'ask', description: 'Ask questions', behavior: 'Blocks until user submits' },
  ],
}

describe('EnvironmentReference', () => {
  it('renders all sections', () => {
    render(<EnvironmentReference data={mockData} onClose={vi.fn()} />)
    expect(screen.getByText('Environment Reference')).toBeTruthy()
    expect(screen.getByText(/Display Widgets/)).toBeTruthy()
    expect(screen.getByText(/Input Widgets/)).toBeTruthy()
    expect(screen.getByText(/Tools/)).toBeTruthy()
  })

  it('renders widget types', () => {
    render(<EnvironmentReference data={mockData} onClose={vi.fn()} />)
    expect(screen.getByText('text')).toBeTruthy()
    expect(screen.getByText('section_header')).toBeTruthy()
    expect(screen.getByText('free_text')).toBeTruthy()
  })

  it('renders tool names and behaviors', () => {
    render(<EnvironmentReference data={mockData} onClose={vi.fn()} />)
    expect(screen.getByText('show')).toBeTruthy()
    expect(screen.getByText('ask')).toBeTruthy()
    expect(screen.getByText('Fire-and-forget')).toBeTruthy()
  })

  it('collapses sections on toggle', () => {
    render(<EnvironmentReference data={mockData} onClose={vi.fn()} />)
    const displayToggle = screen.getByText(/Display Widgets/)
    fireEvent.click(displayToggle)
    // After collapse, widget type 'text' should not be visible
    expect(screen.queryByText('Markdown content')).toBeNull()
  })

  it('calls onClose', () => {
    const onClose = vi.fn()
    render(<EnvironmentReference data={mockData} onClose={onClose} />)
    const closeBtn = screen.getByText('\u00d7')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows required and optional field badges', () => {
    render(<EnvironmentReference data={mockData} onClose={vi.fn()} />)
    expect(screen.getByText('content')).toBeTruthy()
    expect(screen.getByText('subtitle')).toBeTruthy()
  })
})
