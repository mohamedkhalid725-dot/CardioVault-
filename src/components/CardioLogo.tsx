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
      <div className={`${sizeMap[size].icon} relative flex-shrink-0 overflow-hidden rounded-[26%] shadow-lg`}>
        <img
          src="/cardiovault-logo.svg"
          alt="CardioVault"
          className="block w-full h-full object-cover"
          draggable={false}
        />
      </div>

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
