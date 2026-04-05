import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import MessageList from '../components/MessageList'
import type { ChatMessage } from '../types'
import { createRef } from 'react'

function makeScrollRef() {
  return createRef<HTMLDivElement>()
}

const noop = vi.fn()

describe('MessageList', () => {
  it('renders empty list without crashing', () => {
    const { container } = render(
      <MessageList
        messages={[]}
        onAskSubmit={noop}
        scrollRef={makeScrollRef()}
        isLoading={false}
      />,
    )
    expect(container.querySelector('.message-list')).toBeInTheDocument()
  })

  it('does not show Thinking... when isLoading is false', () => {
    render(
      <MessageList
        messages={[]}
        onAskSubmit={noop}
        scrollRef={makeScrollRef()}
        isLoading={false}
      />,
    )
    expect(screen.queryByText('Thinking...')).not.toBeInTheDocument()
  })

  it('shows Thinking... when isLoading is true', () => {
    render(
      <MessageList
        messages={[]}
        onAskSubmit={noop}
        scrollRef={makeScrollRef()}
        isLoading={true}
      />,
    )
    expect(screen.getByText('Thinking...')).toBeInTheDocument()
  })

  it('renders assistant message with widget content', () => {
    const messages: ChatMessage[] = [
      {
        role: 'assistant',
        blocks: [{ type: 'text', content: 'Hello from assistant' }],
      },
    ]
    render(
      <MessageList
        messages={messages}
        onAskSubmit={noop}
        scrollRef={makeScrollRef()}
        isLoading={false}
      />,
    )
    expect(screen.getByText('Hello from assistant')).toBeInTheDocument()
  })

  it('renders ask message with a question label', () => {
    const messages: ChatMessage[] = [
      {
        role: 'ask',
        id: 'ask-1',
        questions: [{ type: 'free_text', id: 'q1', label: 'What is your name?' }],
        answered: false,
      },
    ]
    render(
      <MessageList
        messages={messages}
        onAskSubmit={noop}
        scrollRef={makeScrollRef()}
        isLoading={false}
      />,
    )
    expect(screen.getByText('What is your name?')).toBeInTheDocument()
  })

  it('renders user message with answer values', () => {
    const messages: ChatMessage[] = [
      {
        role: 'user',
        answers: { q1: 'Alice', q2: 'Engineer' },
      },
    ]
    render(
      <MessageList
        messages={messages}
        onAskSubmit={noop}
        scrollRef={makeScrollRef()}
        isLoading={false}
      />,
    )
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.getByText('Engineer')).toBeInTheDocument()
  })

  it('renders research message in loading state with ◎ indicator', () => {
    const messages: ChatMessage[] = [
      { role: 'research', label: 'Searching competitors', done: false },
    ]
    render(
      <MessageList
        messages={messages}
        onAskSubmit={noop}
        scrollRef={makeScrollRef()}
        isLoading={false}
      />,
    )
    expect(screen.getByText('Searching competitors')).toBeInTheDocument()
    expect(screen.getByText('◎')).toBeInTheDocument()
  })

  it('renders research message in done state with ✓ indicator', () => {
    const messages: ChatMessage[] = [
      { role: 'research', label: 'Found results', done: true },
    ]
    render(
      <MessageList
        messages={messages}
        onAskSubmit={noop}
        scrollRef={makeScrollRef()}
        isLoading={false}
      />,
    )
    expect(screen.getByText('Found results')).toBeInTheDocument()
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('renders research message with CSS class "done" when done=true', () => {
    const messages: ChatMessage[] = [
      { role: 'research', label: 'Complete', done: true },
    ]
    const { container } = render(
      <MessageList
        messages={messages}
        onAskSubmit={noop}
        scrollRef={makeScrollRef()}
        isLoading={false}
      />,
    )
    const researchDiv = container.querySelector('.research-message')
    expect(researchDiv).toHaveClass('done')
    expect(researchDiv).not.toHaveClass('loading')
  })

  it('renders research message with CSS class "loading" when done=false', () => {
    const messages: ChatMessage[] = [
      { role: 'research', label: 'Working', done: false },
    ]
    const { container } = render(
      <MessageList
        messages={messages}
        onAskSubmit={noop}
        scrollRef={makeScrollRef()}
        isLoading={false}
      />,
    )
    const researchDiv = container.querySelector('.research-message')
    expect(researchDiv).toHaveClass('loading')
  })

  it('renders multiple messages of different types', () => {
    const messages: ChatMessage[] = [
      { role: 'assistant', blocks: [{ type: 'text', content: 'Welcome' }] },
      {
        role: 'ask',
        id: 'ask-1',
        questions: [{ type: 'free_text', id: 'q1', label: 'Your company?' }],
        answered: false,
      },
      { role: 'user', answers: { q1: 'Acme Corp' } },
    ]
    render(
      <MessageList
        messages={messages}
        onAskSubmit={noop}
        scrollRef={makeScrollRef()}
        isLoading={false}
      />,
    )
    expect(screen.getByText('Welcome')).toBeInTheDocument()
    expect(screen.getByText('Your company?')).toBeInTheDocument()
    expect(screen.getByText('Acme Corp')).toBeInTheDocument()
  })

  it('hides Submit button when ask is answered', () => {
    const messages: ChatMessage[] = [
      {
        role: 'ask',
        id: 'ask-1',
        questions: [{ type: 'free_text', id: 'q1', label: 'Name?' }],
        answered: true,
        answers: { q1: 'Alice' },
      },
    ]
    render(
      <MessageList
        messages={messages}
        onAskSubmit={noop}
        scrollRef={makeScrollRef()}
        isLoading={false}
      />,
    )
    expect(screen.queryByRole('button', { name: /submit/i })).not.toBeInTheDocument()
  })

  it('shows Submit button for unanswered ask', () => {
    const messages: ChatMessage[] = [
      {
        role: 'ask',
        id: 'ask-1',
        questions: [{ type: 'free_text', id: 'q1', label: 'Name?' }],
        answered: false,
      },
    ]
    render(
      <MessageList
        messages={messages}
        onAskSubmit={noop}
        scrollRef={makeScrollRef()}
        isLoading={false}
      />,
    )
    expect(screen.getByRole('button', { name: /submit/i })).toBeInTheDocument()
  })
})
