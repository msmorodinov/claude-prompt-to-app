import { useCallback, useState } from 'react'
import type { ChatAskMessage, InputQuestion } from '../types'
import SingleSelect from './input/SingleSelect'
import MultiSelect from './input/MultiSelect'
import FreeText from './input/FreeText'
import RankPriorities from './input/RankPriorities'
import SliderScale from './input/SliderScale'
import Matrix2x2 from './input/Matrix2x2'
import TagInput from './input/TagInput'

interface Props {
  message: ChatAskMessage
  onSubmit: (askId: string, answers: Record<string, unknown>) => void
  readOnly?: boolean
}

export default function AskMessage({ message, onSubmit, readOnly }: Props) {
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
          initial[(q as any).id ?? 'unknown'] = null
          break
      }
    }
    return initial
  })

  const updateAnswer = useCallback((id: string, value: unknown) => {
    setAnswers((prev) => ({ ...prev, [id]: value }))
  }, [])

  const handleSubmit = () => {
    onSubmit(message.id, answers)
  }

  const renderQuestion = (q: InputQuestion) => {
    const disabled = message.answered || !!readOnly
    switch (q.type) {
      case 'single_select':
        return (
          <SingleSelect
            key={q.id}
            {...q}
            value={answers[q.id] as string | undefined}
            onChange={(v) => updateAnswer(q.id, v)}
            disabled={disabled}
          />
        )
      case 'multi_select':
        return (
          <MultiSelect
            key={q.id}
            {...q}
            value={(answers[q.id] as string[]) || []}
            onChange={(v) => updateAnswer(q.id, v)}
            disabled={disabled}
          />
        )
      case 'free_text':
        return (
          <FreeText
            key={q.id}
            {...q}
            value={(answers[q.id] as string) || ''}
            onChange={(v) => updateAnswer(q.id, v)}
            disabled={disabled}
          />
        )
      case 'rank_priorities':
        return (
          <RankPriorities
            key={q.id}
            {...q}
            value={(answers[q.id] as string[]) || []}
            onChange={(v) => updateAnswer(q.id, v)}
            disabled={disabled}
          />
        )
      case 'slider_scale':
        return (
          <SliderScale
            key={q.id}
            {...q}
            value={(answers[q.id] as number) ?? q.min}
            onChange={(v) => updateAnswer(q.id, v)}
            disabled={disabled}
          />
        )
      case 'matrix_2x2':
        return (
          <Matrix2x2
            key={q.id}
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
            key={q.id}
            {...q}
            value={(answers[q.id] as string[]) || []}
            onChange={(v) => updateAnswer(q.id, v)}
            disabled={disabled}
          />
        )
      default:
        return <pre key={(q as any).id ?? 'unknown'} className="widget widget-fallback">{JSON.stringify(q, null, 2)}</pre>
    }
  }

  return (
    <div className={`message ask-message ${message.answered ? 'answered' : ''}`}>
      {message.preamble && <div className="preamble">{message.preamble}</div>}
      <div className="questions">
        {message.questions.map((q) => renderQuestion(q))}
      </div>
      {!message.answered && !readOnly && (
        <button onClick={handleSubmit} className="submit-btn">
          Submit
        </button>
      )}
    </div>
  )
}
