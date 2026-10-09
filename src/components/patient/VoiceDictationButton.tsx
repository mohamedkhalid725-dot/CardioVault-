import React,{useEffect,useId,useRef,useState}from'react';
import{Loader2,Mic,Square,X,Sparkles}from'lucide-react';
import{Capacitor}from'@capacitor/core';
import{VoiceRecorder}from'capacitor-voice-recorder';
import{AI_MODEL,AI_TEST_DATA_ONLY}from'../../config/aiConfig';
import{transcribeMedicalVoice}from'../../services/aiLogic';
import{useApp}from'../../context/AppContext';
import{useIsPreviousViewer}from'./PreviousAdmissionViewer';

interface Props{
 value:string;
 onApply:(draft:string)=>void;
 disabled?:boolean;
 fieldLabel?:string;
}
const base64ToBlob=(base64:string,mimeType:string)=>{const clean=base64.includes(',')?base64.split(',').pop()||'':base64;const bytes=Uint8Array.from(atob(clean),c=>c.charCodeAt(0));return new Blob([bytes],{type:mimeType||'audio/aac'});};
let activeRecorderId:string|null=null;
const claim=(id:string)=>{if(activeRecorderId&&activeRecorderId!==id)return false;activeRecorderId=id;return true;};
const release=(id:string)=>{if(activeRecorderId===id)activeRecorderId=null;};

