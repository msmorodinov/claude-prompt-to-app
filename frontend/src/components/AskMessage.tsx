import { useCallback, useState } from 'react'
import type { ChatAskMessage, InputQuestion, MultiSelectQuestion, TagInputQuestion } from '../types'
import ErrorBoundary from './ErrorBoundary'
import SingleSelect from './input/SingleSelect'
import MultiSelect from './input/MultiSelect'
import FreeText from './input/FreeText'
import RankPriorities from './input/RankPriorities'
import SliderScale from './input/SliderScale'
import Matrix2x2 from './input/Matrix2x2'
import TagInput from './input/TagInput'

interface Props {
  message: ChatAskMessage
  onSubmit: (askId: string, answers: Record<string, unknown>) => void | Promise<void>
}

export default function AskMessage({ message, onSubmit }: Props) {
  const [answers, setAnswers] = useState<Record<string, unknown>>(() => {
    if (message.answers) return message.answers
    const initial: Record<string, unknown> = {}
    for (const q of message.questions) {
      switch (q.type) {
        case 'single_select':
          initial[q.id] = undefined
          break
        case 'multi_select':
          initial[q.id] = []
          break
        case 'free_text':
          initial[q.id] = ''
          break
        case 'rank_priorities':
          initial[q.id] = [...q.items]
          break
        case 'slider_scale':
          initial[q.id] = Math.round((q.min + q.max) / 2)
          break
        case 'matrix_2x2':
          initial[q.id] = {}
          break
        case 'tag_input':
          initial[q.id] = []
          break
        default:
          initial[(q as InputQuestion).id] = null
          break
      }
    }
    return initial
  })

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const updateAnswer = useCallback((id: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [id]: value }))
    setValidationErrors((prev) => {
      if (!prev[id]) return prev
      const { [id]: _, ...rest } = prev
      return rest
    })
  }, [])

  const validateAnswers = (): Record<string, string> => {
    const errors: Record<string, string> = {}
    for (const q of message.questions) {
      switch (q.type) {
        case 'single_select': {
          const val = answers[q.id]
          if (val === undefined || val === null || val === '') {
            errors[q.id] = 'Please select an option'
          }
          break
        }
        case 'multi_select': {
          const val = (answers[q.id] as string[]) || []
          const mq = q as MultiSelectQuestion
          if (val.length === 0) {
            errors[q.id] = 'Please select at least one option'
          } else if (mq.min_select !== undefined && val.length < mq.min_select) {
            errors[q.id] = `Select at least ${mq.min_select}`
          } else if (mq.max_select !== undefined && val.length > mq.max_select) {
            errors[q.id] = `Select at most ${mq.max_select}`
          }
          break
        }
        case 'free_text': {
          const val = (answers[q.id] as string) || ''
          if (!val.trim()) {
            errors[q.id] = 'Please enter a response'
          }
          break
        }
        case 'tag_input': {
          const val = (answers[q.id] as string[]) || []
          const tq = q as TagInputQuestion
          if (val.length === 0) {
            errors[q.id] = 'Please add at least one tag'
          } else if (tq.min_tags !== undefined && val.length < tq.min_tags) {
            errors[q.id] = `Add at least ${tq.min_tags} tags`
          }
          break
        }
        // rank_priorities, slider_scale, matrix_2x2 always have valid defaults
        default:
          break
      }
    }
    return errors
  }

  const handleSubmit = async () => {
    if (isSubmitting) return
    const errors = validateAnswers()
    if (Object.keys(errors).length > 0) {
      setValidationErrors(errors)
      return
    }
    setIsSubmitting(true)
    try {
      await onSubmit(message.id, answers)
    } catch {
      // parent handles errors; just re-enable the button
    } finally {
      setIsSubmitting(false)
    }
  }

  const renderQuestion = (q: InputQuestion) => {
    const disabled = message.answered
    switch (q.type) {
      case 'single_select':
        return (
          <SingleSelect
            {...q}
            value={answers[q.id] as string | undefined}
            onChange={(v) => updateAnswer(q.id, v)}
            disabled={disabled}
          />
        )
      case 'multi_select':
        return (
          <MultiSelect
            {...q}
            value={(answers[q.id] as string[]) || []}
            onChange={(v) => updateAnswer(q.id, v)}
            disabled={disabled}
          />
        )
      case 'free_text':
        return (
          <FreeText
            {...q}
            value={(answers[q.id] as string) || ''}
            onChange={(v) => updateAnswer(q.id, v)}
            disabled={disabled}
          />
        )
      case 'rank_priorities':
        return (
          <RankPriorities
            {...q}
            value={(answers[q.id] as string[]) || []}
            onChange={(v) => updateAnswer(q.id, v)}
            disabled={disabled}
          />
        )
      case 'slider_scale':
        return (
          <SliderScale
            {...q}
            value={(answers[q.id] as number) ?? q.min}
            onChange={(v) => updateAnswer(q.id, v)}
            disabled={disabled}
          />
        )
      case 'matrix_2x2':
        return (
          <Matrix2x2
            {...q}
            value={
              (answers[q.id] as Record<string, { x: number; y: number }>) || {}
            }
            onChange={(v) => updateAnswer(q.id, v)}
            disabled={disabled}
          />
        )
      case 'tag_input':
        return (
          <TagInput
            {...q}
            value={(answers[q.id] as string[]) || []}
            onChange={(v) => updateAnswer(q.id, v)}
            disabled={disabled}
          />
        )
      default:
        return <pre key={(q as InputQuestion).id} className="widget widget-fallback">{JSON.stringify(q, null, 2)}</pre>
    }
  }

  return (
    <div className={`message ask-message ${message.answered ? 'answered' : ''}`} data-testid="ask-message">
      {message.preamble && <div className="preamble">{message.preamble}</div>}
      <div className="questions">
        {message.questions.map((q) => (
          <div key={q.id}>
            <ErrorBoundary>
              {renderQuestion(q)}
            </ErrorBoundary>
            {validationErrors[q.id] && (
              <p className="validation-error" data-testid={`error-${q.id}`}>
                {validationErrors[q.id]}
              </p>
            )}
          </div>
        ))}
      </div>
      {!message.answered && (
        <button
          onClick={handleSubmit}
          className="submit-btn"
          data-testid="submit-btn"
          disabled={isSubmitting}
        >
          {isSubmitting ? 'Submitting...' : 'Submit'}
        </button>
      )}
    </div>
  )
}
