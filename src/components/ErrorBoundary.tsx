import React from 'react'

interface State {
  error: Error | null
}

/**
 * Keeps one bad screen from blanking the whole app: shows a friendly card with
 * the error and lets the user reload or go back to the dashboard.
 */
export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('Screen crashed:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="min-h-[60vh] grid place-items-center p-6">
        <div className="card max-w-xl p-6 text-center">
          <div className="w-12 h-12 mx-auto rounded-2xl bg-[#FBEAEB] text-[#A9505A] grid place-items-center mb-3">!</div>
          <h2 className="font-display text-xl mb-1.5">This screen hit a problem</h2>
          <p className="text-sm text-muted leading-relaxed">
            Your data is safe — this is a display error. Reloading usually fixes it.
          </p>
          <pre className="mt-3 text-left text-[11.5px] bg-warm rounded-xl px-3 py-2.5 overflow-x-auto text-[#8E414A] max-h-40">
            {error.message}
          </pre>
          <div className="flex justify-center gap-2 mt-4">
            <button className="btn-secondary" onClick={() => this.setState({ error: null })}>
              Try again
            </button>
            <button className="btn-primary" onClick={() => window.location.reload()}>
              Reload app
            </button>
          </div>
        </div>
      </div>
    )
  }
}
