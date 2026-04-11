import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import WidgetRenderer from '../components/WidgetRenderer'
import type { DisplayWidget } from '../types'

describe('WidgetRenderer', () => {
  it('renders TextWidget', () => {
    render(<WidgetRenderer widget={{ type: 'text', content: 'Hello world' }} />)
    expect(screen.getByText('Hello world')).toBeInTheDocument()
  })

  it('renders SectionHeader', () => {
    render(
      <WidgetRenderer
        widget={{ type: 'section_header', title: 'Test Title', subtitle: 'Sub' }}
      />,
    )
    expect(screen.getByText('Test Title')).toBeInTheDocument()
    expect(screen.getByText('Sub')).toBeInTheDocument()
  })

  it('renders ProgressBar', () => {
    render(
      <WidgetRenderer
        widget={{ type: 'progress', label: 'Loading', percent: 60 }}
      />,
    )
    expect(screen.getByText('Loading')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
  })

  it('renders FinalResult', () => {
    render(
      <WidgetRenderer
        widget={{ type: 'final_result', content: 'Final statement' }}
      />,
    )
    expect(screen.getByText('Final statement')).toBeInTheDocument()
  })

  it('renders QuoteHighlight', () => {
    render(
      <WidgetRenderer
        widget={{
          type: 'quote_highlight',
          quote: 'Important quote',
          attribution: 'Person',
        }}
      />,
    )
    expect(screen.getByText('Important quote')).toBeInTheDocument()
    expect(screen.getByText('Person')).toBeInTheDocument()
  })

  it('renders unknown widget as JSON fallback', () => {
    const widget = { type: 'unknown_type', foo: 'bar' } as unknown as DisplayWidget
    const { container } = render(<WidgetRenderer widget={widget} />)
    const pre = container.querySelector('pre.widget-fallback')
    expect(pre).toBeInTheDocument()
    expect(pre!.textContent).toContain('unknown_type')
    expect(pre!.textContent).toContain('bar')
  })

  it('renders error fallback when widget throws', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})
    // Use unknown type to trigger widget rendering error
    const badWidget = {
      type: 'unknown_crash_widget' as any,
      // This will cause JSON.stringify to fail
      data: { toJSON: () => { throw new Error('Widget render error') } },
    } as any
    const { container } = render(<WidgetRenderer widget={badWidget} />)
    expect(container.querySelector('[data-testid="widget-error"]')).toBeInTheDocument()
    spy.mockRestore()
  })
})
