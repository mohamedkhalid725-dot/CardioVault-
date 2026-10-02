import React, { useEffect, useRef, useState } from 'react';
import {
  Mic,
  Square,
  Pause,
  Play,
  RotateCcw,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  X,
  Loader2,
  ChevronDown,
  ChevronUp,
  FileText,
  Volume2,
} from 'lucide-react';
import { Patient } from '../../types/clinical';
import { useApp } from '../../context/AppContext';
import { processMedicalVoiceRecord, MedicalVoiceRecordResult } from '../../services/aiMedicalService';

export interface ContextualVoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  patient: Patient;
  context:
    | 'chiefComplaint'
    | 'history'
    | 'hpi'
    | 'pmh'
    | 'psh'
    | 'drugHistory'
    | 'allergies'
    | 'examination'
    | 'assessment'
    | 'plan'
    | 'progressNote'
    | 'investigations';
  contextLabel: string;
  currentValue?: string;
  onApply: (medicalText: string, mode: 'replace' | 'append') => void;
}

type RecordState = 'idle' | 'recording' | 'paused' | 'stopped' | 'processing' | 'review' | 'error';

export const ContextualVoiceRecorderModal: React.FC<ContextualVoiceModalProps> = ({
  isOpen,
  onClose,
  patient,
  context,
  contextLabel,
  currentValue = '',
  onApply,
}) => {
  const { showToast, currentUser } = useApp();

  const [state, setState] = useState<RecordState>('idle');
  const [duration, setDuration] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [showRawTranscription, setShowRawTranscription] = useState(false);
  const [applyMode, setApplyMode] = useState<'replace' | 'append'>('replace');

  // AI Result state
  const [result, setResult] = useState<MedicalVoiceRecordResult | null>(null);
  const [editedText, setEditedText] = useState('');

  // Refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);

  // Safely stop all active audio tracks
  function stopAudioTracks() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
      try {
        mediaRecorderRef.current.stream.getTracks().forEach(track => {
          track.stop();
        });
      } catch (err) {
        console.warn('Error stopping tracks:', err);
      }
    }
  }

  // Cleanup on unmount or close
  useEffect(() => {
    return () => {
      stopAudioTracks();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current && audioContextRef.current.state !== 'closed') {
        void audioContextRef.current.close().catch(() => {});
      }
      abortControllerRef.current?.abort();
    };
  }, [audioUrl]);

  // Reset state when opening
  useEffect(() => {
    if (isOpen) {
      setState('idle');
      setDuration(0);
      setResult(null);
      setEditedText('');
      setErrorMessage('');
      setShowRawTranscription(false);
      setApplyMode(currentValue && currentValue.trim() ? 'append' : 'replace');
    } else {
      stopAudioTracks();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    }
  }, [isOpen, currentValue]);

  if (!isOpen) return null;

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  const setupVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const audioCtx = new AudioCtx();
      audioContextRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 64;
      source.connect(analyser);
      analyserRef.current = analyser;

      const canvas = canvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const draw = () => {
        if (!analyserRef.current) return;
        animFrameRef.current = requestAnimationFrame(draw);
        analyserRef.current.getByteFrequencyData(dataArray);

        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const barWidth = (canvas.width / analyser.frequencyBinCount) * 1.8;
        let x = 0;

        for (let i = 0; i < analyser.frequencyBinCount; i++) {
          const barHeight = (dataArray[i] / 255) * canvas.height * 0.85;
          ctx.fillStyle = '#06b6d4'; // Cyan
          ctx.fillRect(x, canvas.height / 2 - barHeight / 2, barWidth - 1, Math.max(3, barHeight));
          x += barWidth;
        }
      };
      draw();
    } catch (e) {
      console.warn('Audio visualizer init error:', e);
    }
  };

  const startRecording = async () => {
    try {
      chunksRef.current = [];
      setDuration(0);
      setErrorMessage('');

      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Microphone audio recording is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      // Find supported MIME type
      const mimeTypes = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/ogg;codecs=opus',
        'audio/aac',
      ];
      let selectedMime = '';
      for (const m of mimeTypes) {
        if (MediaRecorder.isTypeSupported(m)) {
          selectedMime = m;
          break;
        }
      }

      const recorder = selectedMime
        ? new MediaRecorder(stream, { mimeType: selectedMime })
        : new MediaRecorder(stream);

      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const mime = recorder.mimeType || 'audio/webm';
        const blob = new Blob(chunksRef.current, { type: mime });
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
        // Automatically start processing
        void handleProcessAudio(blob);
      };

      recorder.start(250);
      startTimeRef.current = Date.now();
      setState('recording');
      setupVisualizer(stream);

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = window.setInterval(() => {
        setDuration(Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000)));
      }, 500);
    } catch (err: any) {
      console.error('Audio start recording error:', err);
      setState('error');
      setErrorMessage(String(err?.message || 'Failed to access microphone. Please check browser permissions.'));
      showToast('Microphone access denied or unavailable.', 'error');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.pause();
        pausedTimeRef.current = Date.now();
        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
        setState('paused');
      } catch (err) {
        console.warn('Pause error:', err);
      }
    }
  };

  const resumeRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'paused') {
      try {
        mediaRecorderRef.current.resume();
        const pauseDuration = Date.now() - pausedTimeRef.current;
        startTimeRef.current += pauseDuration;

        if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = window.setInterval(() => {
          setDuration(Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000)));
        }, 500);

        setState('recording');
      } catch (err) {
        console.warn('Resume error:', err);
      }
    }
  };

  const stopRecording = () => {
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch (err) {
        console.warn('Stop error:', err);
      }
    }
    stopAudioTracks();
    setState('processing');
  };

  const cancelRecording = () => {
    stopAudioTracks();
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stop();
      } catch {}
    }
    chunksRef.current = [];
    setState('idle');
    setDuration(0);
    onClose();
  };

  const handleProcessAudio = async (blob: Blob) => {
    setState('processing');
    setErrorMessage('');

    try {
      abortControllerRef.current = new AbortController();
      const clinicianInfo = {
        name: currentUser?.name || 'Physician',
        role: currentUser?.role || 'Clinician',
      };

      const res = await processMedicalVoiceRecord(
        blob,
        patient,
        clinicianInfo,
        abortControllerRef.current.signal,
        context
      );

      setResult(res);
      const generated = res.medicalText || res.transcription || '';
      setEditedText(generated);
      setState('review');
      showToast('AI transcription and medical transformation complete.', 'success');
    } catch (err: any) {
      console.error('Audio processing error:', err);
      setState('error');
      setErrorMessage(
        String(err?.message || 'Failed to process clinical recording with AI. Please retry.')
      );
      showToast('Voice processing error: ' + (err?.message || 'Failed'), 'error');
    }
  };

  const handleApply = () => {
    const clean = editedText.trim();
    if (!clean) {
      showToast('No clinical text to insert.', 'warning');
      return;
    }
    onApply(clean, applyMode);
    showToast(`Saved to ${contextLabel} successfully.`, 'success');
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-4 animate-in fade-in duration-150">
      <div className="w-full max-w-lg bg-white dark:bg-[#111C2E] rounded-3xl border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-cyan-500/15 text-cyan-500 flex items-center justify-center shrink-0">
              <Mic className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-sm text-slate-900 dark:text-white">
                  Quick Record — {contextLabel}
                </h3>
                <span className="px-1.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 font-bold text-[9px] uppercase tracking-wider">
                  AI Context
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400">
                Patient: <span className="font-semibold text-slate-700 dark:text-slate-300">{patient.fullName}</span> • {patient.mrn}
              </p>
            </div>
          </div>
          <button
            onClick={cancelRecording}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-4 flex-1">
          {/* IDLE STATE */}
          {state === 'idle' && (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-cyan-500/10 text-cyan-500 flex items-center justify-center mx-auto ring-8 ring-cyan-500/5">
                <Mic className="w-8 h-8 animate-pulse" />
              </div>
              <div>
                <h4 className="font-bold text-slate-900 dark:text-white text-base">
                  Record for {contextLabel}
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-sm mx-auto mt-1 leading-relaxed">
                  Speak in <b className="text-slate-700 dark:text-slate-300">English, Arabic, or mixed English/Arabic</b>. The AI will transcribe and formulate professional clinical terminology specifically for this field.
                </p>
              </div>

              {currentValue && currentValue.trim() && (
                <div className="text-left p-3 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                  <div className="text-[10px] uppercase font-bold text-slate-400 mb-1">
                    Current Field Content:
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300 line-clamp-2">
                    {currentValue}
                  </p>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="button"
                  onClick={startRecording}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-cyan-500 to-sky-500 text-slate-950 font-black text-sm shadow-lg shadow-cyan-500/25 hover:brightness-105 active:scale-95 transition-all inline-flex items-center gap-2"
                >
                  <Mic className="w-4 h-4" />
                  <span>Start Quick Recording</span>
                </button>
              </div>
            </div>
          )}

          {/* RECORDING / PAUSED STATE */}
          {(state === 'recording' || state === 'paused') && (
            <div className="py-4 space-y-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <span
                  className={`w-3 h-3 rounded-full ${
                    state === 'recording' ? 'bg-rose-500 animate-ping' : 'bg-amber-500'
                  }`}
                />
                <span className="font-mono text-3xl font-black text-slate-900 dark:text-white">
                  {formatTime(duration)}
                </span>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">
                  {state === 'recording' ? 'Recording' : 'Paused'}
                </span>
              </div>

              {/* Waveform Canvas */}
              <div className="w-full h-16 bg-slate-100 dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex items-center justify-center overflow-hidden p-2">
                <canvas ref={canvasRef} width={340} height={60} className="w-full h-full" />
              </div>

              <p className="text-xs text-slate-500 dark:text-slate-400">
                Dictating for: <strong className="text-cyan-500">{contextLabel}</strong>
              </p>

              {/* Controls */}
              <div className="flex items-center justify-center gap-3 pt-2">
                {state === 'recording' ? (
                  <button
                    type="button"
                    onClick={pauseRecording}
                    className="p-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
                    title="Pause"
                  >
                    <Pause className="w-5 h-5" />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={resumeRecording}
                    className="p-3 rounded-2xl bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-600 dark:text-cyan-400 transition-colors"
                    title="Resume"
                  >
                    <Play className="w-5 h-5" />
                  </button>
                )}

                <button
                  type="button"
                  onClick={stopRecording}
                  className="px-6 py-3 rounded-2xl bg-rose-500 hover:bg-rose-600 text-white font-bold text-xs flex items-center gap-2 shadow-lg shadow-rose-500/25 transition-all"
                >
                  <Square className="w-4 h-4 fill-current" />
                  <span>Done & Process with AI</span>
                </button>

                <button
                  type="button"
                  onClick={cancelRecording}
                  className="p-3 rounded-2xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-600 transition-colors"
                  title="Cancel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
          )}

          {/* PROCESSING STATE */}
          {state === 'processing' && (
            <div className="text-center py-8 space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center mx-auto">
                <Loader2 className="w-7 h-7 animate-spin text-cyan-500" />
              </div>
              <div className="space-y-1">
                <h4 className="font-bold text-slate-900 dark:text-white text-base">
                  Processing with AI...
                </h4>
                <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs mx-auto">
                  Transcribing speech and structuring medical documentation for <strong className="text-cyan-500">{contextLabel}</strong>.
                </p>
              </div>
            </div>
          )}

          {/* REVIEW STATE */}
          {state === 'review' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700 dark:text-slate-200">
                  <Sparkles className="w-4 h-4 text-cyan-500" />
                  <span>Review AI-generated {contextLabel}</span>
                </div>
                {result?.detectedLanguage && (
                  <span className="text-[10px] font-semibold text-slate-400 uppercase">
                    Detected: {result.detectedLanguage}
                  </span>
                )}
              </div>

              {/* Editable Result Area */}
              <div>
                <label className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 block">
                  Generated Clinical Text (Editable):
                </label>
                <textarea
                  rows={4}
                  value={editedText}
                  onChange={e => setEditedText(e.target.value)}
                  className="w-full p-3 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs sm:text-sm text-slate-900 dark:text-slate-100 font-sans leading-relaxed focus:outline-none focus:ring-2 focus:ring-cyan-500/30"
                  placeholder="Clinical documentation..."
                />
              </div>

              {/* Uncertainties if any */}
              {result?.uncertainItems && result.uncertainItems.length > 0 && (
                <div className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs space-y-1">
                  <div className="font-bold flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                    <span>Uncertain / Ambiguous Audio Spoken:</span>
                  </div>
                  <ul className="list-disc list-inside text-[11px] text-amber-200/90 pl-1">
                    {result.uncertainItems.map((item, idx) => (
                      <li key={idx}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Raw transcription toggle */}
              {result?.transcription && (
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl p-3 bg-slate-50/50 dark:bg-slate-900/30">
                  <button
                    type="button"
                    onClick={() => setShowRawTranscription(p => !p)}
                    className="w-full flex items-center justify-between text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-cyan-500 transition-colors"
                  >
                    <span className="flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-cyan-500" />
                      <span>Verbatim Spoken Transcription</span>
                    </span>
                    {showRawTranscription ? (
                      <ChevronUp className="w-4 h-4" />
                    ) : (
                      <ChevronDown className="w-4 h-4" />
                    )}
                  </button>
                  {showRawTranscription && (
                    <div className="mt-2 text-xs text-slate-700 dark:text-slate-300 font-mono bg-white dark:bg-slate-950 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800 select-text whitespace-pre-wrap">
                      {result.transcription}
                    </div>
                  )}
                </div>
              )}

              {/* Apply mode (Replace vs Append) if existing content exists */}
              {currentValue && currentValue.trim() && (
                <div className="flex items-center gap-3 p-2.5 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs">
                  <span className="font-semibold text-slate-500">Insert Mode:</span>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="applyMode"
                      value="replace"
                      checked={applyMode === 'replace'}
                      onChange={() => setApplyMode('replace')}
                      className="accent-cyan-500"
                    />
                    <span>Replace Field</span>
                  </label>
                  <label className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="radio"
                      name="applyMode"
                      value="append"
                      checked={applyMode === 'append'}
                      onChange={() => setApplyMode('append')}
                      className="accent-cyan-500"
                    />
                    <span>Append to Field</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {/* ERROR STATE */}
          {state === 'error' && (
            <div className="py-6 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-rose-500/10 text-rose-500 flex items-center justify-center mx-auto">
                <AlertCircle className="w-6 h-6" />
              </div>
              <h4 className="font-bold text-rose-500 text-sm">Recording Error</h4>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">{errorMessage}</p>
              <button
                type="button"
                onClick={startRecording}
                className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Try Again</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40">
          <button
            type="button"
            onClick={cancelRecording}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 transition-colors"
          >
            Cancel
          </button>

          {state === 'review' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={startRecording}
                className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 inline-flex items-center gap-1.5 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Retry</span>
              </button>
              <button
                type="button"
                onClick={handleApply}
                className="px-5 py-2 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-md shadow-emerald-500/20 active:scale-95 transition-all"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>Confirm & Insert into {contextLabel}</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
