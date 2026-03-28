import { render, screen, act } from '@testing-library/react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import TimerWidget from '../../components/display/TimerWidget'

describe('TimerWidget', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('renders initial time', () => {
    render(<TimerWidget seconds={600} />)
    expect(screen.getByText('10:00')).toBeInTheDocument()
  })

  it('renders label when provided', () => {
    render(<TimerWidget seconds={60} label="Don't overthink" />)
    expect(screen.getByText("Don't overthink")).toBeInTheDocument()
  })

  it('decrements every second', () => {
    render(<TimerWidget seconds={5} />)
    expect(screen.getByText('0:05')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('0:04')).toBeInTheDocument()
    act(() => { vi.advanceTimersByTime(1000) })
    expect(screen.getByText('0:03')).toBeInTheDocument()
  })

  it('stops at zero', () => {
    render(<TimerWidget seconds={2} />)
    act(() => { vi.advanceTimersByTime(3000) })
    expect(screen.getByText('0:00')).toBeInTheDocument()
  })

  it('handles NaN seconds', () => {
    render(<TimerWidget seconds={NaN} />)
    expect(screen.getByText('0:00')).toBeInTheDocument()
  })

  it('handles undefined seconds', () => {
    render(<TimerWidget seconds={undefined as any} />)
    expect(screen.getByText('0:00')).toBeInTheDocument()
  })

  it('handles negative seconds', () => {
    render(<TimerWidget seconds={-5} />)
    expect(screen.getByText('0:00')).toBeInTheDocument()
  })
})
