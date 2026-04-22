import type { FileDownloadWidget } from '../../types'
import { getAuthToken } from '../../contexts/AuthContext'

interface Props {
  widget: FileDownloadWidget
  sessionId?: string
}

export default function FileDownload({ widget, sessionId }: Props) {
  const token = getAuthToken()

  const downloadUrl = sessionId
    ? `/sessions/${sessionId}/files.zip`
    : null

  const handleDownload = () => {
    if (!downloadUrl) return
    const a = document.createElement('a')
    a.href = downloadUrl
    a.download = widget.filename || 'carousel.zip'
    // Auth header for download — use fetch approach
    if (token) {
      fetch(downloadUrl, { headers: { Authorization: `Bearer ${token}` } })
        .then((resp) => resp.blob())
        .then((blob) => {
          const url = URL.createObjectURL(blob)
          a.href = url
          a.click()
          URL.revokeObjectURL(url)
        })
        .catch(() => {
          // Fallback: direct navigation
          a.click()
        })
    } else {
      a.click()
    }
  }

  return (
    <div className="file-download-card widget">
      <div className="file-download-icon">📦</div>
      <div className="file-download-info">
        <span className="file-download-name">{widget.filename}</span>
        {widget.label && <span className="file-download-label">{widget.label}</span>}
      </div>
      <button
        className="file-download-btn"
        onClick={handleDownload}
        disabled={!downloadUrl}
        aria-label={`Download ${widget.filename}`}
      >
        Download ZIP
      </button>
    </div>
  )
}
