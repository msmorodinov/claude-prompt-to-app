import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import Lightbox from '../../components/display/Lightbox'
import type { GalleryImage } from '../../types'

const images: GalleryImage[] = [
  { id: 'img1', file: 'slide_01.png', url: 'https://r2.example.com/slide_01.png', caption: 'First' },
  { id: 'img2', file: 'slide_02.png', url: 'https://r2.example.com/slide_02.png', caption: 'Second' },
  { id: 'img3', file: 'slide_03.png', url: 'https://r2.example.com/slide_03.png' },
]

describe('Lightbox', () => {
  it('renders current image', () => {
    const onClose = vi.fn()
    render(<Lightbox images={images} activeIndex={0} onClose={onClose} onNext={vi.fn()} onPrev={vi.fn()} />)
    const img = screen.getByRole('img')
    expect(img).toHaveAttribute('src', 'https://r2.example.com/slide_01.png')
  })

  it('shows caption when present', () => {
    render(<Lightbox images={images} activeIndex={0} onClose={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />)
    expect(screen.getByText('First')).toBeInTheDocument()
  })

  it('shows counter', () => {
    render(<Lightbox images={images} activeIndex={1} onClose={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />)
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('calls onClose when close button clicked', () => {
    const onClose = vi.fn()
    render(<Lightbox images={images} activeIndex={0} onClose={onClose} onNext={vi.fn()} onPrev={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Close'))
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onNext when next button clicked', () => {
    const onNext = vi.fn()
    render(<Lightbox images={images} activeIndex={0} onClose={vi.fn()} onNext={onNext} onPrev={vi.fn()} />)
    fireEvent.click(screen.getByLabelText('Next'))
    expect(onNext).toHaveBeenCalled()
  })

  it('calls onPrev when prev button clicked', () => {
    const onPrev = vi.fn()
    render(<Lightbox images={images} activeIndex={1} onClose={vi.fn()} onNext={vi.fn()} onPrev={onPrev} />)
    fireEvent.click(screen.getByLabelText('Previous'))
    expect(onPrev).toHaveBeenCalled()
  })

  it('calls onClose on Escape key', () => {
    const onClose = vi.fn()
    render(<Lightbox images={images} activeIndex={0} onClose={onClose} onNext={vi.fn()} onPrev={vi.fn()} />)
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).toHaveBeenCalled()
  })

  it('calls onNext on ArrowRight key', () => {
    const onNext = vi.fn()
    render(<Lightbox images={images} activeIndex={0} onClose={vi.fn()} onNext={onNext} onPrev={vi.fn()} />)
    fireEvent.keyDown(document, { key: 'ArrowRight' })
    expect(onNext).toHaveBeenCalled()
  })

  it('calls onPrev on ArrowLeft key', () => {
    const onPrev = vi.fn()
    render(<Lightbox images={images} activeIndex={1} onClose={vi.fn()} onNext={vi.fn()} onPrev={onPrev} />)
    fireEvent.keyDown(document, { key: 'ArrowLeft' })
    expect(onPrev).toHaveBeenCalled()
  })

  it('returns null for out-of-range index', () => {
    const { container } = render(
      <Lightbox images={images} activeIndex={99} onClose={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />,
    )
    expect(container.firstChild).toBeNull()
  })

  it('hides nav buttons for single image', () => {
    const single = [images[0]]
    render(<Lightbox images={single} activeIndex={0} onClose={vi.fn()} onNext={vi.fn()} onPrev={vi.fn()} />)
    expect(screen.queryByLabelText('Next')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Previous')).not.toBeInTheDocument()
  })
})
