import React,{useEffect,useState}from'react';
import{AlertTriangle,CloudOff,Loader2,X}from'lucide-react';
import{useApp}from'../../context/AppContext';
import{dismissCloudError,getCloudHealth,type CloudHealth}from'../../services/clinicalSyncStore';

/**
 * Persistent cloud-health strip. The app used to swallow sync failures (and clear
 * the stored error on the next success), so a blocked admission looked like a
 * random glitch. This banner keeps the last failure, the pending master-file event
 * count and any quota cooldown visible until the user dismisses or retries.
 */
export const CloudHealthBanner:React.FC=()=>{
 const{isSyncing,syncNow}=useApp();
 const[health,setHealth]=useState<CloudHealth>(()=>getCloudHealth());
 useEffect(()=>{
  const update=()=>setHealth(getCloudHealth());
  update();
  const timer=window.setInterval(update,10000);
  window.addEventListener('cardiovault-cloud-health-changed',update);
  return()=>{window.clearInterval(timer);window.removeEventListener('cardiovault-cloud-health-changed',update);};
 },[]);
 if(!health.lastErrorAt&&!health.quotaCoolingDown&&health.pendingLifecycle===0)return null;
 const quota=health.quotaCoolingDown;
 const pending=health.pendingLifecycle;
 const tone=quota||pending?'border-amber-300 bg-amber-50 dark:border-amber-500/40 dark:bg-amber-950/30 text-amber-900 dark:text-amber-100':'border-rose-300 bg-rose-50 dark:border-rose-500/40 dark:bg-rose-950/30 text-rose-900 dark:text-rose-100';
 const Icon=quota?CloudOff:AlertTriangle;
 return <div className={'mx-3 mt-2 sm:mx-6 rounded-xl border px-3 py-2 text-[11px] font-semibold flex items-center gap-2 '+tone}>
  <Icon className="w-4 h-4 shrink-0"/>
  <div className="min-w-0 flex-1 leading-snug">
   {quota?<span>Firestore quota reached. Automatic sync is paused; your data is saved on this device. </span>:null}
   {!quota&&health.lastErrorAt?<span>Cloud sync needs attention: {health.lastErrorDetail||'unknown error'}. </span>:null}
   {pending>0?<span>{pending} master-file event{pending>1?'s':''} waiting to upload. </span>:null}
   <span className="text-slate-500 dark:text-slate-400">{health.lastSyncAt?`Last successful sync: ${new Date(health.lastSyncAt).toLocaleString()}`:'No successful cloud sync yet.'}</span>
  </div>
  <button type="button" onClick={()=>void syncNow()} disabled={isSyncing} className="shrink-0 inline-flex items-center gap-1 rounded-lg px-2 py-1 bg-white/70 dark:bg-slate-900/60 border border-current/20 disabled:opacity-60">
   {isSyncing?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:null}Retry
  </button>
  {health.lastErrorAt&&!quota?<button type="button" onClick={()=>{dismissCloudError();setHealth(getCloudHealth());}} className="shrink-0 p-1 rounded-lg hover:bg-black/5 dark:hover:bg-white/10" aria-label="Dismiss cloud error"><X className="w-3.5 h-3.5"/></button>:null}
 </div>;
};
