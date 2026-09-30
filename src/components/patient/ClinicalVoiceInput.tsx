import React, {useEffect, useRef, useState} from 'react';
import {Loader2, Mic, Square, WandSparkles, X} from 'lucide-react';
import {Capacitor} from '@capacitor/core';
import {VoiceRecorder} from 'capacitor-voice-recorder';
import {transcribeClinicalAudio, ClinicalVoiceField} from '../../services/clinicalVoiceService';

interface Props {
  value: string;
  onChange: (value: string) => void;
  field: ClinicalVoiceField;
  label?: string;
  disabled?: boolean;
  onRecordingReady?: (blob: Blob, durationSeconds: number) => void;
}

const base64ToBlob = (base64: string, mimeType: string): Blob => {
  const clean = base64.includes(',') ? base64.split(',').pop() || '' : base64;
  const bytes = Uint8Array.from(atob(clean), c => c.charCodeAt(0));
  return new Blob([bytes], {type: mimeType || 'audio/aac'});
};

export const ClinicalVoiceInput: React.FC<Props> = ({value,onChange,field,label='Voice documentation',disabled,onRecordingReady}) => {
  const [recording,setRecording]=useState(false);
  const [busy,setBusy]=useState(false);
  const [transcribing,setTranscribing]=useState(false);
  const [blob,setBlob]=useState<Blob|null>(null);
  const [duration,setDuration]=useState(0);
  const [status,setStatus]=useState('');
  const recorderRef=useRef<MediaRecorder|null>(null);
  const chunksRef=useRef<Blob[]>([]);
  const startedRef=useRef(0);

  useEffect(()=>()=>{recorderRef.current?.stream.getTracks().forEach(t=>t.stop());},[]);

  const finishBlob = async (audio: Blob, seconds: number) => {
    setBlob(audio);
    setDuration(seconds);
    onRecordingReady?.(audio, seconds);
    setTranscribing(true);
    setStatus('Transcribing and converting to medical English…');
    try {
      const result=await transcribeClinicalAudio(audio,field);
      const text=result.normalizedEnglish.trim() || result.transcript.trim();
      if(text) onChange(text);
      setStatus(result.confidence==='low' ? 'Low-confidence transcription — please review carefully.' : 'AI draft ready — review before saving.');
    } catch(error:any) {
      setStatus('');
      throw error;
    } finally { setTranscribing(false); }
  };

  const start = async () => {
    if(disabled||recording||busy||transcribing)return;
    setBusy(true);
    try {
      if(Capacitor.isNativePlatform()){
        const capability=await VoiceRecorder.canDeviceVoiceRecord();
        if(!capability.value) throw new Error('Voice recording is not supported on this device.');
        const permission=await VoiceRecorder.requestAudioRecordingPermission();
        if(!permission.value) throw new Error('Microphone permission was denied.');
        await VoiceRecorder.startRecording();
        startedRef.current=Date.now();
        setRecording(true);
        setStatus('Recording…');
        return;
      }
      if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined') throw new Error('Audio recording is not supported in this browser.');
      const stream=await navigator.mediaDevices.getUserMedia({audio:true});
      const types=['audio/webm;codecs=opus','audio/webm','audio/mp4'];
      const mimeType=types.find(t=>MediaRecorder.isTypeSupported(t));
      const recorder=mimeType?new MediaRecorder(stream,{mimeType}):new MediaRecorder(stream);
      chunksRef.current=[];
      recorder.ondataavailable=e=>{if(e.data.size>0)chunksRef.current.push(e.data);};
      recorder.onstop=async()=>{
        stream.getTracks().forEach(t=>t.stop());
        const audio=new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'});
        const seconds=Math.max(1,Math.round((Date.now()-startedRef.current)/1000));
        try{await finishBlob(audio,seconds);}catch(error:any){setStatus(String(error?.message||'Transcription failed.'));}
      };
      recorderRef.current=recorder;
      recorder.start();
      startedRef.current=Date.now();
      setRecording(true);
      setStatus('Recording…');
    } catch(error:any) {
      setStatus(String(error?.message||'Unable to start voice recording.'));
    } finally { setBusy(false); }
  };

  const stop = async () => {
    if(!recording||busy)return;
    setBusy(true);
    try {
      if(Capacitor.isNativePlatform()){
        const result:any=await VoiceRecorder.stopRecording();
        const value=result?.value||result;
        const base64=String(value?.recordDataBase64||'');
        if(!base64)throw new Error('The recorder returned no audio data.');
        const audio=base64ToBlob(base64,String(value?.mimeType||'audio/aac'));
        const seconds=Math.max(1,Math.round(Number(value?.msDuration||0)/1000));
        setRecording(false);
        await finishBlob(audio,seconds);
      } else {
        recorderRef.current?.stop();
        recorderRef.current=null;
        setRecording(false);
      }
    } catch(error:any) {
      setRecording(false);
      setStatus(String(error?.message||'Unable to stop voice recording.'));
    } finally { setBusy(false); }
  };

  return <div className="space-y-1.5">
    <div className="flex items-center gap-2">
      <button type="button" onClick={()=>void (recording?stop():start())} disabled={disabled||busy||transcribing}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] font-bold ${recording?'bg-rose-500 text-white':'bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/20'} disabled:opacity-40`}>
        {busy||transcribing?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:recording?<Square className="w-3.5 h-3.5"/>:<Mic className="w-3.5 h-3.5"/>}
        {transcribing?'Processing…':recording?`Stop ${duration ? `(${duration}s)` : ''}`:'Record & Convert'}
      </button>
      {value&&<button type="button" onClick={()=>onChange('')} disabled={disabled||recording||transcribing} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800"><X className="w-3 h-3"/></button>}
    </div>
    {status&&<div className="flex items-start gap-1 text-[9px] text-slate-400"><WandSparkles className="w-3 h-3 shrink-0 mt-0.5"/><span>{status}</span></div>}
  </div>;
};
