import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { error: Error | null; }

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidMount() {
    window.addEventListener('error', this.handleWindowError);
    window.addEventListener('unhandledrejection', this.handleRejection);
  }

  componentWillUnmount() {
    window.removeEventListener('error', this.handleWindowError);
    window.removeEventListener('unhandledrejection', this.handleRejection);
  }

  private handleWindowError = (event: ErrorEvent) => {
    const error = event.error instanceof Error ? event.error : new Error(event.message || 'Unhandled window error');
    this.recordRuntimeError(error);
  };

  private handleRejection = (event: PromiseRejectionEvent) => {
    const reason = event.reason instanceof Error ? event.reason : new Error(String(event.reason || 'Unhandled promise rejection'));
    this.recordRuntimeError(reason);
  };

  private recordRuntimeError(error: Error) {
    try {
      localStorage.setItem('cardiovault_last_runtime_error', JSON.stringify({
        message: error?.message || String(error),
        stack: error?.stack || '',
        timestamp: new Date().toISOString(),
      }));
    } catch {}
    this.setState({ error });
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.recordRuntimeError(error);
    try {
      const raw = localStorage.getItem('cardiovault_last_runtime_error');
      const saved = raw ? JSON.parse(raw) : {};
      localStorage.setItem('cardiovault_last_runtime_error', JSON.stringify({
        ...saved,
        componentStack: info?.componentStack || '',
      }));
    } catch {}
    console.error('CardioVault runtime render error:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-[#070B13] text-slate-100 flex items-center justify-center p-5">
        <div className="w-full max-w-lg rounded-3xl border border-rose-900/60 bg-[#0F172A] p-6 shadow-2xl">
          <div className="text-xs font-black uppercase tracking-widest text-rose-400">CardioVault Runtime Error</div>
          <h1 className="text-xl font-extrabold mt-2">Something went wrong</h1>
          <p className="text-xs text-slate-400 mt-2">Please reload CardioVault and try again.</p>
          <button
            className="mt-4 w-full rounded-xl bg-cyan-500 py-3 text-sm font-bold text-slate-950"
            onClick={() => window.location.reload()}
          >
            Reload CardioVault
          </button>
        </div>
      </div>
    );
  }
}
