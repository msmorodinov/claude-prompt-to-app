import { useEffect, useState, lazy, Suspense } from 'react'
import type {
  PromptVersion,
  PromptVersionFull,
} from '../../api-admin'
import { errorMessage, fetchAppVersions, fetchVersionFull } from '../../api-admin'

const VersionDiff = lazy(() => import('./VersionDiff'))

interface Props {
  appId: number
  onClose: () => void
}

export default function VersionHistory({ appId, onClose }: Props) {
  const [versions, setVersions] = useState<PromptVersion[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedId, setExpandedId] = useState<number | null>(null)
  const [selectedIds, setSelectedIds] = useState<number[]>([])
  const [diffLeft, setDiffLeft] = useState<PromptVersionFull | null>(null)
  const [diffRight, setDiffRight] = useState<PromptVersionFull | null>(null)
  const [diffLoading, setDiffLoading] = useState(false)
  const [diffError, setDiffError] = useState<string | null>(null)
  const [showDiff, setShowDiff] = useState(false)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchAppVersions(appId)
      .then(setVersions)
      .catch((err: unknown) => {
        setError(errorMessage(err, 'Failed to load versions'))
      })
      .finally(() => setLoading(false))
  }, [appId])

  function toggleExpand(id: number) {
    setExpandedId((prev) => (prev === id ? null : id))
  }

  function toggleSelect(id: number, e: React.MouseEvent) {
    e.stopPropagation()
    setSelectedIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((x) => x !== id)
      }
      if (prev.length >= 2) {
        return [prev[1], id]
      }
      return [...prev, id]
    })
  }

  async function handleCompare() {
    if (selectedIds.length !== 2) return
    setDiffLoading(true)
    setDiffError(null)
    try {
      const [left, right] = await Promise.all([
        fetchVersionFull(appId, selectedIds[0]),
        fetchVersionFull(appId, selectedIds[1]),
      ])
      setDiffLeft(left)
      setDiffRight(right)
      setShowDiff(true)
    } catch (err: unknown) {
      setDiffError(errorMessage(err, 'Failed to load diff'))
    } finally {
      setDiffLoading(false)
    }
  }

  function handleCloseDiff() {
    setShowDiff(false)
    setDiffLeft(null)
    setDiffRight(null)
  }

  const total = versions.length

  return (
    <div className="version-history">
      <div className="version-history-header">
        <h2 className="version-history-title">Version History</h2>
        <button className="version-history-close" onClick={onClose} aria-label="Close">
          &#x2715;
        </button>
      </div>

      {loading && (
        <p className="version-history-status">Loading versions...</p>
      )}

      {error && (
        <p className="version-history-error">{error}</p>
      )}

      {!loading && !error && versions.length === 0 && (
        <p className="version-history-status">No versions found.</p>
      )}

      <div className="version-list">
        {versions.map((v, index) => {
          const vNum = total - index
          const isExpanded = expandedId === v.id
          const isSelected = selectedIds.includes(v.id)
          return (
            <div
              key={v.id}
              className={`version-card${isSelected ? ' selected' : ''}`}
              onClick={() => toggleExpand(v.id)}
            >
              <div className="version-card-header">
                <label
                  className="version-card-checkbox-label"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => {}}
                    onClick={(e) => toggleSelect(v.id, e)}
                    className="version-card-checkbox"
                  />
                </label>
                <span className="version-number">v{vNum}</span>
                <span className="version-date">
                  {new Date(v.created_at).toLocaleString()}
                </span>
              </div>

              <div className="version-card-note">
                {v.change_note ? (
                  v.change_note
                ) : (
                  <span className="version-no-note">No note</span>
                )}
              </div>

              {!isExpanded && (
                <div className="version-body-preview">
                  {v.body_preview.length > 200
                    ? v.body_preview.slice(0, 200) + '...'
                    : v.body_preview}
                </div>
              )}

              {isExpanded && (
                <ExpandedBody appId={appId} versionId={v.id} />
              )}
            </div>
          )
        })}
      </div>

      {selectedIds.length === 2 && (
        <div className="version-compare-bar">
          {diffError && (
            <span className="version-diff-error">{diffError}</span>
          )}
          <button
            className="version-compare-btn"
            onClick={handleCompare}
            disabled={diffLoading}
          >
            {diffLoading ? 'Loading...' : 'Compare'}
          </button>
        </div>
      )}

      {showDiff && diffLeft && diffRight && (
        <div className="version-diff-overlay">
          <Suspense fallback={<div className="version-diff-loading">Loading diff...</div>}>
            <VersionDiff
              left={diffLeft}
              right={diffRight}
              onClose={handleCloseDiff}
            />
          </Suspense>
        </div>
      )}
    </div>
  )
}

// Sub-component that fetches and displays full body on expand
interface ExpandedBodyProps {
  appId: number
  versionId: number
}

function ExpandedBody({ appId, versionId }: ExpandedBodyProps) {
  const [body, setBody] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchVersionFull(appId, versionId)
      .then((v) => setBody(v.body))
      .catch((err: unknown) => {
        setError(errorMessage(err, 'Failed to load body'))
      })
      .finally(() => setLoading(false))
  }, [appId, versionId])

  if (loading) return <div className="version-body-full">Loading...</div>
  if (error) return <div className="version-body-full version-body-error">{error}</div>
  return <pre className="version-body-full">{body}</pre>
}
