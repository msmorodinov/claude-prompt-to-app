import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import EnvironmentReference from '../components/admin/EnvironmentReference'
import type { EnvironmentInfo, McpServer } from '../api-admin'

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

const mockMcpServers: McpServer[] = [
  { name: 'claude.ai Deepwiki', command: 'https://mcp.deepwiki.com/mcp', status: 'connected' },
  { name: 'claude.ai Gmail', command: 'https://gmail.mcp.claude.com/mcp', status: 'needs_auth' },
]

describe('EnvironmentReference', () => {
  it('renders all sections', () => {
    render(<EnvironmentReference data={mockData} mcpServers={mockMcpServers} onClose={vi.fn()} />)
    expect(screen.getByText('Environment Reference')).toBeTruthy()
    expect(screen.getByText(/Display Widgets/)).toBeTruthy()
    expect(screen.getByText(/Input Widgets/)).toBeTruthy()
    expect(screen.getByText(/Tools/)).toBeTruthy()
    expect(screen.getByText(/MCP Servers/)).toBeTruthy()
  })

  it('renders MCP server names and statuses', () => {
    render(<EnvironmentReference data={mockData} mcpServers={mockMcpServers} onClose={vi.fn()} />)
    expect(screen.getByText('claude.ai Deepwiki')).toBeTruthy()
    expect(screen.getByText('claude.ai Gmail')).toBeTruthy()
  })

  it('renders without MCP servers when empty', () => {
    render(<EnvironmentReference data={mockData} mcpServers={[]} onClose={vi.fn()} />)
    expect(screen.getByText(/MCP Servers \(0\)/)).toBeTruthy()
  })

  it('renders widget types', () => {
    render(<EnvironmentReference data={mockData} mcpServers={mockMcpServers} onClose={vi.fn()} />)
    expect(screen.getByText('text')).toBeTruthy()
    expect(screen.getByText('section_header')).toBeTruthy()
    expect(screen.getByText('free_text')).toBeTruthy()
  })

  it('renders tool names and behaviors', () => {
    render(<EnvironmentReference data={mockData} mcpServers={mockMcpServers} onClose={vi.fn()} />)
    expect(screen.getByText('show')).toBeTruthy()
    expect(screen.getByText('ask')).toBeTruthy()
    expect(screen.getByText('Fire-and-forget')).toBeTruthy()
  })

  it('collapses sections on toggle', () => {
    render(<EnvironmentReference data={mockData} mcpServers={mockMcpServers} onClose={vi.fn()} />)
    const displayToggle = screen.getByText(/Display Widgets/)
    fireEvent.click(displayToggle)
    expect(screen.queryByText('Markdown content')).toBeNull()
  })

  it('calls onClose', () => {
    const onClose = vi.fn()
    render(<EnvironmentReference data={mockData} mcpServers={mockMcpServers} onClose={onClose} />)
    const closeBtn = screen.getByText('\u00d7')
    fireEvent.click(closeBtn)
    expect(onClose).toHaveBeenCalledTimes(1)
  })

  it('shows required and optional field badges', () => {
    render(<EnvironmentReference data={mockData} mcpServers={mockMcpServers} onClose={vi.fn()} />)
    expect(screen.getByText('content')).toBeTruthy()
    expect(screen.getByText('subtitle')).toBeTruthy()
  })
})
