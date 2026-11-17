import React from 'react';

interface ErrorBoundaryState {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  ErrorBoundaryState
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      message: error?.message || 'Unexpected application error.',
    };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center bg-[#F8FAFC] p-4">
          <div className="w-full max-w-md rounded-xl border border-red-200 bg-white p-6 space-y-3">
            <h1 className="text-lg font-bold text-slate-900">Something went wrong</h1>
            <p className="text-xs text-slate-600 break-words">{this.state.message}</p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="min-h-[44px] w-full rounded-xl bg-[#107C41] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0B5E31]"
            >
              Reload CallSheet Manager
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
