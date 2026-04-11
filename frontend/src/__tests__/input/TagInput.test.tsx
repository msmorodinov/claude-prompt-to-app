import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import TagInput from '../../components/input/TagInput'

describe('TagInput', () => {
  it('renders label', () => {
    render(
      <TagInput id="q1" label="5 brand words" value={[]} onChange={vi.fn()} />,
    )
    expect(screen.getByText('5 brand words')).toBeInTheDocument()
  })

  it('renders existing tags', () => {
    render(
      <TagInput
        id="q1"
        label="Tags"
        value={['fast', 'reliable']}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByText('fast')).toBeInTheDocument()
    expect(screen.getByText('reliable')).toBeInTheDocument()
  })

  it('adds tag on Enter', () => {
    const onChange = vi.fn()
    render(<TagInput id="q1" label="Tags" value={[]} onChange={onChange} />)
    const input = screen.getByPlaceholderText('Type and press Enter')
    fireEvent.change(input, { target: { value: 'innovation' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(onChange).toHaveBeenCalledWith(['innovation'])
  })

  it('removes tag on X click', () => {
    const onChange = vi.fn()
    render(
      <TagInput
        id="q1"
        label="Tags"
        value={['fast', 'reliable']}
        onChange={onChange}
      />,
    )
    const removeButtons = screen.getAllByText('×')
    fireEvent.click(removeButtons[0])
    expect(onChange).toHaveBeenCalledWith(['reliable'])
  })

  it('shows limit message when at max_tags', () => {
    render(
      <TagInput
        id="q1"
        label="Tags"
        value={['fast', 'reliable']}
        max_tags={2}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('constraint-hint')).toHaveTextContent(
      'Maximum 2 tags reached',
    )
  })

  it('shows count when max_tags defined and not at limit', () => {
    render(
      <TagInput
        id="q1"
        label="Tags"
        value={['fast']}
        max_tags={5}
        onChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('constraint-hint')).toHaveTextContent('1 / 5 tags')
  })
})
