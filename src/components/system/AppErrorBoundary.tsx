import React from 'react';

interface Props { children: React.ReactNode; }
interface State { error: Error | null; }

export class AppErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    try {
      localStorage.setItem('cardiovault_last_runtime_error', JSON.stringify({
        message: error?.message || String(error),
        stack: error?.stack || '',
        componentStack: info?.componentStack || '',
        timestamp: new Date().toISOString(),
      }));
    } catch {}
    console.error('CardioVault runtime render error:', error, info);
  }

  render() {
    if (!this.state.error) return this.props.children;
    const message = this.state.error.message || 'Unknown runtime error';
    return (
      <div className="min-h-screen bg-[#070B13] text-slate-100 flex items-center justify-center p-5">
        <div className="w-full max-w-lg rounded-3xl border border-rose-900/60 bg-[#0F172A] p-6 shadow-2xl">
          <div className="text-xs font-black uppercase tracking-widest text-rose-400">CardioVault Runtime Error</div>
          <h1 className="text-xl font-extrabold mt-2">The app hit a screen error</h1>
          <p className="text-xs text-slate-400 mt-2">The error has been saved locally so it can be diagnosed instead of showing a blank screen.</p>
          <pre className="mt-4 max-h-40 overflow-auto rounded-xl bg-black/40 border border-slate-800 p-3 text-[10px] leading-relaxed text-rose-300 whitespace-pre-wrap break-words">{message}</pre>
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