export const VoiceDictationButton:React.FC<Props>=({value,onApply,disabled=false,fieldLabel='clinical field'})=>{
 const id=useId();const{showToast}=useApp();const[recording,setRecording]=useState(false);const[busy,setBusy]=useState(false);const[cooldown,setCooldown]=useState(0);const[error,setError]=useState('');const[draft,setDraft]=useState('');const[transcription,setTranscription]=useState('');const[fallback,setFallback]=useState(false);const[open,setOpen]=useState(false);
 const nativeRecordingRef=useRef(false);const webRecorderRef=useRef<MediaRecorder|null>(null);const chunksRef=useRef<Blob[]>([]);const streamRef=useRef<MediaStream|null>(null);
 useEffect(()=>{if(cooldown<=0)return;const t=window.setInterval(()=>setCooldown(v=>Math.max(0,v-1)),1000);return()=>window.clearInterval(t);},[cooldown]);
 useEffect(()=>()=>{webRecorderRef.current?.stream.getTracks().forEach(t=>t.stop());streamRef.current?.getTracks().forEach(t=>t.stop());release(id);},[id]);
 const isPreviousViewer=useIsPreviousViewer();
 if(isPreviousViewer)return null;
 const start=async()=>{
  if(disabled||busy||recording||cooldown>0)return;
  if(!claim(id)){showToast('Another voice recording or AI request is already in progress. Please wait for it to finish.','error');return;}
  setBusy(true);setError('');
  try{
   if(Capacitor.isNativePlatform()){
    const capability=await VoiceRecorder.canDeviceVoiceRecord();if(!capability.value)throw new Error('Voice recording is not supported on this device.');
    const permission=await VoiceRecorder.requestAudioRecordingPermission();if(!permission.value)throw new Error('Microphone permission was denied.');
    await VoiceRecorder.startRecording();nativeRecordingRef.current=true;setRecording(true);showToast('Voice recording started. Tap the mic again to stop.','info');return;
   }
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Audio recording is not supported in this browser.');
   const stream=await navigator.mediaDevices.getUserMedia({audio:true});streamRef.current=stream;
   const types=['audio/webm;codecs=opus','audio/webm','audio/mp4'];const mime=types.find(t=>MediaRecorder.isTypeSupported(t));const recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
   chunksRef.current=[];recorder.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data);};webRecorderRef.current=recorder;recorder.start();setRecording(true);showToast('Voice recording started. Tap the mic again to stop.','info');
  }catch(e:any){release(id);setError(String(e?.message||'Unable to start voice recording.'));showToast(String(e?.message||'Unable to start voice recording.'),'error');}
  finally{setBusy(false);}
 };
 const stop=async()=>{
  if(!recording||busy)return;setBusy(true);setError('');
  try{
   let blob:Blob;
   if(nativeRecordingRef.current){
    const result:any=await VoiceRecorder.stopRecording();nativeRecordingRef.current=false;const v=result?.value||result;const base64=String(v?.recordDataBase64||'');if(!base64)throw new Error('The recorder returned no audio data.');blob=base64ToBlob(base64,String(v?.mimeType||'audio/aac'));
   }else{
    const recorder=webRecorderRef.current;if(!recorder)throw new Error('The browser recorder is not available.');blob=await new Promise<Blob>((resolve,reject)=>{recorder.onstop=()=>{try{streamRef.current?.getTracks().forEach(t=>t.stop());resolve(new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'}));}catch(e){reject(e);}};recorder.stop();});
    webRecorderRef.current=null;
   }
   setRecording(false);setBusy(true);const result=await transcribeMedicalVoice(blob);setDraft(result.medicalEnglish||result.transcription||'');setTranscription(result.transcription||'');setFallback(result.model!==AI_MODEL);setOpen(true);showToast('AI draft is ready. Review it before inserting.','success');
  }catch(e:any){
   const retry=Number(e?.details?.retryAfterSeconds||0);if(e?.details?.httpStatus===429&&retry>0)setCooldown(retry);
   const msg=e?.details?.httpStatus===429&&retry>0?'AI limit reached, try again in ~'+retry+' seconds':String(e?.message||'AI voice transcription failed.');
   setError(msg);showToast(msg,'error');
  }finally{setRecording(false);setBusy(false);release(id);}
 };
 const apply=()=>{const clean=draft.trim();if(!clean)return;const base=value.trimEnd();const combined=base?base+'\\n'+clean:clean;onApply(combined);setOpen(false);setDraft('');setTranscription('');showToast('AI draft inserted. Review the field and save it yourself.','success');};
 return <span className="inline-flex items-center">
  <button type="button" onClick={()=>recording?void stop():void start()} disabled={disabled||busy||cooldown>0} title={cooldown>0?'AI limit reached, try again in ~'+cooldown+' seconds':'Voice dictation for '+fieldLabel} className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed">
   {busy?<Loader2 className="w-4 h-4 animate-spin"/>:recording?<Square className="w-4 h-4"/>:<Mic className="w-4 h-4"/>}
  </button>
  {cooldown>0&&<span className="ml-2 text-[10px] font-bold text-amber-600 dark:text-amber-300">AI limit reached, try again in ~{cooldown} seconds</span>}
  {error&&<span className="ml-2 text-[10px] text-rose-600 dark:text-rose-300">{error}</span>}
  {open&&<div className="fixed inset-0 z-[140] bg-black/60 flex items-center justify-center p-3"><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-2xl border border-slate-200 dark:border-slate-800">
    <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black">AI draft — review before saving</div><div className="text-[10px] text-slate-500 mt-1">{AI_TEST_DATA_ONLY?'Fake/test data only. ':''}{fallback?'Generated with fallback model. ':''}Target field: {fieldLabel}</div></div><button type="button" onClick={()=>setOpen(false)} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800"><X className="w-4 h-4"/></button></div>
    {transcription&&<div className="mt-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Transcription</div><div className="mt-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3 text-xs whitespace-pre-wrap">{transcription}</div></div>}
    <label className="block mt-4 text-xs font-bold text-slate-600 dark:text-slate-300">Medical English draft<textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={7} className="w-full mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-cyan-500 resize-y"/></label>
    <div className="mt-2 text-[10px] text-slate-500">This will be appended to the existing field; it will not overwrite it and will not be auto-saved.</div>
    <div className="flex justify-end gap-2 mt-4"><button type="button" onClick={()=>setOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">Discard</button><button type="button" disabled={!draft.trim()} onClick={apply} className="px-5 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-black flex items-center gap-2"><Sparkles className="w-4 h-4"/>Insert Draft</button></div>
  </div></div>}
 </span>;
};
