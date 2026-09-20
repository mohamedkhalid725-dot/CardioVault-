import React, { useEffect, useRef, useState } from 'react';
import { ClipboardPlus, X, Mic, Square, Loader2 } from 'lucide-react';
import { Capacitor } from '@capacitor/core';
import { VoiceRecorder } from 'capacitor-voice-recorder';
import { uploadClinicalMedia } from '../../services/mediaStorage';
import { Patient, ProgressNote } from '../../types/clinical';
import { useApp } from '../../context/AppContext';

interface Props { patient: Patient; onClose: () => void; }

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const clean = base64.includes(',') ? base64.split(',').pop() || '' : base64;
  const bytes = Uint8Array.from(atob(clean), (char) => char.charCodeAt(0));
  return new Blob([bytes], { type: mimeType || 'audio/aac' });
};

export const QuickClinicalRecord: React.FC<Props> = ({ patient, onClose }) => {
  const { updatePatient, showToast, auth } = useApp();
  const [text, setText] = useState('');
  const [type, setType] = useState('Quick Clinical Record');
  const [recording, setRecording] = useState(false);
  const [recordingBusy, setRecordingBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [audioUrl, setAudioUrl] = useState('');
  const [duration, setDuration] = useState(0);

  const webRecorderRef = useRef<MediaRecorder | null>(null);
  const webChunksRef = useRef<Blob[]>([]);
  const startedRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => () => {
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    webRecorderRef.current?.stream.getTracks().forEach((track) => track.stop());
  }, [audioUrl]);

  const startTimer = () => {
    startedRef.current = Date.now();
    setDuration(0);
    if (timerRef.current !== null) window.clearInterval(timerRef.current);
    timerRef.current = window.setInterval(() => {
      setDuration(Math.round((Date.now() - startedRef.current) / 1000));
    }, 500);
  };

  const stopTimer = () => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const startRecording = async () => {
    if (recording || recordingBusy) return;
    setRecordingBusy(true);
    try {
      if (Capacitor.isNativePlatform()) {
        const capability = await VoiceRecorder.canDeviceVoiceRecord();
        if (!capability.value) throw new Error('Voice recording is not supported on this device.');
        const permission = await VoiceRecorder.requestAudioRecordingPermission();
        if (!permission.value) throw new Error('Microphone permission was denied.');
        await VoiceRecorder.startRecording();
        startTimer();
        setRecording(true);
        showToast('Voice recording started.', 'info');
        return;
      }

      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
        throw new Error('Audio recording is not supported in this browser.');
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredTypes = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'];
      const mimeType = preferredTypes.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      const recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
      webChunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) webChunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop());
        const blob = new Blob(webChunksRef.current, { type: recorder.mimeType || 'audio/webm' });
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setDuration(Math.max(1, Math.round((Date.now() - startedRef.current) / 1000)));
      };
      webRecorderRef.current = recorder;
      recorder.start();
      startTimer();
      setRecording(true);
      showToast('Voice recording started.', 'info');
    } catch (error: any) {
      console.error('Voice recording start failed:', error);
      showToast(String(error?.message || error?.code || 'Unable to start voice recording.'), 'error');
      stopTimer();
    } finally {
      setRecordingBusy(false);
    }
  };

  const stopRecording = async () => {
    if (!recording || recordingBusy) return;
    setRecordingBusy(true);
    stopTimer();
    try {
      if (Capacitor.isNativePlatform()) {
        const result: any = await VoiceRecorder.stopRecording();
        const value = result?.value || result;
        const mimeType = String(value?.mimeType || 'audio/aac');
        const base64 = String(value?.recordDataBase64 || '');
        if (!base64) throw new Error('The recorder returned no audio data.');
        const blob = base64ToBlob(base64, mimeType);
        setAudioBlob(blob);
        setAudioUrl(URL.createObjectURL(blob));
        setDuration(Math.max(1, Math.round(Number(value?.msDuration || 0) / 1000)) || Math.max(1, Math.round((Date.now() - startedRef.current) / 1000)));
      } else {
        webRecorderRef.current?.stop();
        webRecorderRef.current = null;
      }
      setRecording(false);
      showToast('Voice recording ready to save.', 'success');
    } catch (error: any) {
      console.error('Voice recording stop failed:', error);
      setRecording(false);
      showToast(String(error?.message || error?.code || 'Unable to stop voice recording.'), 'error');
    } finally {
      setRecordingBusy(false);
    }
  };

  const clearRecording = () => {
    if (recording) void stopRecording();
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    setAudioBlob(null);
    setAudioUrl('');
    setDuration(0);
  };

  const save = async () => {
    if (saving || recording) return;
    const value = text.trim();
    if (!value && !audioBlob) {
      showToast('Add a note or record a voice note first.', 'error');
      return;
    }

    setSaving(true);
    try {
      const now = new Date();
      const id = `quick-${Date.now()}`;
      let savedAudioUrl: string | undefined;
      let audioStoragePath: string | undefined;

      if (audioBlob) {
        const extension = audioBlob.type.includes('aac') ? 'aac' : audioBlob.type.includes('mp4') ? 'm4a' : 'webm';
        const path = `patients/${patient.id}/quick-records/${id}.${extension}`;
        const uploaded = await uploadClinicalMedia(audioBlob, path);
        savedAudioUrl = uploaded.url;
        if (uploaded.cloud) audioStoragePath = path;
      }

      const note: ProgressNote = {
        id,
        date: now.toISOString().split('T')[0],
        time: now.toTimeString().slice(0, 5),
        author: auth.userName || 'Physician',
        type,
        subjective: '',
        objective: '',
        assessment: value,
        plan: value || 'Audio clinical record',
        audioUrl: savedAudioUrl,
        audioStoragePath,
        audioDurationSeconds: duration,
        updatedAt: now.toISOString(),
      };

      updatePatient(patient.id, {
        progressNotes: [note, ...(patient.progressNotes || [])],
      });

      showToast('Clinical record saved successfully.', 'success');
      clearRecording();
      onClose();
    } catch (error: any) {
      console.error('Quick clinical record save failed:', error);
      showToast(String(error?.message || 'Clinical record could not be saved.'), 'error');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[110] bg-slate-950/60 backdrop-blur-sm p-3 flex items-end sm:items-center justify-center">
      <div className="w-full max-w-lg rounded-3xl bg-white dark:bg-[#0E1626] border border-slate-200 dark:border-slate-800 shadow-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-base font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
              <ClipboardPlus className="w-5 h-5 text-cyan-500" /> Quick Clinical Record
            </h2>
            <p className="text-[11px] text-slate-400">Saved as a dated Progress Note and shown in the patient timeline.</p>
          </div>
          <button type="button" onClick={onClose} disabled={saving || recording} className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-40"><X className="w-4 h-4" /></button>
        </div>

        <label className="block text-xs font-bold text-slate-600 dark:text-slate-300">
          Record type
          <select value={type} onChange={(event) => setType(event.target.value)} disabled={saving || recording} className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2.5 text-sm">
            <option>Quick Clinical Record</option><option>Rounding Update</option><option>Clinical Event</option><option>Consultation Update</option><option>Important Observation</option>
          </select>
        </label>

        <div className="mt-3 p-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
          <div className="flex items-center justify-between gap-2">
            <div>
              <div className="text-xs font-bold text-slate-700 dark:text-slate-200">Voice note</div>
              <div className="text-[10px] text-slate-400">{recording ? `Recording… ${duration}s` : audioBlob ? `Recorded ${duration}s` : 'Optional audio recording'}</div>
            </div>
            <div className="flex gap-2">
              {!recording ? (
                <button type="button" onClick={() => void startRecording()} disabled={recordingBusy || saving} className="px-3 py-2 rounded-xl bg-cyan-500 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-40">
                  {recordingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Mic className="w-4 h-4" />} Record
                </button>
              ) : (
                <button type="button" onClick={() => void stopRecording()} disabled={recordingBusy} className="px-3 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold flex items-center gap-1 disabled:opacity-40">
                  {recordingBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Square className="w-4 h-4" />} Stop
                </button>
              )}
              {audioBlob && <button type="button" onClick={clearRecording} disabled={saving || recordingBusy} className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold disabled:opacity-40">Clear</button>}
            </div>
          </div>
          {audioUrl && <audio controls src={audioUrl} className="w-full mt-3" />}
        </div>

        <textarea autoFocus value={text} onChange={(event) => setText(event.target.value)} disabled={saving || recording} placeholder="Document the important clinical event, observation, response, or update…" className="mt-3 w-full min-h-[170px] resize-y rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none focus:border-cyan-500 text-slate-900 dark:text-white" />

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} disabled={saving || recording} className="px-4 py-2.5 rounded-xl text-xs font-bold border border-slate-200 dark:border-slate-700 disabled:opacity-40">Cancel</button>
          <button type="button" disabled={saving || recordingBusy || recording || (!text.trim() && !audioBlob)} onClick={() => void save()} className="px-5 py-2.5 rounded-xl bg-cyan-500 disabled:opacity-40 text-white text-xs font-bold flex items-center gap-2">
            {saving && <Loader2 className="w-4 h-4 animate-spin" />} {saving ? 'Saving…' : 'Save Record'}
          </button>
        </div>
      </div>
    </div>
  );
};
