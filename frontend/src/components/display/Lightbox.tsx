import { useCallback, useEffect } from 'react'
import type { GalleryImage } from '../../types'

interface Props {
  images: GalleryImage[]
  activeIndex: number
  onClose: () => void
  onNext: () => void
  onPrev: () => void
}

export default function Lightbox({ images, activeIndex, onClose, onNext, onPrev }: Props) {
  const img = images[activeIndex]

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') onNext()
      if (e.key === 'ArrowLeft') onPrev()
    },
    [onClose, onNext, onPrev],
  )

  useEffect(() => {
    document.addEventListener('keydown', handleKey)
    return () => document.removeEventListener('keydown', handleKey)
  }, [handleKey])

  if (!img) return null

  return (
    <div className="lightbox-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <button className="lightbox-close" onClick={onClose} aria-label="Close">
          ✕
        </button>
        {images.length > 1 && (
          <button className="lightbox-prev" onClick={onPrev} aria-label="Previous">
            ‹
          </button>
        )}
        <img
          src={img.url || img.file}
          alt={img.caption || `Slide ${activeIndex + 1}`}
          className="lightbox-img"
        />
        {images.length > 1 && (
          <button className="lightbox-next" onClick={onNext} aria-label="Next">
            ›
          </button>
        )}
        <div className="lightbox-footer">
          {img.caption && <span className="lightbox-caption">{img.caption}</span>}
          <span className="lightbox-counter">
            {activeIndex + 1} / {images.length}
          </span>
        </div>
      </div>
    </div>
  )
}
