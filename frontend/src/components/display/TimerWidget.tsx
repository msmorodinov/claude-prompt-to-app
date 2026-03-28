import { useEffect, useState } from 'react'

interface Props {
  seconds: number
  label?: string
}

export default function TimerWidget({ seconds, label }: Props) {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.round(seconds) : 0
  const [remaining, setRemaining] = useState(safeSeconds)

  useEffect(() => {
    setRemaining(safeSeconds)
    if (safeSeconds <= 0) return
    const interval = setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)
    return () => clearInterval(interval)
  }, [safeSeconds])

  const mins = Math.floor(remaining / 60)
  const secs = remaining % 60

  return (
    <div className="widget widget-timer">
      {label && <div className="timer-label">{label}</div>}
      <div className="timer-display">
        {mins}:{secs.toString().padStart(2, '0')}
      </div>
    </div>
  )
}
