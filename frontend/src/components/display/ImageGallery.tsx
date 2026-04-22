import { useState } from 'react'
import type { ImageGalleryWidget } from '../../types'
import Lightbox from './Lightbox'

interface Props {
  widget: ImageGalleryWidget
}

export default function ImageGallery({ widget }: Props) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null)
  const images = [...widget.images].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0))

  const openLightbox = (idx: number) => setLightboxIndex(idx)
  const closeLightbox = () => setLightboxIndex(null)
  const goNext = () =>
    setLightboxIndex((i) => (i !== null ? (i + 1) % images.length : null))
  const goPrev = () =>
    setLightboxIndex((i) => (i !== null ? (i - 1 + images.length) % images.length : null))

  return (
    <div className="image-gallery widget">
      {widget.title && <h3 className="image-gallery-title">{widget.title}</h3>}
      <div className="image-gallery-grid">
        {images.map((img, idx) => (
          <div
            key={img.id}
            className="image-gallery-item"
            onClick={() => openLightbox(idx)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && openLightbox(idx)}
            aria-label={img.caption || `Slide ${idx + 1}`}
          >
            <img
              src={img.url || img.file}
              alt={img.caption || `Slide ${idx + 1}`}
              className="image-gallery-thumb"
              loading="lazy"
            />
            {img.caption && <p className="image-gallery-caption">{img.caption}</p>}
          </div>
        ))}
      </div>
      {lightboxIndex !== null && (
        <Lightbox
          images={images}
          activeIndex={lightboxIndex}
          onClose={closeLightbox}
          onNext={goNext}
          onPrev={goPrev}
        />
      )}
    </div>
  )
}
