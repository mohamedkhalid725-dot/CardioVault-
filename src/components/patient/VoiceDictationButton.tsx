import React,{useEffect,useId,useRef,useState}from'react';
import{Loader2,Mic,Square,X,Sparkles}from'lucide-react';
import{Capacitor}from'@capacitor/core';
import{FirebaseAuthentication}from'@capacitor-firebase/authentication';
import{VoiceRecorder}from'capacitor-voice-recorder';
import{AI_MODEL,AI_TEST_DATA_ONLY}from'../../config/aiConfig';
import{transcribeMedicalVoice}from'../../services/aiLogic';
import{withVoiceTimeout,requestVoiceConsent}from'../../services/voicePipeline';
import{VoiceProxyError,isAndroidProxyPath,transcribeViaProxy}from'../../services/voiceProxy';
import{useApp}from'../../context/AppContext';
import{useIsPreviousViewer}from'./PreviousAdmissionViewer';

interface Props{
 value:string;
 onApply:(draft:string)=>void;
 disabled?:boolean;
 fieldLabel?:string;
}
// RECORDER-ONLY (locked): the on-device live popup is removed entirely — it
// mangled mixed Arabic-English medical speech and never printed debug tokens.
// Every platform records -> transcribes via transcribeMedicalVoice (cloud,
// same engine as web). A cloud failure shows a clear error, never a popup.
const base64ToBlob=(base64:string,mimeType:string)=>{const clean=base64.includes(',')?base64.split(',').pop()||'':base64;const bytes=Uint8Array.from(atob(clean),c=>c.charCodeAt(0));return new Blob([bytes],{type:mimeType||'audio/aac'});};
let activeRecorderId:string|null=null;
const claim=(id:string)=>{if(activeRecorderId&&activeRecorderId!==id)return false;activeRecorderId=id;return true;};
const release=(id:string)=>{if(activeRecorderId===id)activeRecorderId=null;};
// Cloud (Firebase AI) denial detector: SafeAIError carries
// details.category==='auth_app_check'; match the message too for wrapped errors.
const isAuthAppCheckError=(e:any)=>e?.details?.category==='auth_app_check'||/app.?check|not signed in|sign in again|AI access was denied/i.test(String(e?.message||''));

