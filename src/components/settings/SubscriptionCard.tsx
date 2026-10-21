import React,{useEffect,useState} from 'react';
import {CreditCard,Loader2,RefreshCw,AlertTriangle}from 'lucide-react';
import {useApp}from'../../context/AppContext';
import {getSubscription,renewSubscription,ensureTrialStarted}from'../../services/workspaceSubscription';
import {isMasterAccount}from'../../services/workspaceAccess';

const localDate=(ms:any)=>{const value=Number(ms||0);return value>0?new Date(value).toLocaleString():'—';};
const daysText=(value:number)=>`${value} ${value===1?'day':'days'}`;

// Workspace subscription clock: 3-day trial → 30 days → 2-day grace → read-only.
// Only the platform owner can move the clock; everybody else just reads it.
export const SubscriptionCard:React.FC=()=>{
 const{showToast}=useApp();
 const[sub,setSub]=useState<any>(null);
 const[owner,setOwner]=useState(false);
 const[loading,setLoading]=useState(true);
 const[error,setError]=useState('');
 const[reference,setReference]=useState('');
 const[busy,setBusy]=useState<''|'trial'|'renew'>('');
 const[retrying,setRetrying]=useState(false);

 const refresh=async()=>{
  try{const next=await getSubscription();setSub(next);setError('');}
  catch(readError:any){setError(String(readError?.message||'Could not read the workspace subscription.'));}
 };

 useEffect(()=>{let active=true;(async()=>{
  try{
   const [state,isOwner]=await Promise.all([getSubscription(),isMasterAccount().catch(()=>false)]);
   if(!active)return;
   setSub(state);setOwner(!!isOwner);setError('');
  }catch(readError:any){
   if(active)setError(String(readError?.message||'Could not read the workspace subscription.'));
  }finally{
   if(active)setLoading(false);
  }
 })();return()=>{active=false;};},[]);

 const startTrial=async()=>{
  setBusy('trial');
  try{const next=await ensureTrialStarted();if(next)setSub(next);await refresh();showToast('3-day trial started.','success');}
  catch(trialError:any){showToast(String(trialError?.message||'Could not start the trial.'),'error');}
  finally{setBusy('');}
 };

 const renew=async()=>{
  setBusy('renew');
  try{
   const next=await renewSubscription(reference.trim()||undefined);
   setSub(next);
   await refresh();
   showToast(`Subscription renewed — now active until ${localDate(next?.periodEndMs)}.`,'success');
  }catch(renewError:any){
   showToast(String(renewError?.message||'Could not renew the subscription.'),'error');
  }finally{setBusy('');}
 };

 const card='bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm';
 const input='w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500';

 const status=String(sub?.status||'none');
 const rawDays=Number(sub?.daysLeft||0);
 const daysLeft=Number.isFinite(rawDays)?Math.max(0,Math.ceil(rawDays)):0;
 const renewalDue=(status==='active'||status==='grace')&&daysLeft<=3;

 const statusLine=()=>{
  if(status==='trial')return `Trial — ${daysText(daysLeft)} left`;
  if(status==='active')return `Active — renews/ends on ${localDate(sub?.periodEndMs)} — ${daysText(daysLeft)} left`;
  if(status==='grace')return `Expired — ${daysLeft} days of grace left. Renew to restore write access.`;
  if(status==='locked')return 'Subscription ended — workspace is read-only.';
  return 'No subscription clock on this workspace.';
 };

 return <div className={card}>
  <h2 className="text-base font-bold flex items-center gap-2"><CreditCard className="w-5 h-5 text-cyan-500"/> Workspace Subscription</h2>

  {loading?<div className="mt-3 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin"/>Reading the subscription clock…</div>
   :error?<div className="mt-3 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-700 dark:text-rose-300">
    <div className="font-bold flex items-center gap-2"><AlertTriangle className="w-4 h-4"/>Subscription could not be read</div>
    <div className="mt-1 break-words">{error}</div>
    <button type="button" disabled={retrying} onClick={async()=>{setRetrying(true);try{await refresh();}finally{setRetrying(false);}}} className="mt-2 px-3 py-1.5 rounded-lg bg-white/60 dark:bg-slate-900/60 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50">{retrying?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<RefreshCw className="w-3.5 h-3.5"/>}{retrying?'Retrying…':'Retry'}</button>
   </div>
   :<div className="mt-3 space-y-3">
    <p className="text-sm font-semibold">{statusLine()}</p>
    {status==='locked'&&<p dir="rtl" className="text-sm font-bold text-rose-600 dark:text-rose-400">تم توقف الاشتراك ويرجى تجديده</p>}
    {renewalDue&&<div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs font-semibold text-amber-700 dark:text-amber-300">Renewal is due in {daysText(daysLeft)}</div>}

    {owner&&<div className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 space-y-2">
     <div className="text-xs font-bold text-slate-600 dark:text-slate-300">Owner controls</div>
     {status==='none'&&<button type="button" disabled={busy!==''} onClick={()=>void startTrial()} className="px-3 py-2 rounded-xl bg-cyan-500 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-2">
      {busy==='trial'?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:null}{busy==='trial'?'Starting trial…':'Start 3-day trial'}
     </button>}
     <label className="block text-xs font-semibold">Payment reference (optional)
      <input value={reference} onChange={e=>setReference(e.target.value)} placeholder="e.g. bank transfer reference" className={input+' mt-1'} disabled={busy!==''}/>
     </label>
     <button type="button" disabled={busy!==''} onClick={()=>void renew()} className="px-3 py-2 rounded-xl bg-cyan-500 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-2">
      {busy==='renew'?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<RefreshCw className="w-3.5 h-3.5"/>}{busy==='renew'?'Renewing…':'Renew 30 days'}
     </button>
    </div>}

    <p className="text-[11px] text-slate-500 dark:text-slate-400">3-day trial → 30 days → 2-day grace → read-only. Renewing early adds 30 days to the current end date; renewing after expiry adds 30 days from the renewal date.</p>
   </div>}
 </div>;
};
