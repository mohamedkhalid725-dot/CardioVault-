import React,{useEffect,useId,useRef,useState}from'react';
import{Loader2,Mic,Square,X,Sparkles}from'lucide-react';
import{Capacitor}from'@capacitor/core';
import{FirebaseAuthentication}from'@capacitor-firebase/authentication';
import{VoiceRecorder}from'capacitor-voice-recorder';
import{AI_MODEL,AI_TEST_DATA_ONLY}from'../../config/aiConfig';
import{transcribeMedicalVoice}from'../../services/aiLogic';
import{withVoiceTimeout,requestVoiceConsent}from'../../services/voicePipeline';
import{VoiceProxyError,isAndroidProxyPath,proxyErrorMessage,transcribeViaProxy}from'../../services/voiceProxy';
import{VOICE_QUEUE_MAX_ATTEMPTS,backoffMs,blobToBase64String,canRetry,idbListItems,idbPutItem,idbRemoveItem,isAutoRetryable,isRetryableCode,markForRetry}from'../../services/voiceQueue';
import type{VoiceQueueItem}from'../../services/voiceQueue';
import{useApp}from'../../context/AppContext';
import{useIsPreviousViewer}from'./PreviousAdmissionViewer';

interface Props{
 value:string;
 onApply:(draft:string)=>void;
 disabled?:boolean;
 fieldLabel?:string;
 patientId?:string;
 fieldId?:string;
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

export const VoiceDictationButton:React.FC<Props>=({value,onApply,disabled=false,fieldLabel='clinical field',patientId,fieldId})=>{
 const id=useId();const{showToast}=useApp();const[recording,setRecording]=useState(false);const[busy,setBusy]=useState(false);const[cooldown,setCooldown]=useState(0);const[error,setError]=useState('');const[draft,setDraft]=useState('');const[transcription,setTranscription]=useState('');const[fallback,setFallback]=useState(false);const[open,setOpen]=useState(false);const[warnings,setWarnings]=useState<string[]>([]);const[uncertain,setUncertain]=useState<string[]>([]);const[audioUrl,setAudioUrl]=useState('');const[elapsedSec,setElapsedSec]=useState(0);const[currentItemId,setCurrentItemId]=useState<string|null>(null);const[queueFailed,setQueueFailed]=useState('');const[queueFailedCode,setQueueFailedCode]=useState('');
 const nativeRecordingRef=useRef(false);const webRecorderRef=useRef<MediaRecorder|null>(null);const chunksRef=useRef<Blob[]>([]);const streamRef=useRef<MediaStream|null>(null);const startedAtRef=useRef(0);const timerRef=useRef<number|null>(null);const audioUrlRef=useRef('');
 const RECORDING_MAX_SEC=180;
 const fmtElapsed=(s:number)=>Math.floor(s/60)+':'+String(s%60).padStart(2,'0');
 const clearTimer=()=>{if(timerRef.current!==null){window.clearInterval(timerRef.current);timerRef.current=null;}};
 const setAudioObjectUrl=(blob:Blob)=>{if(audioUrlRef.current)URL.revokeObjectURL(audioUrlRef.current);const url=URL.createObjectURL(blob);audioUrlRef.current=url;setAudioUrl(url);};
 const clearAudioObjectUrl=()=>{if(audioUrlRef.current)URL.revokeObjectURL(audioUrlRef.current);audioUrlRef.current='';setAudioUrl('');};
 // Persistent queue (Android proxy path only): one upload attempt against a
 // queued item. Callers set state/attempts; this flips uploading->done/failed.
 const uploadAttempt=async(blobToSend:Blob,label:string,base:VoiceQueueItem|null)=>{
  if(base)await idbPutItem({...base,state:'uploading'}).catch(()=>{});
  try{
   const proxy=await withVoiceTimeout(transcribeViaProxy(blobToSend,label),'proxy transcription',60000);
   if(base)await idbPutItem({...base,state:'done',result:{raw_transcript:proxy.raw_transcript,clean_english:proxy.clean_english,uncertain:proxy.uncertain,warnings:proxy.warnings}}).catch(()=>{});
   return proxy;
  }catch(q){if(base)await idbPutItem({...base,state:'failed',lastError:q instanceof VoiceProxyError?q.code:'proxy_failed'}).catch(()=>{});throw q;}
 };
 const openProxyDraft=(proxy:{clean_english:string;raw_transcript:string;warnings:string[];uncertain:string[]})=>{setDraft(proxy.clean_english||'');setTranscription(proxy.raw_transcript||'');setWarnings(proxy.warnings);setUncertain(proxy.uncertain);setFallback(false);setQueueFailed('');setQueueFailedCode('');setOpen(true);showToast('AI draft is ready. Review it before inserting.','success');};
 // Local audio is deleted only when the doctor approves or discards the draft.
 const dismissModal=()=>{setOpen(false);setDraft('');setTranscription('');setWarnings([]);setUncertain([]);setQueueFailed('');setQueueFailedCode('');clearAudioObjectUrl();if(currentItemId){const idToRemove=currentItemId;setCurrentItemId(null);void idbRemoveItem(idToRemove).catch(()=>{});}};
 // Records a proxy failure: manual Retry stays only for transient errors and
 // for sign-in (the doctor may have just signed in again). Everything else —
 // and anything past the attempt cap — shows a final message with no Retry.
 // The recording always stays saved in the queue until approve/discard.
 const noteProxyFailure=(code:string,message:string,attempts:number):string=>{
  const canManual=(isRetryableCode(code)||code==='sign_in_again')&&attempts<VOICE_QUEUE_MAX_ATTEMPTS;
  if(canManual){setQueueFailed(message);setQueueFailedCode(code);}
  else{setQueueFailed('');setQueueFailedCode('');}
  return attempts>=VOICE_QUEUE_MAX_ATTEMPTS?`${message} Tried ${attempts} times — no retries left. Please re-record.`:message;
 };
 const runQueueItem=async(item:VoiceQueueItem)=>{
  if(busy||recording)return;setBusy(true);setError('');
  try{
   const blob=base64ToBlob(item.audioBase64,item.mimeType);setAudioObjectUrl(blob);
   const base=item.state==='failed'?markForRetry(item):{...item,state:'pending' as const,attempts:item.attempts+1};
   const proxy=await uploadAttempt(blob,item.fieldLabel,base);
   openProxyDraft(proxy);
  }catch(e:any){
   if(e instanceof VoiceProxyError){
    const final=noteProxyFailure(e.code,String(e.message||'Voice transcription failed.'),(item.attempts||0)+1);
    setError(final);showToast(final,'error');
   }else{const msg=String(e?.message||'Voice transcription failed.');setError(msg);showToast(msg,'error');}
  }finally{setBusy(false);}
 };
 const retryNow=()=>{void (async()=>{try{const items=await idbListItems();const found=items.find(i=>i.id===currentItemId);if(!found||found.attempts>=VOICE_QUEUE_MAX_ATTEMPTS)return;if(found.state==='failed'||found.state==='pending')await runQueueItem(found);}catch{/* storage unavailable */}})();};
 // Highlights [?word?] markers and uncertain tokens in review text.
 const highlightDraft=(text:string):React.ReactNode=>{
  let k=0;
  const mark=(t:string)=><mark key={`m${k++}`} className="rounded bg-amber-200 dark:bg-amber-500/30 px-0.5">{t}</mark>;
  const out:React.ReactNode[]=[];
  text.split(/(\[\?.*?\?\])/g).forEach(c=>{
   if(!c)return;
   if(/^\[\?.*\?\]$/.test(c)){out.push(mark(c));return;}
   if(!uncertain.length){out.push(c);return;}
   let rest=c;const segs:React.ReactNode[]=[];
   while(rest){
    let hit=-1;let term='';
    for(const u of uncertain){if(!u)continue;const idx=rest.indexOf(u);if(idx>=0&&(hit<0||idx<hit)){hit=idx;term=u;}}
    if(hit<0){segs.push(rest);break;}
    if(hit>0)segs.push(rest.slice(0,hit));
    segs.push(mark(term));rest=rest.slice(hit+term.length);
   }
   out.push(<span key={`c${k++}`}>{segs.map((s,j)=>typeof s==='string'?<span key={`s${k++}-${j}`}>{s}</span>:s)}</span>);
  });
  return out;
 };
 useEffect(()=>{if(cooldown<=0)return;const t=window.setInterval(()=>setCooldown(v=>Math.max(0,v-1)),1000);return()=>window.clearInterval(t);},[cooldown]);
 useEffect(()=>()=>{webRecorderRef.current?.stream.getTracks().forEach(t=>t.stop());streamRef.current?.getTracks().forEach(t=>t.stop());if(timerRef.current!==null)window.clearInterval(timerRef.current);if(audioUrlRef.current)URL.revokeObjectURL(audioUrlRef.current);release(id);},[id]);
 // Restore a queued recording for this patient+field after app restart.
 useEffect(()=>{
  if(!isAndroidProxyPath())return;
  let cancelled=false;
  void (async()=>{
   try{
    const items=await idbListItems();
    const mine=items.filter(i=>i.patientId===(patientId??'unknown-patient')&&i.fieldId===(fieldId??fieldLabel));
    if(!mine.length||cancelled)return;
    const latest=mine.sort((a,b)=>b.createdAt-a.createdAt)[0];
    if(latest.result&&latest.state==='done'&&latest.audioBase64){
     setCurrentItemId(latest.id);setAudioObjectUrl(base64ToBlob(latest.audioBase64,latest.mimeType));
     setDraft(latest.result.clean_english);setTranscription(latest.result.raw_transcript);setWarnings(latest.result.warnings);setUncertain(latest.result.uncertain);setFallback(false);setOpen(true);
    }else if(latest.state==='failed'&&canRetry(latest)){setCurrentItemId(latest.id);setQueueFailed('A previous recording failed and can be retried.');}
   }catch{/* queue storage unavailable: skip restore */}
  })();
  return()=>{cancelled=true;};
 },[patientId,fieldId,fieldLabel]);
 // Auto-retry with backoff when the connection returns (Capacitor Network
 // plugin on native, window online event as fallback).
 useEffect(()=>{
  if(!isAndroidProxyPath())return;
  const onOnline=()=>{
   void (async()=>{
    if(busy||recording||open)return;
    try{
     const items=await idbListItems();
     const cand=items.filter(i=>i.patientId===(patientId??'unknown-patient')&&i.fieldId===(fieldId??fieldLabel)&&isAutoRetryable(i));
     if(!cand.length)return;
     const oldest=cand.sort((a,b)=>a.createdAt-b.createdAt)[0];
     await new Promise(r=>setTimeout(r,backoffMs(oldest.attempts)));
     setCurrentItemId(oldest.id);
     await runQueueItem(oldest);
    }catch{/* retry later */}
   })();
  };
  window.addEventListener('online',onOnline);
  let removeNetwork:(()=>void)|null=null;
  void (async()=>{
   try{
    const{Network}=await import('@capacitor/network');
    const handle=await Network.addListener('networkStatusChange',s=>{if(s.connected)onOnline();});
    removeNetwork=()=>{void handle.remove();};
   }catch{/* window online event is enough on web */}
  })();
  return()=>{window.removeEventListener('online',onOnline);if(removeNetwork)removeNetwork();};
 },[busy,recording,open,patientId,fieldId,fieldLabel]);
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
    const key=fieldId??fieldLabel;const pid=patientId??'unknown-patient';
    let base:VoiceQueueItem|null=null;
    try{
     const audioBase64=await blobToBase64String(blob);
     base={id:`vq-${Date.now()}-${Math.floor(Math.random()*1000000)}`,patientId:pid,fieldId:key,fieldLabel,mimeType:blob.type||'audio/aac',audioBase64,createdAt:Date.now(),attempts:1,state:'pending'};
     await idbPutItem(base);setCurrentItemId(base.id);
    }catch{base=null;setCurrentItemId(null);}
    try{
     const proxy=await uploadAttempt(blob,fieldLabel,base);
     openProxyDraft(proxy);
    }catch(q:any){
     if(q instanceof VoiceProxyError){q.message=noteProxyFailure(q.code,String(q.message||'Voice transcription failed.'),base?base.attempts:1);}
     throw q;
    }
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
 const apply=()=>{const clean=draft.trim();if(!clean)return;const base=value.trimEnd();const combined=base?base+'\n'+clean:clean;onApply(combined);dismissModal();showToast('AI draft inserted. Review the field and save it yourself.','success');};
  // Safety net (B-D): one tap inserts the untouched transcription when the polished draft is wrong.
  const insertRaw=()=>{const clean=transcription.trim();if(!clean)return;const base=value.trimEnd();const combined=base?base+String.fromCharCode(10)+clean:clean;onApply(combined);dismissModal();showToast('Raw transcription inserted. Review the field and save it yourself.','success');};
 return <span className="inline-flex items-center">
  <button type="button" onClick={()=>{recording?void stop():void start();}} disabled={disabled||busy||cooldown>0} title={cooldown>0?'AI limit reached, try again in ~'+cooldown+' seconds':'Voice dictation for '+fieldLabel} className="inline-flex items-center justify-center w-9 h-9 rounded-lg border border-cyan-500/30 bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 disabled:opacity-40 disabled:cursor-not-allowed">
   {busy?<Loader2 className="w-4 h-4 animate-spin"/>:recording?<Square className="w-4 h-4"/>:<Mic className="w-4 h-4"/>}
  </button>
  {recording&&<span className="ml-2 text-[10px] font-bold text-cyan-600 dark:text-cyan-300 tabular-nums">{fmtElapsed(elapsedSec)} / {fmtElapsed(RECORDING_MAX_SEC)}</span>}
  {cooldown>0&&<span className="ml-2 text-[10px] font-bold text-amber-600 dark:text-amber-300">AI limit reached, try again in ~{cooldown} seconds</span>}
  {error&&<span className="ml-2 text-[10px] text-rose-600 dark:text-rose-300">{error}</span>}
  {queueFailed&&<button type="button" onClick={retryNow} disabled={disabled||busy||recording} className="ml-2 px-2 py-1 rounded-lg border border-amber-500/40 text-amber-700 dark:text-amber-300 text-[10px] font-bold disabled:opacity-40">Retry</button>}
  {open&&<div className="fixed inset-0 z-[140] bg-black/60 flex items-center justify-center p-3"><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 p-5 shadow-2xl border border-slate-200 dark:border-slate-800">
    <div className="flex items-start justify-between gap-3"><div><div className="text-sm font-black">AI draft — review before saving</div><div className="text-[10px] text-slate-500 mt-1">{AI_TEST_DATA_ONLY?'Fake/test data only. ':''}{isAndroidProxyPath()?'Source: recorder + proxy. ':'Source: recorder + cloud. '} {fallback?'Fallback model used. ':''}Target field: {fieldLabel}</div></div><button type="button" onClick={dismissModal} className="p-2 rounded-lg bg-slate-100 dark:bg-slate-800"><X className="w-4 h-4"/></button></div>
    {warnings.length>0&&<div className="mt-4 rounded-xl border border-rose-500/50 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300"><div className="font-black mb-1">Check before approving</div><ul className="list-disc ml-4 space-y-0.5">{warnings.map((w,i)=><li key={i}>{w}</li>)}</ul></div>}
    {audioUrl&&<div className="mt-4"><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Original audio</div><audio controls src={audioUrl} className="mt-1 w-full"/></div>}
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
    {transcription&&<div><div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Transcription</div><div className="mt-1 rounded-xl bg-slate-50 dark:bg-slate-800/70 p-3 text-xs whitespace-pre-wrap">{highlightDraft(transcription)}</div></div>}
    <div><label className="block text-xs font-bold text-slate-600 dark:text-slate-300">Medical English draft (editable)<textarea value={draft} onChange={e=>setDraft(e.target.value)} rows={7} className="w-full mt-1 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-950 px-3 py-2.5 text-sm outline-none focus:border-cyan-500 resize-y"/></label>{uncertain.length>0&&draft&&<div className="mt-1 rounded-xl bg-amber-500/10 p-2 text-xs whitespace-pre-wrap">{highlightDraft(draft)}</div>}</div>
    </div>
    <div className="mt-2 text-[10px] text-slate-500">This will be appended to the existing field; it will not overwrite it and will not be auto-saved.</div>
    <div className="flex justify-end gap-2 mt-4"><button type="button" onClick={dismissModal} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">Discard</button>{transcription.trim()&&<button type="button" onClick={insertRaw} className="px-4 py-2 rounded-xl border border-cyan-500/40 text-cyan-700 dark:text-cyan-300 text-xs font-bold">Insert Raw</button>}<button type="button" disabled={!draft.trim()} onClick={apply} className="px-5 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-black flex items-center gap-2"><Sparkles className="w-4 h-4"/>Insert Draft</button></div>
  </div></div>}
 </span>;
};
