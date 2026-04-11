import type { ReactNode } from 'react'
import { Component } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
  error: Error | null
}

export default class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error) {
    console.error('Widget error caught:', error)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="widget widget-error"
          data-testid="widget-error"
          style={{
            padding: '1rem',
            border: '1px solid #d32f2f',
            borderRadius: '4px',
            backgroundColor: 'rgba(211, 47, 47, 0.05)',
            color: '#d32f2f',
          }}
        >
          <p style={{ margin: '0 0 0.5rem 0', fontWeight: 600 }}>Widget error</p>
          <p style={{ margin: 0, fontSize: '0.875rem' }}>
            {this.state.error?.message || 'An unexpected error occurred'}
          </p>
        </div>
      )
    }

    return this.props.children
  }
}
