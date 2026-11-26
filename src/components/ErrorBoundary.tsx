import { Component, type ErrorInfo, type ReactNode } from 'react';

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    hasError: false,
    message: '',
  };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error.message || 'An unexpected error occurred.',
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error('Drift ErrorBoundary caught:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let friendly = 'Something interrupted your connection to Drift.';
      if (this.state.message.includes('Missing or insufficient permissions')) {
        friendly = 'Your session lacked permission for that action. Try refreshing or signing back in.';
      }
      return (
        <div className="min-h-screen bg-[#050C14] flex items-center justify-center p-6">
          <div className="max-w-md w-full shader-panel rounded-2xl p-6 text-center space-y-4">
            <h1 className="font-display text-xl font-bold text-[#ECF7FA]">
              Connection Interrupted
            </h1>
            <p className="text-sm text-[#8EB3C2] leading-relaxed">{friendly}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] px-5 py-2.5 rounded-xl shader-btn-primary text-sm font-semibold cursor-pointer"
            >
              Reload Drift
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
