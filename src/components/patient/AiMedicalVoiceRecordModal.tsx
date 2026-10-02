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
  FileText,
  Volume2,
  X,
  Loader2,
  Trash2,
  Edit3,
  Stethoscope,
  HeartPulse,
  Pill,
  Activity,
  Layers,
  Save,
} from 'lucide-react';
import { Patient, ProgressNote, VitalRecord } from '../../types/clinical';
import { useApp } from '../../context/AppContext';
import { processMedicalVoiceRecord, MedicalVoiceRecordResult } from '../../services/aiMedicalService';
import { uploadClinicalMedia } from '../../services/mediaStorage';

interface Props {
  patient: Patient;
  isOpen: boolean;
  onClose: () => void;
}

type RecordState = 'idle' | 'recording' | 'paused' | 'stopped' | 'processing' | 'review' | 'error';
type SaveMode = 'progress_note' | 'summary' | 'comprehensive';

export const AiMedicalVoiceRecordModal: React.FC<Props> = ({ patient, isOpen, onClose }) => {
  const { updatePatient, showToast, auth } = useApp();

  const [state, setState] = useState<RecordState>('idle');
  const [duration, setDuration] = useState(0);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [saving, setSaving] = useState(false);

  // Result state
  const [result, setResult] = useState<MedicalVoiceRecordResult | null>(null);
  const [activeTab, setActiveTab] = useState<'structured' | 'transcription'>('structured');
  const [saveMode, setSaveMode] = useState<SaveMode>('progress_note');

  // Editable fields during review
  const [rawTranscription, setRawTranscription] = useState('');
  const [chiefComplaint, setChiefComplaint] = useState('');
  const [hpi, setHpi] = useState('');
  const [pmh, setPmh] = useState('');
  const [psh, setPsh] = useState('');
  const [drugHistory, setDrugHistory] = useState('');
  const [allergies, setAllergies] = useState('');
  const [examination, setExamination] = useState('');
  const [assessment, setAssessment] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [plan, setPlan] = useState('');
  const [progressNoteText, setProgressNoteText] = useState('');
  const [ecgText, setEcgText] = useState('');
  const [echoText, setEchoText] = useState('');

  // Vitals
  const [sbp, setSbp] = useState<string>('');
  const [dbp, setDbp] = useState<string>('');
  const [hr, setHr] = useState<string>('');
  const [rr, setRr] = useState<string>('');
  const [spo2, setSpo2] = useState<string>('');
  const [temp, setTemp] = useState<string>('');
  const [gcs, setGcs] = useState<string>('');

  // Recording internal refs
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerIntervalRef = useRef<number | null>(null);
  const startTimeRef = useRef<number>(0);
  const pausedTimeRef = useRef<number>(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const animFrameRef = useRef<number | null>(null);

  function stopRecordingTracks() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      } catch {}
    }
  }

  // Clean up on unmount or close
  useEffect(() => {
    return () => {
      stopRecordingTracks();
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (audioUrl) URL.revokeObjectURL(audioUrl);
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
      if (audioContextRef.current?.state !== 'closed') {
        void audioContextRef.current?.close();
      }
      abortControllerRef.current?.abort();
    };
  }, [audioUrl]);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remaining = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remaining.toString().padStart(2, '0')}`;
  };

  // Waveform visualization
  const setupVisualizer = (stream: MediaStream) => {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
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
        const barWidth = (canvas.width / dataArray.length) * 2;
        let x = 0;

        for (let i = 0; i < dataArray.length; i++) {
          const barHeight = (dataArray[i] / 255) * (canvas.height * 0.9);
          const gradient = ctx.createLinearGradient(0, canvas.height - barHeight, 0, canvas.height);
          gradient.addColorStop(0, '#06b6d4');
          gradient.addColorStop(1, '#3b82f6');
          ctx.fillStyle = gradient;
          ctx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
          x += barWidth;
        }
      };
      draw();
    } catch (e) {
      console.warn('Visualizer setup error:', e);
    }
  };

  const startRecording = async () => {
    setErrorMessage('');
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Audio recording is not supported on this browser or platform.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const mimeCandidates = [
        'audio/webm;codecs=opus',
        'audio/webm',
        'audio/mp4',
        'audio/aac',
        'audio/ogg;codecs=opus',
      ];
      const selectedMime = mimeCandidates.find(type => MediaRecorder.isTypeSupported(type)) || '';

      const recorder = selectedMime
        ? new MediaRecorder(stream, { mimeType: selectedMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        stream.getTracks().forEach(track => track.stop());
        const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        setAudioUrl(URL.createObjectURL(blob));
      };

      mediaRecorderRef.current = recorder;
      recorder.start(500); // 500ms chunks

      startTimeRef.current = Date.now();
      pausedTimeRef.current = 0;
      setDuration(0);

      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = window.setInterval(() => {
        setDuration(Math.max(1, Math.round((Date.now() - startTimeRef.current) / 1000)));
      }, 500);

      setupVisualizer(stream);
      setState('recording');
      showToast('Voice recording started. Speak clearly.', 'info');
    } catch (err: any) {
      console.error('Audio recording failed to start:', err);
      const msg = String(err?.message || err?.name || 'Failed to access microphone.');
      setErrorMessage(msg);
      setState('error');
      showToast(msg, 'error');
    }
  };

  const pauseRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      try {
        mediaRecorderRef.current.pause();
        pausedTimeRef.current = Date.now();
        if (timerIntervalRef.current) {
          clearInterval(timerIntervalRef.current);
          timerIntervalRef.current = null;
        }
        setState('paused');
        showToast('Recording paused.', 'info');
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
        showToast('Recording resumed.', 'info');
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
    stopRecordingTracks();
    setState('stopped');
  };

  const cancelRecording = () => {
    stopRecordingTracks();
    if (timerIntervalRef.current) {
      clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl('');
    setDuration(0);
    setResult(null);
    setState('idle');
    setErrorMessage('');
  };

  const processAudioWithAi = async () => {
    if (!audioBlob || audioBlob.size <= 0) {
      setErrorMessage('No audio recorded. Please record your dictation first.');
      setState('error');
      return;
    }

    if (duration < 2) {
      setErrorMessage('Recording is too short (under 2 seconds). Please record a clinical note.');
      setState('error');
      return;
    }

    setState('processing');
    setErrorMessage('');
    const controller = new AbortController();
    abortControllerRef.current = controller;

    // 60-second safety timeout
    const timeout = setTimeout(() => {
      controller.abort();
    }, 60000);

    try {
      const data = await processMedicalVoiceRecord(
        audioBlob,
        patient,
        { name: auth.userName || 'Physician', role: 'Clinician' },
        controller.signal
      );
      clearTimeout(timeout);

      setResult(data);

      // Hydrate editable review fields
      setRawTranscription(data.transcription || '');
      const note = data.clinicalNote || {};
      setChiefComplaint(note.chiefComplaint || '');
      setHpi(note.historyOfPresentIllness || '');
      setPmh(note.pastMedicalHistory || '');
      setPsh(note.pastSurgicalHistory || '');
      setDrugHistory(note.drugHistory || '');
      setAllergies(note.allergies || '');
      setExamination(note.examination || '');
      setAssessment(note.assessment || '');
      setDiagnosis(note.diagnosis || '');
      setPlan(note.plan || '');
      setProgressNoteText(note.progressNote || '');
      setEcgText(note.ecg || '');
      setEchoText(note.echo || '');

      // Vitals
      const v = note.vitalSigns || {};
      setSbp(v.sbp != null ? String(v.sbp) : '');
      setDbp(v.dbp != null ? String(v.dbp) : '');
      setHr(v.hr != null ? String(v.hr) : '');
      setRr(v.rr != null ? String(v.rr) : '');
      setSpo2(v.spo2 != null ? String(v.spo2) : '');
      setTemp(v.temp != null ? String(v.temp) : '');
      setGcs(v.gcs != null ? String(v.gcs) : '');

      setState('review');
      showToast('Audio transcribed and structured successfully.', 'success');
    } catch (err: any) {
      clearTimeout(timeout);
      console.error('Audio processing failed:', err);
      let msg = String(err?.message || err || 'Audio processing failed.');
      if (err?.name === 'AbortError') {
        msg = 'Request timed out after 60 seconds. Please check your connection and retry.';
      }
      setErrorMessage(msg);
      setState('error');
      showToast(msg, 'error');
    }
  };

  const handleSaveToPatient = async () => {
    if (saving) return;
    setSaving(true);
    try {
      const now = new Date();
      const id = `voice-rec-${Date.now()}`;
      let cloudAudioUrl = audioUrl;
      let audioStoragePath: string | undefined;

      // 1. Upload audio to media storage if present
      if (audioBlob) {
        try {
          const extension = audioBlob.type.includes('aac')
            ? 'aac'
            : audioBlob.type.includes('mp4')
            ? 'm4a'
            : 'webm';
          const uploadPath = `patients/${patient.id}/voice-notes/${id}.${extension}`;
          const uploaded = await uploadClinicalMedia(audioBlob, uploadPath);
          cloudAudioUrl = uploaded.url;
          if (uploaded.cloud) audioStoragePath = uploadPath;
        } catch (uploadErr) {
          console.warn('Audio upload warning, keeping local URL:', uploadErr);
        }
      }

      // Build structured progress note text
      const synthesizedProgress = progressNoteText.trim() || [
        chiefComplaint ? `CHIEF COMPLAINT:\n${chiefComplaint}\n` : '',
        hpi ? `HPI:\n${hpi}\n` : '',
        examination ? `EXAMINATION:\n${examination}\n` : '',
        assessment ? `ASSESSMENT:\n${assessment}\n` : '',
        plan ? `PLAN:\n${plan}\n` : '',
      ].filter(Boolean).join('\n') || rawTranscription;

      const newProgressNote: ProgressNote = {
        id,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().slice(0, 5),
        author: auth.userName || 'Physician',
        type: 'AI Medical Voice Dictation',
        subjective: [chiefComplaint, hpi].filter(Boolean).join('\n\n') || undefined,
        objective: examination || undefined,
        assessment: assessment || diagnosis || undefined,
        plan: plan || 'Clinical review completed.',
        clinicalStatus: diagnosis ? `Working Diagnosis: ${diagnosis}` : undefined,
        audioUrl: cloudAudioUrl,
        audioStoragePath,
        audioDurationSeconds: duration,
        updatedAt: now.toISOString(),
      };

      const patientUpdates: Partial<Patient> = {
        progressNotes: [newProgressNote, ...(patient.progressNotes || [])],
      };

      // 2. If vitals were recorded, create a new VitalRecord
      const numSbp = Number(sbp);
      const numDbp = Number(dbp);
      const numHr = Number(hr);
      const numRr = Number(rr);
      const numSpo2 = Number(spo2);
      const numTemp = Number(temp);
      const numGcs = Number(gcs);

      const hasVitals =
        Number.isFinite(numSbp) ||
        Number.isFinite(numHr) ||
        Number.isFinite(numSpo2) ||
        Number.isFinite(numTemp);

      if (hasVitals && (saveMode === 'comprehensive' || saveMode === 'summary')) {
        const latestVitals = patient.vitalsHistory?.[0];
        const newVital: VitalRecord = {
          id: `vital-${Date.now()}`,
          timestamp: now.toISOString(),
          sbp: Number.isFinite(numSbp) ? numSbp : (latestVitals?.sbp || 120),
          dbp: Number.isFinite(numDbp) ? numDbp : (latestVitals?.dbp || 80),
          hr: Number.isFinite(numHr) ? numHr : (latestVitals?.hr || 75),
          rr: Number.isFinite(numRr) ? numRr : (latestVitals?.rr || 16),
          spo2: Number.isFinite(numSpo2) ? numSpo2 : (latestVitals?.spo2 || 98),
          temp: Number.isFinite(numTemp) ? numTemp : (latestVitals?.temp || 37.0),
          gcsTotal: Number.isFinite(numGcs) ? numGcs : (latestVitals?.gcsTotal || 15),
          gcsEye: 4,
          gcsVerbal: 5,
          gcsMotor: 6,
          rass: 0,
          notes: 'Documented via AI Medical Voice Record',
        };
        patientUpdates.vitalsHistory = [newVital, ...(patient.vitalsHistory || [])];
      }

      // 3. Update clinical summary if requested
      if (saveMode === 'summary' || saveMode === 'comprehensive') {
        const currentSummary = patient.clinicalSummary || {
          chiefComplaint: '',
          hpi: '',
          pmh: [],
          psh: [],
          drugHistory: '',
          allergies: [],
          familyHistory: '',
          socialHistory: '',
        };

        const parsedPmh = pmh
          ? pmh.split('\n').map(s => s.trim().replace(/^[-*•]\s*/, '')).filter(Boolean)
          : currentSummary.pmh;

        const parsedPsh = psh
          ? psh.split('\n').map(s => s.trim().replace(/^[-*•]\s*/, '')).filter(Boolean)
          : currentSummary.psh;

        const parsedAllergies = allergies
          ? allergies.split(',').map(s => s.trim()).filter(Boolean)
          : currentSummary.allergies;

        patientUpdates.clinicalSummary = {
          ...currentSummary,
          chiefComplaint: chiefComplaint.trim() || currentSummary.chiefComplaint,
          hpi: hpi.trim() || currentSummary.hpi,
          pmh: parsedPmh,
          psh: parsedPsh,
          drugHistory: drugHistory.trim() || currentSummary.drugHistory,
          allergies: parsedAllergies,
        };

        if (diagnosis.trim()) {
          patientUpdates.primaryDiagnosis = diagnosis.trim();
        }
      }

      updatePatient(patient.id, patientUpdates);

      showToast('AI Medical Voice Record saved into patient file.', 'success');
      cancelRecording();
      onClose();
    } catch (err: any) {
      console.error('Save to patient failed:', err);
      showToast(String(err?.message || 'Could not save record to patient file.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/75 backdrop-blur-md p-3 sm:p-5 flex items-center justify-center overflow-y-auto">
      <div className="w-full max-w-3xl rounded-3xl bg-white dark:bg-[#0D1526] border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                AI Medical Voice Record
                <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/20">
                  Cardio & ICU Dictation
                </span>
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Patient: <span className="font-semibold text-slate-700 dark:text-slate-200">{patient.fullName}</span> (MRN: {patient.mrn})
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving || state === 'recording'}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-5">
          {/* Phase 1: Recording & Audio Controls */}
          {state !== 'review' && (
            <div className="flex flex-col items-center justify-center py-6 px-4 rounded-3xl bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-center">
              {/* Visualizer Canvas during recording */}
              <canvas
                ref={canvasRef}
                width={320}
                height={60}
                className={`w-72 h-14 mb-3 rounded-xl ${state === 'recording' ? 'block' : 'hidden'}`}
              />

              {/* Status Indicator */}
              <div className="mb-3 flex items-center gap-2">
                {state === 'recording' && (
                  <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-rose-500/15 text-rose-500 border border-rose-500/30 animate-pulse">
                    <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                    Recording Live…
                  </span>
                )}
                {state === 'paused' && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-amber-500/15 text-amber-500 border border-amber-500/30">
                    Paused
                  </span>
                )}
                {state === 'stopped' && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-500 border border-emerald-500/30">
                    Recording Finished • Ready to Transcribe
                  </span>
                )}
                {state === 'idle' && (
                  <span className="px-3 py-1 rounded-full text-xs font-bold bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400">
                    Ready to record
                  </span>
                )}
              </div>

              {/* Live Timer */}
              <div className="font-mono text-4xl font-extrabold tracking-tight text-slate-900 dark:text-white mb-4">
                {formatTime(duration)}
              </div>

              {/* Language Support Banner */}
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mb-6 leading-relaxed">
                Dictate in <strong className="text-cyan-500">English</strong>, <strong className="text-cyan-500">Arabic (العربية)</strong>, or mixed clinical speech.
                Drug names, ICU dosages, and hemodynamics are preserved with 100% precision.
              </p>

              {/* Control Buttons */}
              <div className="flex flex-wrap items-center justify-center gap-3">
                {state === 'idle' && (
                  <button
                    type="button"
                    onClick={startRecording}
                    className="px-6 py-3.5 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-sm flex items-center gap-2.5 shadow-lg shadow-cyan-500/25 transition-all"
                  >
                    <Mic className="w-5 h-5" />
                    Start Dictation
                  </button>
                )}

                {state === 'recording' && (
                  <>
                    <button
                      type="button"
                      onClick={pauseRecording}
                      className="px-4 py-2.5 rounded-xl bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold flex items-center gap-2"
                    >
                      <Pause className="w-4 h-4" /> Pause
                    </button>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="px-6 py-3 rounded-2xl bg-rose-500 hover:bg-rose-400 text-white font-extrabold text-sm flex items-center gap-2 shadow-lg shadow-rose-500/25"
                    >
                      <Square className="w-5 h-5 fill-current" /> Stop Dictation
                    </button>
                    <button
                      type="button"
                      onClick={cancelRecording}
                      className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-xs font-semibold"
                    >
                      Cancel
                    </button>
                  </>
                )}

                {state === 'paused' && (
                  <>
                    <button
                      type="button"
                      onClick={resumeRecording}
                      className="px-5 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-extrabold flex items-center gap-2"
                    >
                      <Play className="w-4 h-4 fill-current" /> Resume
                    </button>
                    <button
                      type="button"
                      onClick={stopRecording}
                      className="px-5 py-2.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white text-xs font-extrabold flex items-center gap-2"
                    >
                      <Square className="w-4 h-4 fill-current" /> Finish Recording
                    </button>
                    <button
                      type="button"
                      onClick={cancelRecording}
                      className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-slate-600 text-xs font-semibold"
                    >
                      Discard
                    </button>
                  </>
                )}

                {state === 'stopped' && (
                  <div className="flex flex-col sm:flex-row items-center gap-3 w-full max-w-md">
                    <button
                      type="button"
                      onClick={processAudioWithAi}
                      className="w-full sm:flex-1 py-3.5 px-6 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2.5 shadow-lg shadow-cyan-500/25 transition-all"
                    >
                      <Sparkles className="w-5 h-5" />
                      Analyze & Structure with AI
                    </button>
                    <button
                      type="button"
                      onClick={cancelRecording}
                      className="py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-500 hover:text-slate-800 dark:hover:text-white text-xs font-bold flex items-center justify-center gap-1.5"
                    >
                      <RotateCcw className="w-4 h-4" /> Re-record
                    </button>
                  </div>
                )}
              </div>

              {/* Audio Playback Bar when stopped */}
              {audioUrl && (state === 'stopped' || state === 'error') && (
                <div className="w-full max-w-md mt-5 p-3 rounded-2xl bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-[11px] text-slate-400 font-semibold px-1">
                    <span className="flex items-center gap-1.5 text-cyan-500 font-bold">
                      <Volume2 className="w-4 h-4" /> Playback Review
                    </span>
                    <span>Duration: {formatTime(duration)}</span>
                  </div>
                  <audio controls src={audioUrl} className="w-full h-9 rounded-lg" />
                </div>
              )}
            </div>
          )}

          {/* Phase 2: Processing State */}
          {state === 'processing' && (
            <div className="py-12 px-6 flex flex-col items-center justify-center text-center space-y-4">
              <div className="relative">
                <div className="w-16 h-16 rounded-full bg-cyan-500/15 text-cyan-500 flex items-center justify-center animate-pulse">
                  <Sparkles className="w-8 h-8 animate-spin" />
                </div>
                <div className="absolute inset-0 rounded-full border-2 border-cyan-500 border-t-transparent animate-spin" />
              </div>
              <h3 className="text-lg font-extrabold text-slate-900 dark:text-white">
                Transcribing & Structuring Clinical Dictation…
              </h3>
              <p className="text-xs text-slate-400 max-w-md">
                CardioVault AI is generating verbatim speech-to-text, verifying medical numbers and drug dosages, and populating clinical sections.
              </p>
              <div className="w-48 h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
                <div className="h-full bg-cyan-500 rounded-full animate-pulse w-3/4" />
              </div>
            </div>
          )}

          {/* Phase 3: Error State */}
          {state === 'error' && errorMessage && (
            <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs space-y-2">
              <div className="flex items-center gap-2 font-bold text-rose-400">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>Audio Processing Error</span>
              </div>
              <p className="text-[11px] text-rose-200 leading-relaxed">{errorMessage}</p>
              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={processAudioWithAi}
                  className="px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-400 text-white font-bold text-xs flex items-center gap-1.5"
                >
                  <RotateCcw className="w-3.5 h-3.5" /> Retry Processing
                </button>
                <button
                  type="button"
                  onClick={cancelRecording}
                  className="px-3 py-1.5 rounded-xl border border-rose-500/40 text-rose-300 hover:bg-rose-500/10 text-xs font-semibold"
                >
                  Start Over
                </button>
              </div>
            </div>
          )}

          {/* Phase 4: Physician Review & Edit Screen */}
          {state === 'review' && result && (
            <div className="space-y-5 animate-fadeIn">
              {/* Review Banner */}
              <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-500/30 flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <CheckCircle2 className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-xs font-bold text-cyan-300 uppercase tracking-wider">
                      Physician Review & Verification Required
                    </h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Review, edit, or adjust all recognized sections below. Nothing is saved until you confirm.
                    </p>
                    <div className="flex flex-wrap items-center gap-3 mt-2 text-[10px] text-slate-400 font-mono">
                      <span>Detected: <strong className="text-cyan-300">{result.detectedLanguage || 'Mixed'}</strong></span>
                      <span>•</span>
                      <span>Spoken Duration: <strong className="text-cyan-300">{formatTime(duration)}</strong></span>
                    </div>
                  </div>
                </div>
                {audioUrl && (
                  <audio controls src={audioUrl} className="w-44 h-8 shrink-0 hidden sm:block" />
                )}
              </div>

              {/* Tab Selector: Structured vs Raw Transcription */}
              <div className="flex rounded-2xl bg-slate-100 dark:bg-slate-900 p-1 border border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setActiveTab('structured')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    activeTab === 'structured'
                      ? 'bg-white dark:bg-[#111C2E] text-cyan-500 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  <Layers className="w-4 h-4" />
                  Structured Clinical Note
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('transcription')}
                  className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    activeTab === 'transcription'
                      ? 'bg-white dark:bg-[#111C2E] text-cyan-500 shadow-sm'
                      : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white'
                  }`}
                >
                  <FileText className="w-4 h-4" />
                  Verbatim Raw Transcription
                </button>
              </div>

              {/* Tab 1: Structured Sections */}
              {activeTab === 'structured' && (
                <div className="space-y-4">
                  {/* Assessment & Plan (High Priority) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                        <Stethoscope className="w-3.5 h-3.5 text-cyan-500" /> Assessment / Working Diagnosis
                      </label>
                      <input
                        value={diagnosis}
                        onChange={e => setDiagnosis(e.target.value)}
                        placeholder="Working diagnosis / clinical impression"
                        className="w-full mb-2 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-bold outline-none focus:border-cyan-500"
                      />
                      <textarea
                        value={assessment}
                        onChange={e => setAssessment(e.target.value)}
                        rows={3}
                        placeholder="Clinical assessment synthesis…"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-cyan-500"
                      />
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <label className="block text-xs font-bold text-slate-700 dark:text-slate-200 mb-1 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-cyan-500" /> Plan of Care
                      </label>
                      <textarea
                        value={plan}
                        onChange={e => setPlan(e.target.value)}
                        rows={5}
                        placeholder="Diagnostic, therapeutic, and escalation plan…"
                        className="w-full px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-cyan-500"
                      />
                    </div>
                  </div>

                  {/* Vitals Grid */}
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                    <div className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                      <HeartPulse className="w-3.5 h-3.5 text-rose-500" /> Spoken Vital Signs
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2">
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold">SBP</span>
                        <input
                          value={sbp}
                          onChange={e => setSbp(e.target.value)}
                          placeholder="—"
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold">DBP</span>
                        <input
                          value={dbp}
                          onChange={e => setDbp(e.target.value)}
                          placeholder="—"
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold">HR</span>
                        <input
                          value={hr}
                          onChange={e => setHr(e.target.value)}
                          placeholder="—"
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold">RR</span>
                        <input
                          value={rr}
                          onChange={e => setRr(e.target.value)}
                          placeholder="—"
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold">SpO₂ (%)</span>
                        <input
                          value={spo2}
                          onChange={e => setSpo2(e.target.value)}
                          placeholder="—"
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold">Temp (°C)</span>
                        <input
                          value={temp}
                          onChange={e => setTemp(e.target.value)}
                          placeholder="—"
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                        />
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 font-semibold">GCS</span>
                        <input
                          value={gcs}
                          onChange={e => setGcs(e.target.value)}
                          placeholder="—"
                          className="w-full mt-0.5 px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-mono font-bold"
                        />
                      </div>
                    </div>
                  </div>

                  {/* History & Examination Fields */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Chief Complaint
                        </label>
                        <input
                          value={chiefComplaint}
                          onChange={e => setChiefComplaint(e.target.value)}
                          placeholder="Reason for visit/consultation"
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          History of Present Illness (HPI)
                        </label>
                        <textarea
                          value={hpi}
                          onChange={e => setHpi(e.target.value)}
                          rows={3}
                          placeholder="Narrative chronology of events…"
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Past Medical History (PMH)
                        </label>
                        <textarea
                          value={pmh}
                          onChange={e => setPmh(e.target.value)}
                          rows={2}
                          placeholder="Pre-existing medical conditions…"
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-cyan-500"
                        />
                      </div>
                    </div>

                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Physical Examination
                        </label>
                        <textarea
                          value={examination}
                          onChange={e => setExamination(e.target.value)}
                          rows={3}
                          placeholder="General, CVS, chest, abdominal, and neurological exam findings…"
                          className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs outline-none focus:border-cyan-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                          Medications & Allergies
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <input
                            value={drugHistory}
                            onChange={e => setDrugHistory(e.target.value)}
                            placeholder="Home medications"
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                          />
                          <input
                            value={allergies}
                            onChange={e => setAllergies(e.target.value)}
                            placeholder="Allergies (or NKDA)"
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                          />
                        </div>
                      </div>
                      {(ecgText || echoText) && (
                        <div>
                          <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">
                            Cardiology Findings (ECG / Echo)
                          </label>
                          <input
                            value={[ecgText, echoText].filter(Boolean).join(' • ')}
                            onChange={e => setEcgText(e.target.value)}
                            className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs"
                          />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Synthesized Progress Note */}
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 flex items-center justify-between">
                      <span>Synthesized Clinical Progress Note</span>
                      <span className="text-[10px] text-slate-400 font-normal">Will be saved to patient timeline</span>
                    </label>
                    <textarea
                      value={progressNoteText}
                      onChange={e => setProgressNoteText(e.target.value)}
                      rows={4}
                      placeholder="Comprehensive progress note synthesized from recording…"
                      className="w-full px-3.5 py-2.5 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono leading-relaxed outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>
              )}

              {/* Tab 2: Raw Verbatim Transcription */}
              {activeTab === 'transcription' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between text-xs text-slate-400">
                    <span>Raw speech-to-text output:</span>
                    <span>Editable</span>
                  </div>
                  <textarea
                    value={rawTranscription}
                    onChange={e => setRawTranscription(e.target.value)}
                    rows={12}
                    className="w-full p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-xs font-mono leading-relaxed outline-none focus:border-cyan-500 text-slate-800 dark:text-slate-200"
                  />
                </div>
              )}

              {/* Save Target Options */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 space-y-2">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                  Select where to apply this clinical information:
                </span>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setSaveMode('progress_note')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      saveMode === 'progress_note'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-bold">Progress Note Only</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Saves note & audio clip in Timeline</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSaveMode('summary')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      saveMode === 'summary'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-bold">Update Summary & HPI</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Updates Chief Complaint, HPI, PMH</div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setSaveMode('comprehensive')}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      saveMode === 'comprehensive'
                        ? 'border-cyan-500 bg-cyan-500/10 text-cyan-300'
                        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <div className="text-xs font-bold">Comprehensive Update</div>
                    <div className="text-[10px] text-slate-400 mt-0.5">Note + Vitals + History fields</div>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50/50 dark:bg-slate-900/40 shrink-0">
          <button
            type="button"
            onClick={state === 'review' ? cancelRecording : onClose}
            disabled={saving || state === 'recording'}
            className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"
          >
            {state === 'review' ? 'Discard & Start Over' : 'Cancel'}
          </button>

          {state === 'review' && (
            <button
              type="button"
              onClick={handleSaveToPatient}
              disabled={saving}
              className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-extrabold text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/25 disabled:opacity-50"
            >
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {saving ? 'Saving to Patient File…' : 'Confirm & Save into Patient File'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
