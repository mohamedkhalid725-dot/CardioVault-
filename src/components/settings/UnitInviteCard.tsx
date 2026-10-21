import React,{useEffect,useState} from 'react';
import {Ticket,Copy,Check,Loader2,Ban,CalendarClock}from 'lucide-react';
import {useApp}from'../../context/AppContext';
import {getMyUnits,isMasterAccount}from'../../services/workspaceAccess';
import {createUnitInvite,listMyUnitInvites,revokeUnitInvite}from'../../services/unitInvites';

type InviteRole='clinical_editor'|'view_only';
type InviteClinicalRole='nurse'|'resident'|'specialist'|'consultant';

const ACCESS_LEVELS:Array<[InviteRole,string]>=[[ 'clinical_editor','Can edit clinical data'],['view_only','Read only']];
const CLINICAL_TITLES:Array<[InviteClinicalRole,string]>=[[ 'resident','Resident'],[ 'specialist','Specialist'],[ 'nurse','Nurse'],['consultant','Consultant']];
const EXPIRY_OPTIONS:Array<[number,string]>=[[24,'24 hours'],[48,'48 hours'],[168,'7 days'],[720,'30 days']];

const roleLabel=(role:string)=>role==='view_only'?'Read only':'Can edit clinical data';
const titleLabel=(role:string)=>role==='nurse'?'Nurse':role==='specialist'?'Specialist':role==='consultant'?'Consultant':'Resident';
const localDate=(ms:any)=>{const value=Number(ms||0);return value>0?new Date(value).toLocaleString():'—';};
const countdown=(ms:number)=>{
 if(!Number.isFinite(ms)||ms<=0)return 'Expired';
 const minutes=Math.floor(ms/60000);
 const days=Math.floor(minutes/1440);
 const hours=Math.floor((minutes%1440)/60);
 const left=minutes%60;
 if(days>0)return `${days}d ${hours}h left`;
 if(hours>0)return `${hours}h ${left}m left`;
 return `${Math.max(1,left)}m left`;
};

