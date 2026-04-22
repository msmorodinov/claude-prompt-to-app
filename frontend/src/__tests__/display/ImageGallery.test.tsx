import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import ImageGallery from '../../components/display/ImageGallery'
import type { ImageGalleryWidget } from '../../types'

const widget: ImageGalleryWidget = {
  type: 'image_gallery',
  title: 'Test Gallery',
  images: [
    { id: 'img1', file: 'slide_01.png', url: 'https://r2.example.com/slide_01.png', caption: 'Slide 1', seq: 1 },
    { id: 'img2', file: 'slide_02.png', url: 'https://r2.example.com/slide_02.png', caption: 'Slide 2', seq: 2 },
    { id: 'img3', file: 'slide_03.png', url: 'https://r2.example.com/slide_03.png', seq: 3 },
  ],
}

describe('ImageGallery', () => {
  it('renders title and all images', () => {
    render(<ImageGallery widget={widget} />)
    expect(screen.getByText('Test Gallery')).toBeInTheDocument()
    const imgs = screen.getAllByRole('img')
    expect(imgs).toHaveLength(3)
  })

  it('shows caption under image', () => {
    render(<ImageGallery widget={widget} />)
    expect(screen.getByText('Slide 1')).toBeInTheDocument()
    expect(screen.getByText('Slide 2')).toBeInTheDocument()
  })

  it('uses url when available, falls back to file', () => {
    render(<ImageGallery widget={widget} />)
    const imgs = screen.getAllByRole('img')
    expect(imgs[0]).toHaveAttribute('src', 'https://r2.example.com/slide_01.png')
  })

  it('opens lightbox on click', () => {
    render(<ImageGallery widget={widget} />)
    const items = screen.getAllByRole('button')
    fireEvent.click(items[0])
    // lightbox renders the image in a dialog
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('closes lightbox on overlay click', () => {
    render(<ImageGallery widget={widget} />)
    const items = screen.getAllByRole('button')
    fireEvent.click(items[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    // Click the overlay (the dialog itself)
    fireEvent.click(screen.getByRole('dialog'))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('navigates with arrow buttons', () => {
    render(<ImageGallery widget={widget} />)
    fireEvent.click(screen.getAllByRole('button')[0])
    const nextBtn = screen.getByLabelText('Next')
    fireEvent.click(nextBtn)
    // counter should now show 2/3
    expect(screen.getByText('2 / 3')).toBeInTheDocument()
  })

  it('closes lightbox with Escape key', () => {
    render(<ImageGallery widget={widget} />)
    fireEvent.click(screen.getAllByRole('button')[0])
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('renders without title when not provided', () => {
    const w: ImageGalleryWidget = { type: 'image_gallery', images: widget.images }
    render(<ImageGallery widget={w} />)
    expect(screen.queryByText('Test Gallery')).not.toBeInTheDocument()
  })

  it('sorts images by seq', () => {
    const shuffled: ImageGalleryWidget = {
      type: 'image_gallery',
      images: [
        { id: 'img3', file: 'slide_03.png', seq: 3 },
        { id: 'img1', file: 'slide_01.png', seq: 1 },
        { id: 'img2', file: 'slide_02.png', seq: 2 },
      ],
    }
    render(<ImageGallery widget={shuffled} />)
    const imgs = screen.getAllByRole('img')
    expect(imgs[0]).toHaveAttribute('alt', 'Slide 1')
  })
})
