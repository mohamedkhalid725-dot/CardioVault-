import React, { useEffect, useState } from 'react';
import { resolveClinicalMediaUrl } from '../../services/mediaStorage';

interface Props {
  url: string;
  storagePath?: string;
  durationSeconds?: number;
  label?: string;
}

export const ClinicalAudioPlayer: React.FC<Props> = ({ url, storagePath, durationSeconds, label = 'Voice recording' }) => {
  const [playableUrl, setPlayableUrl] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setPlayableUrl('');
    setError('');
    void resolveClinicalMediaUrl(url, storagePath).then((resolved) => {
      if (active) setPlayableUrl(resolved);
    }).catch((reason: any) => {
      if (active) setError(String(reason?.message || 'This voice recording could not be loaded.'));
    });
    return () => { active = false; };
  }, [url, storagePath]);

  return <div className="p-3.5 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
    <div className="text-[11px] font-extrabold text-cyan-600 dark:text-cyan-400 uppercase mb-2">
      {label}{durationSeconds ? ' • ' + durationSeconds + 's' : ''}
    </div>
    {playableUrl
      ? <audio controls preload="metadata" src={playableUrl} className="w-full" aria-label={'Play ' + label} />
      : <p className={'text-xs ' + (error ? 'text-rose-500' : 'text-slate-400')}>{error || 'Loading voice recording…'}</p>}
  </div>;
};
