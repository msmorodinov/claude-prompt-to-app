import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import ImageSelect from '../../components/input/ImageSelect'
import type { ImageSelectQuestion } from '../../types'

const question: ImageSelectQuestion = {
  type: 'image_select',
  id: 'slide_pick',
  label: 'Pick slides to revise',
  multi: true,
  images: [
    { id: 'img1', file: 'slide_01.png', url: 'https://r2.example.com/slide_01.png', caption: 'Slide 1', seq: 1 },
    { id: 'img2', file: 'slide_02.png', url: 'https://r2.example.com/slide_02.png', caption: 'Slide 2', seq: 2 },
  ],
}

describe('ImageSelect', () => {
  it('renders label', () => {
    render(<ImageSelect question={question} value={[]} onChange={vi.fn()} />)
    expect(screen.getByText('Pick slides to revise')).toBeInTheDocument()
  })

  it('renders all images', () => {
    render(<ImageSelect question={question} value={[]} onChange={vi.fn()} />)
    expect(screen.getAllByRole('img')).toHaveLength(2)
  })

  it('shows captions', () => {
    render(<ImageSelect question={question} value={[]} onChange={vi.fn()} />)
    expect(screen.getByText('Slide 1')).toBeInTheDocument()
  })

  it('calls onChange with selected id on click (multi)', () => {
    const onChange = vi.fn()
    render(<ImageSelect question={question} value={[]} onChange={onChange} />)
    const items = screen.getAllByRole('checkbox')
    fireEvent.click(items[0])
    expect(onChange).toHaveBeenCalledWith('slide_pick', ['img1'])
  })

  it('toggles off already-selected item (multi)', () => {
    const onChange = vi.fn()
    render(<ImageSelect question={question} value={['img1']} onChange={onChange} />)
    const items = screen.getAllByRole('checkbox')
    fireEvent.click(items[0])
    expect(onChange).toHaveBeenCalledWith('slide_pick', [])
  })

  it('shows check mark for selected item', () => {
    render(<ImageSelect question={question} value={['img1']} onChange={vi.fn()} />)
    expect(screen.getByText('✓')).toBeInTheDocument()
  })

  it('single-select mode uses radio role', () => {
    const q: ImageSelectQuestion = { ...question, multi: false }
    render(<ImageSelect question={q} value={undefined} onChange={vi.fn()} />)
    expect(screen.getAllByRole('radio')).toHaveLength(2)
  })

  it('single-select calls onChange with string value', () => {
    const onChange = vi.fn()
    const q: ImageSelectQuestion = { ...question, multi: false }
    render(<ImageSelect question={q} value={undefined} onChange={onChange} />)
    fireEvent.click(screen.getAllByRole('radio')[0])
    expect(onChange).toHaveBeenCalledWith('slide_pick', 'img1')
  })

  it('does not call onChange in readOnly mode', () => {
    const onChange = vi.fn()
    render(<ImageSelect question={question} value={[]} onChange={onChange} readOnly />)
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(onChange).not.toHaveBeenCalled()
  })

  it('sorts images by seq', () => {
    const q: ImageSelectQuestion = {
      ...question,
      images: [
        { id: 'img2', file: 'slide_02.png', seq: 2 },
        { id: 'img1', file: 'slide_01.png', seq: 1 },
      ],
    }
    render(<ImageSelect question={q} value={[]} onChange={vi.fn()} />)
    const imgs = screen.getAllByRole('img')
    expect(imgs[0]).toHaveAttribute('alt', 'img1')
  })
})
