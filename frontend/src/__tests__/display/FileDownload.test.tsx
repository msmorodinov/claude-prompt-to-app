import { render, screen } from '@testing-library/react'
import { describe, expect, it, beforeEach } from 'vitest'
import FileDownload from '../../components/display/FileDownload'
import type { FileDownloadWidget } from '../../types'

const widget: FileDownloadWidget = {
  type: 'file_download',
  kind: 'zip',
  filename: 'carousel.zip',
  label: 'Download your carousel',
}

describe('FileDownload', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('renders filename', () => {
    render(<FileDownload widget={widget} sessionId="sess123" />)
    expect(screen.getByText('carousel.zip')).toBeInTheDocument()
  })

  it('renders label', () => {
    render(<FileDownload widget={widget} sessionId="sess123" />)
    expect(screen.getByText('Download your carousel')).toBeInTheDocument()
  })

  it('renders download button', () => {
    render(<FileDownload widget={widget} sessionId="sess123" />)
    expect(screen.getByRole('button', { name: /download/i })).toBeInTheDocument()
  })

  it('button is disabled when no sessionId', () => {
    render(<FileDownload widget={widget} />)
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('button is enabled when sessionId provided', () => {
    render(<FileDownload widget={widget} sessionId="sess123" />)
    expect(screen.getByRole('button')).not.toBeDisabled()
  })

  it('renders without optional label', () => {
    const w: FileDownloadWidget = { type: 'file_download', filename: 'slides.zip' }
    render(<FileDownload widget={w} sessionId="sess123" />)
    expect(screen.getByText('slides.zip')).toBeInTheDocument()
  })
})
