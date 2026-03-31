import { useMemo } from 'react'
import DiffMatchPatch from 'diff-match-patch'
import type { PromptVersionFull } from '../../api-admin'

interface Props {
  left: PromptVersionFull
  right: PromptVersionFull
  onClose: () => void
}

export default function VersionDiff({ left, right, onClose }: Props) {
  const diffs = useMemo(() => {
    const dmp = new DiffMatchPatch()
    const d = dmp.diff_main(left.body, right.body)
    dmp.diff_cleanupSemantic(d)
    return d
  }, [left.body, right.body])

  return (
    <div className="version-diff">
      <div className="version-diff-header">
        <div className="version-diff-title">
          <span className="version-diff-label diff-label-del">
            v{left.id} &mdash; {new Date(left.created_at).toLocaleString()}
          </span>
          <span className="version-diff-arrow">&#x2192;</span>
          <span className="version-diff-label diff-label-add">
            v{right.id} &mdash; {new Date(right.created_at).toLocaleString()}
          </span>
        </div>
        <button className="version-diff-close" onClick={onClose} aria-label="Close diff">
          &#x2715;
        </button>
      </div>

      <div className="version-diff-body">
        <pre className="version-diff-content">
          {diffs.map(([op, text], i) => {
            if (op === DiffMatchPatch.DIFF_INSERT) {
              return (
                <span key={i} className="diff-add">
                  {text}
                </span>
              )
            }
            if (op === DiffMatchPatch.DIFF_DELETE) {
              return (
                <span key={i} className="diff-del">
                  {text}
                </span>
              )
            }
            return <span key={i}>{text}</span>
          })}
        </pre>
      </div>
    </div>
  )
}
