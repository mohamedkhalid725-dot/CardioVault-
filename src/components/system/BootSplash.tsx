import React from 'react';
import { CardioLogo } from '../CardioLogo';

interface BootSplashProps {
  // True during the fade-out window before unmount.
  fading?: boolean;
  // Tap-to-dismiss fallback; the parent auto-dismisses on a timer.
  onDismiss?: () => void;
}

// Cold-start splash shown on every app open. Auto-dismissed by the parent
// after ~2s; a tap also dismisses it as a fallback.
export const BootSplash: React.FC<BootSplashProps> = ({ fading = false, onDismiss }) => {
  return (
    <div
      className={`fixed inset-0 z-[100] bg-[#070B13] flex flex-col items-center justify-center overflow-hidden transition-opacity duration-300 ${
        fading ? 'opacity-0' : 'opacity-100'
      }`}
      onClick={onDismiss}
      role="presentation"
      aria-label="CardioVault loading"
    >
      {/* Ambient glows matching LoginScreen. */}
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute bottom-10 left-10 w-72 h-72 bg-blue-600/10 rounded-full blur-3xl pointer-events-none" />

      {/* Pulse rings behind the logo. */}
      <div className="relative flex items-center justify-center">
        <div className="absolute w-40 h-40 rounded-full bg-rose-500/10 animate-ping [animation-duration:1.8s]" />
        <div className="absolute w-32 h-32 rounded-full border border-rose-500/20 animate-ping [animation-duration:1.8s] [animation-delay:0.4s]" />
        <div className="relative animate-cardiovault-heartbeat">
          <CardioLogo size="xl" showText={false} />
        </div>
      </div>

      <h1 className="mt-6 text-3xl font-extrabold tracking-tight text-white">
        Cardio<span className="text-cyan-400">Vault</span>
      </h1>
      <p className="mt-2 text-xs font-semibold tracking-wider text-cyan-400/90 uppercase">
        Your Clinical Companion
      </p>

      {/* Indeterminate loading bar. */}
      <div className="mt-8 w-40 h-1 rounded-full bg-slate-800 overflow-hidden">
        <div className="h-full w-1/2 rounded-full bg-cyan-400/80 animate-cardiovault-loading" />
      </div>
    </div>
  );
};
