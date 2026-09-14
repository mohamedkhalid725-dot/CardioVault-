import React from 'react';

interface CardioLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  showSubtitle?: boolean;
  className?: string;
}

export const CardioLogo: React.FC<CardioLogoProps> = ({
  size = 'md',
  showText = false,
  showSubtitle = false,
  className = '',
}) => {
  const sizeMap = {
    sm: { icon: 'w-7 h-7', text: 'text-base', sub: 'text-[9px]' },
    md: { icon: 'w-10 h-10', text: 'text-xl', sub: 'text-xs' },
    lg: { icon: 'w-16 h-16', text: 'text-2xl', sub: 'text-xs' },
    xl: { icon: 'w-24 h-24', text: 'text-3xl', sub: 'text-sm' },
  };

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Official Rounded-Square Medical Mark */}
      <div
        className={`${sizeMap[size].icon} relative flex-shrink-0 flex items-center justify-center rounded-[26%] p-[2px] transition-transform duration-300 shadow-lg`}
        style={{
          background: 'linear-gradient(135deg, #00d2f2 0%, #0284c7 100%)',
          boxShadow: '0 4px 20px -2px rgba(0, 210, 242, 0.35)',
        }}
      >
        {/* Inner container */}
        <div className="w-full h-full bg-[#0b111e] rounded-[24%] flex items-center justify-center p-1 relative overflow-hidden">
          {/* Subtle radial glow */}
          <div
            className="absolute inset-0 opacity-30 pointer-events-none"
            style={{
              background: 'radial-gradient(circle at center, #00d2f2 0%, transparent 70%)',
            }}
          />

          {/* Precision Heart + ECG Waveform */}
          <svg
            viewBox="0 0 100 100"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="w-[82%] h-[82%] relative z-10 filter drop-shadow-[0_0_4px_rgba(0,210,242,0.8)]"
          >
            <defs>
              <linearGradient id="cardioGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#22d3ee" />
                <stop offset="100%" stopColor="#0284c7" />
              </linearGradient>
            </defs>

            {/* Heart Outline */}
            <path
              d="M50 86.5 C 50 86.5, 14 62, 14 36 C 14 21.5, 25.5 12, 38 12 C 45 12, 48.5 16, 50 18.5 C 51.5 16, 55 12, 62 12 C 74.5 12, 86 21.5, 86 36 C 86 62, 50 86.5, 50 86.5 Z"
              stroke="url(#cardioGradient)"
              strokeWidth="7"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="rgba(0, 210, 242, 0.04)"
            />

            {/* ECG Pulse traversing the heart */}
            <path
              d="M17 50 L 34 50 L 40 43 L 45 61 L 52 28 L 59 66 L 64 47 L 70 52 L 83 50"
              stroke="#00d2f2"
              strokeWidth="6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Typography */}
      {showText && (
        <div className="flex flex-col">
          <div className={`font-bold tracking-tight text-slate-900 dark:text-white ${sizeMap[size].text} flex items-center`}>
            <span>Cardio</span>
            <span className="text-cyan-500 dark:text-cyan-400">Vault</span>
          </div>
          {showSubtitle && (
            <span className={`text-slate-500 dark:text-slate-400 font-medium tracking-wide ${sizeMap[size].sub}`}>
              Your Clinical Companion
            </span>
          )}
        </div>
      )}
    </div>
  );
};
