import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import userEvent from '@testing-library/user-event'
import AskMessage from '../components/AskMessage'
import type { ChatAskMessage } from '../types'

function makeMessage(overrides: Partial<ChatAskMessage> = {}): ChatAskMessage {
  return {
    role: 'ask',
    id: 'ask-1',
    preamble: undefined,
    questions: [],
    answered: false,
    answers: undefined,
    ...overrides,
  }
}

describe('AskMessage validation', () => {
  it('blocks submit when single_select has no selection', () => {
    const onSubmit = vi.fn()
    const message = makeMessage({
      questions: [
        { type: 'single_select', id: 'q1', label: 'Pick one', options: ['A', 'B'] },
      ],
    })
    render(<AskMessage message={message} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByTestId('submit-btn'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('error-q1')).toHaveTextContent('Please select an option')
  })

  it('blocks submit when multi_select is empty', () => {
    const onSubmit = vi.fn()
    const message = makeMessage({
      questions: [
        { type: 'multi_select', id: 'q1', label: 'Pick some', options: ['A', 'B'] },
      ],
    })
    render(<AskMessage message={message} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByTestId('submit-btn'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('error-q1')).toHaveTextContent('Please select at least one option')
  })

  it('blocks submit when free_text is empty', () => {
    const onSubmit = vi.fn()
    const message = makeMessage({
      questions: [
        { type: 'free_text', id: 'q1', label: 'Describe', multiline: true },
      ],
    })
    render(<AskMessage message={message} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByTestId('submit-btn'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('error-q1')).toHaveTextContent('Please enter a response')
  })

  it('blocks submit when tag_input is empty', () => {
    const onSubmit = vi.fn()
    const message = makeMessage({
      questions: [
        { type: 'tag_input', id: 'q1', label: 'Add tags' },
      ],
    })
    render(<AskMessage message={message} onSubmit={onSubmit} />)
    fireEvent.click(screen.getByTestId('submit-btn'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('error-q1')).toHaveTextContent('Please add at least one tag')
  })

  it('submits successfully when all fields valid', () => {
    const onSubmit = vi.fn()
    const message = makeMessage({
      questions: [
        { type: 'single_select', id: 'q1', label: 'Pick one', options: ['A', 'B'] },
      ],
    })
    render(<AskMessage message={message} onSubmit={onSubmit} />)
    // Select option A
    fireEvent.click(screen.getByLabelText('A'))
    fireEvent.click(screen.getByTestId('submit-btn'))
    expect(onSubmit).toHaveBeenCalledWith('ask-1', expect.objectContaining({ q1: 'A' }))
  })

  it('clears error when user updates answer', () => {
    const onSubmit = vi.fn()
    const message = makeMessage({
      questions: [
        { type: 'single_select', id: 'q1', label: 'Pick one', options: ['A', 'B'] },
      ],
    })
    render(<AskMessage message={message} onSubmit={onSubmit} />)
    // Trigger validation error
    fireEvent.click(screen.getByTestId('submit-btn'))
    expect(screen.getByTestId('error-q1')).toBeInTheDocument()
    // Now select an option — error should clear
    fireEvent.click(screen.getByLabelText('A'))
    expect(screen.queryByTestId('error-q1')).not.toBeInTheDocument()
  })

  it('disables submit button during submission', async () => {
    let resolveSubmit: () => void
    const submitPromise = new Promise<void>((resolve) => { resolveSubmit = resolve })
    const onSubmit = vi.fn(() => submitPromise)

    const message: ChatAskMessage = {
      role: 'ask',
      id: 'ask-submit-test',
      questions: [{ type: 'free_text', id: 'q1', label: 'Name' }],
      answered: false,
    }

    render(<AskMessage message={message} onSubmit={onSubmit} />)

    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'test answer')

    const submitBtn = screen.getByTestId('submit-btn')
    expect(submitBtn).not.toBeDisabled()

    await userEvent.click(submitBtn)
    expect(submitBtn).toBeDisabled()

    await act(async () => { resolveSubmit!() })
  })

  it('re-enables submit button after submission error', async () => {
    const error = new Error('Network error')
    const onSubmit = vi.fn(() => Promise.reject(error))

    const message: ChatAskMessage = {
      role: 'ask',
      id: 'ask-err-test',
      questions: [{ type: 'free_text', id: 'q1', label: 'Name' }],
      answered: false,
    }

    render(<AskMessage message={message} onSubmit={onSubmit} />)

    const input = screen.getByRole('textbox')
    await userEvent.type(input, 'test answer')

    await userEvent.click(screen.getByTestId('submit-btn'))

    await waitFor(() => {
      expect(screen.getByTestId('submit-btn')).not.toBeDisabled()
    })
  })

  it('blocks submit when multi_select below min_select', () => {
    const onSubmit = vi.fn()
    const message = makeMessage({
      questions: [
        {
          type: 'multi_select',
          id: 'q1',
          label: 'Pick some',
          options: ['A', 'B', 'C'],
          min_select: 2,
        },
      ],
    })
    render(<AskMessage message={message} onSubmit={onSubmit} />)
    // Select only one checkbox
    const checkboxes = screen.getAllByRole('checkbox')
    fireEvent.click(checkboxes[0])
    fireEvent.click(screen.getByTestId('submit-btn'))
    expect(onSubmit).not.toHaveBeenCalled()
    expect(screen.getByTestId('error-q1')).toHaveTextContent('Select at least 2')
  })
})