// Temporary invite codes for the units the signed-in member already belongs to.
// The unit list comes from the service (never the whole units collection) and a
// consultant invite is impossible while the unit already has its consultant.
export const UnitInviteCard:React.FC=()=>{
 const{showToast}=useApp();
 const[units,setUnits]=useState<any[]>([]);
 const[loadingUnits,setLoadingUnits]=useState(true);
 const[unitId,setUnitId]=useState('');
 const[role,setRole]=useState<InviteRole>('clinical_editor');
 const[clinicalRole,setClinicalRole]=useState<InviteClinicalRole>('resident');
 const[expiresInHours,setExpiresInHours]=useState(24);
 const[creating,setCreating]=useState(false);
 const[created,setCreated]=useState<any|null>(null);
 const[copied,setCopied]=useState(false);
 const[invites,setInvites]=useState<any[]>([]);
 const[loadingInvites,setLoadingInvites]=useState(false);
 const[revokingId,setRevokingId]=useState('');
 const[now,setNow]=useState(Date.now());

 const selectedUnit=units.find(unit=>String(unit?.id)===unitId)||null;
 const consultantTaken=!!String(selectedUnit?.consultantUid||'');

 useEffect(()=>{let active=true;(async()=>{
  try{
   // The platform owner holds no unit membership, so unit invites are not his
   // tool (he provisions workspaces and access codes). getMyUnits() lists every
   // unit for him, which would otherwise expose a card that can never succeed.
   if(await isMasterAccount()){if(active)setUnits([]);return;}
   const list=await getMyUnits();
   if(!active)return;
   const safeList=Array.isArray(list)?list:[];
   setUnits(safeList);
   if(safeList.length)setUnitId(String(safeList[0]?.id||''));
  }catch(error:any){
   if(active){setUnits([]);showToast(String(error?.message||'Could not load your units.'),'error');}
  }finally{
   if(active)setLoadingUnits(false);
  }
 })();return()=>{active=false;};},[]);

 const refreshInvites=async()=>{
  setLoadingInvites(true);
  try{const list=await listMyUnitInvites();setInvites(Array.isArray(list)?list:[]);}
  catch(error:any){showToast(String(error?.message||'Could not load your invites.'),'error');}
  finally{setLoadingInvites(false);}
 };

 useEffect(()=>{
  if(!units.length)return;
  void refreshInvites();
  const timer=window.setInterval(()=>setNow(Date.now()),30000);
  return()=>window.clearInterval(timer);
 }, [units.length]);

 const selectUnit=(nextId:string)=>{
  setUnitId(nextId);
  const unit=units.find(item=>String(item?.id)===nextId);
  if(clinicalRole==='consultant'&&String(unit?.consultantUid||''))setClinicalRole('resident');
 };

 const create=async()=>{
  if(!selectedUnit){showToast('Select a unit first.','error');return;}
  if(clinicalRole==='consultant'&&consultantTaken){showToast('This unit already has a consultant.','error');return;}
  setCreating(true);setCopied(false);
  try{
   const invite=await createUnitInvite({unitId:String(selectedUnit.id),unitName:String(selectedUnit.name||'Unit'),role,clinicalRole,expiresInHours});
   setCreated(invite);
   await refreshInvites();
   showToast('Invite code created.','success');
  }catch(error:any){
   showToast(String(error?.message||'Could not create the invite code.'),'error');
  }finally{setCreating(false);}
 };

 const copy=async(value:string)=>{
  try{await navigator.clipboard.writeText(value);setCopied(true);showToast('Invite code copied.','success');}
  catch{showToast(value,'info');}
 };

 const revoke=async(inviteId:string)=>{
  if(!window.confirm('Revoke this invite code? Anyone holding it will no longer be able to join.'))return;
  setRevokingId(inviteId);
  try{await revokeUnitInvite(inviteId);setInvites(current=>current.filter(item=>String(item?.inviteId)!==inviteId));showToast('Invite revoked.','success');}
  catch(error:any){showToast(String(error?.message||'Could not revoke the invite.'),'error');}
  finally{setRevokingId('');}
 };

 if(loadingUnits)return null;
 if(!units.length)return null;

 const card='bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm';
 const select='w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500';
 const activeInvites=invites.filter(invite=>{
  if(!invite)return false;
  if(invite.used||invite.revoked)return false;
  return Number(invite.expiresAtMs||0)>now;
 });

 return <div className={card}>
  <div>
   <h2 className="text-base font-bold flex items-center gap-2"><Ticket className="w-5 h-5 text-cyan-500"/> Unit Invites — temporary codes</h2>
   <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Invite a colleague into one of your units for a limited time. Each code works once and expires on its own.</p>
  </div>

  <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
   <label className="text-xs font-semibold">Unit
    <select value={unitId} onChange={e=>selectUnit(e.target.value)} className={select+' mt-1'}>
     {units.map(unit=><option key={String(unit?.id)} value={String(unit?.id)}>{String(unit?.name||'Unit')}</option>)}
    </select>
   </label>
   <label className="text-xs font-semibold">Access level
    <select value={role} onChange={e=>setRole(e.target.value as InviteRole)} className={select+' mt-1'}>
     {ACCESS_LEVELS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select>
   </label>
   <label className="text-xs font-semibold">Clinical title
    <select value={clinicalRole} onChange={e=>setClinicalRole(e.target.value as InviteClinicalRole)} className={select+' mt-1'}>
     {CLINICAL_TITLES.map(([value,label])=><option key={value} value={value} disabled={value==='consultant'&&consultantTaken}>{label}</option>)}
    </select>
   </label>
   <label className="text-xs font-semibold">Expires in
    <select value={expiresInHours} onChange={e=>setExpiresInHours(Number(e.target.value))} className={select+' mt-1'}>
     {EXPIRY_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}
    </select>
   </label>
  </div>

  {consultantTaken&&<p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400">This unit already has a consultant.</p>}

  <button type="button" disabled={creating||!unitId} onClick={()=>void create()} className="mt-4 px-4 py-2 rounded-xl bg-cyan-500 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-2">
   {creating?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<Ticket className="w-3.5 h-3.5"/>}{creating?'Creating invite…':'Create invite'}
  </button>

  {created?.code&&<div className="mt-4 rounded-xl border border-cyan-500/30 bg-cyan-500/5 p-3">
   <div className="text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">Invite code</div>
   <div className="mt-2 flex items-center gap-2">
    <code className="flex-1 px-3 py-2 rounded-lg bg-white dark:bg-slate-900 font-mono text-base font-bold tracking-wider break-all">{String(created.code)}</code>
    <button type="button" onClick={()=>void copy(String(created.code))} className="p-2 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center gap-1 text-xs font-bold">
     {copied?<Check className="w-4 h-4"/>:<Copy className="w-4 h-4"/>}{copied?'Copied':'Copy'}
    </button>
   </div>
   <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">Expires {localDate(created.expiresAtMs)} · {titleLabel(String(created.clinicalRole||clinicalRole))} · {roleLabel(String(created.role||role))}</p>
  </div>}

  <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-800">
   <h3 className="text-sm font-bold flex items-center gap-2"><CalendarClock className="w-4 h-4 text-cyan-500"/> My active invites</h3>
   {loadingInvites?<div className="mt-2 flex items-center gap-2 text-xs text-slate-500"><Loader2 className="w-3.5 h-3.5 animate-spin"/>Loading invites…</div>
    :activeInvites.length===0?<p className="mt-2 text-xs text-slate-500 dark:text-slate-400">No active invites. Codes you create appear here until they are used, revoked or expire.</p>
    :<div className="mt-3 space-y-2">{activeInvites.map(invite=>{
     const id=String(invite?.inviteId||'');
     const busyRow=revokingId===id;
     return <div key={id} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
      <div className="min-w-0">
       <div className="text-sm font-bold truncate">{String(invite?.unitName||'Unit')}</div>
       <div className="text-[11px] text-slate-500 dark:text-slate-400">{titleLabel(String(invite?.clinicalRole||'resident'))} · {roleLabel(String(invite?.role||'clinical_editor'))}</div>
       <div className="text-[11px] text-slate-500 dark:text-slate-400">Expires {localDate(invite?.expiresAtMs)} · <span className="text-amber-600 dark:text-amber-400">{countdown(Number(invite?.expiresAtMs||0)-now)}</span></div>
      </div>
      <button type="button" disabled={busyRow} onClick={()=>void revoke(id)} className="px-3 py-2 rounded-lg bg-rose-500/10 text-rose-500 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 shrink-0">
       {busyRow?<Loader2 className="w-3.5 h-3.5 animate-spin"/>:<Ban className="w-3.5 h-3.5"/>}{busyRow?'Revoking…':'Revoke'}
      </button>
     </div>;
    })}</div>}
  </div>
 </div>;
};
