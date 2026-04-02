import React, { useRef, useCallback } from 'react'
import type { ValidationReference } from '../../api-admin'

interface PromptHighlighterProps {
  value: string
  onChange: (value: string) => void
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void
  references: ValidationReference[] | null  // null = no validation yet
  spellCheck?: boolean
  placeholder?: string
}

export function PromptHighlighter({ value, onChange, onKeyDown, references, spellCheck = false, placeholder }: PromptHighlighterProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const backdropRef = useRef<HTMLDivElement>(null)

  const handleScroll = useCallback(() => {
    if (textareaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textareaRef.current.scrollTop
      backdropRef.current.scrollLeft = textareaRef.current.scrollLeft
    }
  }, [])

  const isActive = references !== null && references.length > 0

  // Build highlighted HTML
  const highlightedHTML = isActive ? buildHighlightedHTML(value, references) : null

  if (!isActive) {
    // Plain textarea, no overlay
    return (
      <textarea
        className="prompt-textarea"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        rows={20}
        spellCheck={spellCheck}
        placeholder={placeholder}
      />
    )
  }

  return (
    <div className="prompt-highlight-container">
      <div
        ref={backdropRef}
        className="prompt-highlight-backdrop"
        dangerouslySetInnerHTML={{ __html: highlightedHTML! }}
      />
      <textarea
        ref={textareaRef}
        className="prompt-textarea prompt-textarea--highlighted"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={onKeyDown}
        onScroll={handleScroll}
        rows={20}
        spellCheck={spellCheck}
        placeholder={placeholder}
      />
    </div>
  )
}

// --- Quote matching (exact only, skip if not verbatim) ---
function findQuotePosition(text: string, quote: string): number {
  return text.indexOf(quote)
}

// --- HTML escape ---
function escapeHTML(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

// --- Build highlighted HTML from references ---
function buildHighlightedHTML(text: string, refs: ValidationReference[]): string {
  // Find all match positions, sort by position
  const matches: { start: number; end: number; status: string }[] = []

  for (const ref of refs) {
    const pos = findQuotePosition(text, ref.quote)
    if (pos === -1) continue
    matches.push({ start: pos, end: pos + ref.quote.length, status: ref.status })
  }

  // Sort by start position, earlier wins for overlaps
  matches.sort((a, b) => a.start - b.start)

  // Remove overlapping matches (earlier position wins)
  const filtered: typeof matches = []
  let lastEnd = 0
  for (const m of matches) {
    if (m.start >= lastEnd) {
      filtered.push(m)
      lastEnd = m.end
    }
  }

  // Build HTML
  let result = ''
  let cursor = 0
  for (const m of filtered) {
    if (m.start > cursor) {
      result += escapeHTML(text.slice(cursor, m.start))
    }
    result += `<mark class="ref-${m.status}">${escapeHTML(text.slice(m.start, m.end))}</mark>`
    cursor = m.end
  }
  if (cursor < text.length) {
    result += escapeHTML(text.slice(cursor))
  }

  return result
}