export const VoiceDictationButton:React.FC<Props>=({value,onApply,disabled=false,fieldLabel='clinical field'})=>{
 const id=useId();const{showToast}=useApp();const[recording,setRecording]=useState(false);const[busy,setBusy]=useState(false);const[cooldown,setCooldown]=useState(0);const[error,setError]=useState('');const[draft,setDraft]=useState('');const[transcription,setTranscription]=useState('');const[fallback,setFallback]=useState(false);const[open,setOpen]=useState(false);const[warnings,setWarnings]=useState<string[]>([]);const[uncertain,setUncertain]=useState<string[]>([]);const[audioUrl,setAudioUrl]=useState('');const[elapsedSec,setElapsedSec]=useState(0);
 const nativeRecordingRef=useRef(false);const webRecorderRef=useRef<MediaRecorder|null>(null);const chunksRef=useRef<Blob[]>([]);const streamRef=useRef<MediaStream|null>(null);const startedAtRef=useRef(0);const timerRef=useRef<number|null>(null);const audioUrlRef=useRef('');
 const RECORDING_MAX_SEC=180;
 const fmtElapsed=(s:number)=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
 const clearTimer=()=>{if(timerRef.current!==null){window.clearInterval(timerRef.current);timerRef.current=null;}};
 const setAudioObjectUrl=(blob:Blob)=>{if(audioUrlRef.current)URL.revokeObjectURL(audioUrlRef.current);const url=URL.createObjectURL(blob);audioUrlRef.current=url;setAudioUrl(url);};
 const clearAudioObjectUrl=()=>{if(audioUrlRef.current)URL.revokeObjectURL(audioUrlRef.current);audioUrlRef.current='';setAudioUrl('');};
 useEffect(()=>{if(cooldown<=0)return;const t=window.setInterval(()=>setCooldown(v=>Math.max(0,v-1)),1000);return()=>window.clearInterval(t);},[cooldown]);
 useEffect(()=>()=>{webRecorderRef.current?.stream.getTracks().forEach(t=>t.stop());streamRef.current?.getTracks().forEach(t=>t.stop());if(timerRef.current!==null)window.clearInterval(timerRef.current);if(audioUrlRef.current)URL.revokeObjectURL(audioUrlRef.current);release(id);},[id]);
 const isPreviousViewer=useIsPreviousViewer();
 if(isPreviousViewer)return null;
 const start=async()=>{
  if(disabled||busy||recording||cooldown>0)return;
  if(!claim(id)){showToast('Another voice recording or AI request is already in progress. Please wait for it to finish.','error');return;}
  setBusy(true);setError('');setFallback(false);
  if(!requestVoiceConsent()){release(id);setBusy(false);return;}
  try{
   if(Capacitor.isNativePlatform()){
    const capability=await withVoiceTimeout(VoiceRecorder.canDeviceVoiceRecord(),'recorder check');if(!capability.value)throw new Error('Voice recording is not supported on this device.');
    const permission=await withVoiceTimeout(VoiceRecorder.requestAudioRecordingPermission(),'microphone permission');if(!permission.value)throw new Error('Microphone permission was denied.');
    await withVoiceTimeout(VoiceRecorder.startRecording(),'recorder start');nativeRecordingRef.current=true;setRecording(true);startedAtRef.current=Date.now();setElapsedSec(0);clearTimer();timerRef.current=window.setInterval(()=>{const s=Math.floor((Date.now()-startedAtRef.current)/1000);setElapsedSec(s);if(s>=RECORDING_MAX_SEC)void stop();},500);showToast('Voice recording started. Tap the mic again to stop.','info');return;
   }
   if(!navigator.mediaDevices?.getUserMedia||typeof MediaRecorder==='undefined')throw new Error('Audio recording is not supported in this browser.');
   const stream=await withVoiceTimeout(navigator.mediaDevices.getUserMedia({audio:true}),'microphone access');streamRef.current=stream;
   const types=['audio/webm;codecs=opus','audio/webm','audio/mp4'];const mime=types.find(t=>MediaRecorder.isTypeSupported(t));const recorder=mime?new MediaRecorder(stream,{mimeType:mime}):new MediaRecorder(stream);
   chunksRef.current=[];recorder.ondataavailable=e=>{if(e.data.size)chunksRef.current.push(e.data);};webRecorderRef.current=recorder;recorder.start();setRecording(true);showToast('Voice recording started. Tap the mic again to stop.','info');
  }catch(e:any){release(id);setError(String(e?.message||'Unable to start voice recording.'));showToast(String(e?.message||'Unable to start voice recording.'),'error');}
  finally{setBusy(false);}
 };
 const stop=async()=>{
  if(!recording||busy)return;setBusy(true);setError('');clearTimer();
  try{
   let blob:Blob;
   if(nativeRecordingRef.current){
    const result:any=await withVoiceTimeout(VoiceRecorder.stopRecording(),'recorder stop',8000);nativeRecordingRef.current=false;const v=result?.value||result;const base64=String(v?.recordDataBase64||'');if(!base64)throw new Error('The recorder returned no audio data.');blob=base64ToBlob(base64,String(v?.mimeType||'audio/aac'));
   }else{
    const recorder=webRecorderRef.current;if(!recorder)throw new Error('The browser recorder is not available.');blob=await new Promise<Blob>((resolve,reject)=>{recorder.onstop=()=>{try{streamRef.current?.getTracks().forEach(t=>t.stop());resolve(new Blob(chunksRef.current,{type:recorder.mimeType||'audio/webm'}));}catch(e){reject(e);}};recorder.stop();});
    webRecorderRef.current=null;
   }
   // Native sign-in pre-check: cloud transcription needs a valid Firebase
   // session before any audio is sent.
   if(Capacitor.isNativePlatform()){
    let signedIn=false;
    try{const current=await withVoiceTimeout(FirebaseAuthentication.getCurrentUser(),'sign-in check',8000);signedIn=!!current?.user?.uid;}catch{signedIn=false;}
    if(!signedIn)throw new Error('You are not signed in. Please sign in again, then retry voice transcription.');
   }
   setRecording(false);setBusy(true);setAudioObjectUrl(blob);
   // Android-only proxy path: Firebase AI Logic cannot satisfy App Check in
   // the APK WebView, so native Android uploads through the backend proxy.
   // Web keeps transcribeMedicalVoice exactly as before.
   if(isAndroidProxyPath()){
    const proxy=await withVoiceTimeout(transcribeViaProxy(blob,fieldLabel),'proxy transcription',60000);
    setDraft(proxy.clean_english||'');setTranscription(proxy.raw_transcript||'');setWarnings(proxy.warnings);setUncertain(proxy.uncertain);setFallback(false);setOpen(true);showToast('AI draft is ready. Review it before inserting.','success');
   }else{
    const result=await withVoiceTimeout(transcribeMedicalVoice(blob),'voice transcription',45000);setDraft(result.medicalEnglish||result.transcription||'');setTranscription(result.transcription||'');setWarnings([]);setUncertain([]);setFallback(result.model!==AI_MODEL);setOpen(true);showToast('AI draft is ready. Review it before inserting.','success');
   }
  }catch(e:any){
   if(e instanceof VoiceProxyError){const msg=String(e.message||'Voice transcription failed.');setError(msg);showToast(msg,'error');
   }else{
   // Recorder-only: no live-popup fallback. Cloud denials (sign-in /
   // App Check, e.g. missing debug token on field builds) surface as a
   // clear error so the physician knows exactly what to fix.
   const retry=Number(e?.details?.retryAfterSeconds||0);if(e?.details?.httpStatus===429&&retry>0)setCooldown(retry);
   let msg=e?.details?.httpStatus===429&&retry>0?'AI limit reached, try again in ~'+retry+' seconds':String(e?.message||'AI voice transcription failed.');
   if(isAuthAppCheckError(e))msg+=' (Cloud blocked this device — check sign-in and the App Check debug token.)';
   setError(msg);showToast(msg,'error');
  }}finally{setRecording(false);setBusy(false);release(id);}
 };
 const apply=()=>{const clean=draft.trim();if(!clean)return;const base=value.trimEnd();const combined=base?base+'\n'+clean:clean;onApply(combined);setOpen(false);setDraft('');setTranscription('');showToast('AI draft inserted. Review the field and save it yourself.','success');};
  // Safety net (B-D): one tap inserts the untouched transcription when the polished draft is wrong.
  const insertRaw=()=>{const clean=transcription.trim();if(!clean)return;const base=value.trimEnd();const combined=base?base+String.fromCharCode(10)+clean:clean;onApply(combined);setOpen(false);setDraft('');setTranscription('');showToast('Raw transcription inserted. Review the field and save it yourself.','success');};
 return <span className="inline-flex items-center">
  <button type="button" onClick={()=>{recording?void stop():void start();}} disabled={disabled||busy||cooldown>0} title={cooldown>0?'AI limit reached, try again in ~'+cooldown+' seconds':'Voice dictation for '+fieldLabel} className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed">
   {busy?<Loader2 className="w-4 h-4 animate-spin"/>:recording?<Square className="w-4 h-4"/>:<Mic className="w-4 h-4"/>}
  </button>
  {recording&&<span className="ml-2 text-[10px] font-bold text-cyan-600 dark:text-cyan-300 tabular-nums">{fmtElapsed(elapsedSec)} / {fmtElapsed(RECORDING_MAX_SEC)}</span>}
  {cooldown>0&&<span className="ml-2 text-[10px] font-bold text-amber-600 dark:text-amber-300">AI limit reached, try again in ~{cooldown} seconds</span>}
  {error&&<span className="ml-2 text-[10px] text-rose-600 dark:text-rose-300">{error}</span>}
  {open&&<div className="fixed inset-0 z-[140] bg-black/60 flex items-center justify-center p-3"><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-2xl border border-slate-200 dark:border-slate-800">
    <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black">AI draft — review before saving</div><div className="text-[10px] text-slate-500 mt-1">{AI_TEST_DATA_ONLY?'Fake/test data only. ':''}Source: recorder + cloud. {fallback?'Fallback model used. ':''}Target field: {fieldLabel}</div></div><button type="button" onClick={()=>setOpen(false)} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800"><X className="w-4 h-4"/></button></div>
    {transcription&&<div className="mt-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Transcription</div><div className="mt-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3 text-xs whitespace-pre-wrap">{transcription}</div></div>}
    <label className="block mt-4 text-xs font-bold text-slate-600 dark:text-slate-300">Medical English draft<textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={7} className="w-full mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-cyan-500 resize-y"/></label>
    <div className="mt-2 text-[10px] text-slate-500">This will be appended to the existing field; it will not overwrite it and will not be auto-saved.</div>
    <div className="flex justify-end gap-2 mt-4"><button type="button" onClick={()=>setOpen(false)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">Discard</button>{transcription.trim()&&<button type="button" onClick={insertRaw} className="px-4 py-2 rounded-xl border border-cyan-500/40 text-cyan-700 dark:text-cyan-300 text-xs font-bold">Insert Raw</button>}<button type="button" disabled={!draft.trim()} onClick={apply} className="px-5 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-black flex items-center gap-2"><Sparkles className="w-4 h-4"/>Insert Draft</button></div>
  </div></div>}
 </span>;
};
