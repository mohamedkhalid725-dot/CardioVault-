import React,{useEffect,useState} from 'react';
import {KeyRound,ShieldCheck,ArrowRight,Loader2} from 'lucide-react';
import {redeemUnitAccessCode,isMasterAccount,ensureOwnerWorkspace,setStoredWorkspaceAccess,getOwnTeamProfile,setOwnClinicalProfile,validateCurrentWorkspaceAccess,getUnitById,claimUnitConsultant,SelfClinicalRole} from '../../services/workspaceAccess';
import {isValidInviteCode,redeemUnitInvite} from '../../services/unitInvites';
import {CardioLogo} from '../CardioLogo';
import {useApp} from '../../context/AppContext';

// 'consultant' is a UI choice only: it maps to the unit's single consultant
// slot, never to the member's own clinical title (selfClinicalRole in the rules
// accepts nurse/resident/specialist only).
type RoleChoice = SelfClinicalRole | 'consultant';

const FRIENDLY_ERROR='Access code could not be verified. Check the code and try again.';

export const UnitAccessGate:React.FC=()=>{
 const{logout,showToast}=useApp();
 const[code,setCode]=useState('');const[busy,setBusy]=useState(false);const[checking,setChecking]=useState(true);const[error,setError]=useState('');const[rolePicker,setRolePicker]=useState(false);const[selectedRole,setSelectedRole]=useState<RoleChoice>('resident');const[name,setName]=useState('');
 const[consultantUid,setConsultantUid]=useState('');
 const[joinedUnitId,setJoinedUnitId]=useState('');
 useEffect(()=>{let active=true;let attempts=0;const check=async()=>{try{if(await isMasterAccount()){const owner=await ensureOwnerWorkspace();if(owner&&active){setChecking(false);window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));}return;}const profile=await getOwnTeamProfile();if(!active)return;setName(String(profile?.name||''));const valid=await validateCurrentWorkspaceAccess();if(valid===true){setChecking(false);window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));return;}setStoredWorkspaceAccess(null);setChecking(false);setRolePicker(false);return;}catch(error){console.warn('Workspace access gate check failed:',error);}attempts+=1;if(attempts>=8&&active)setChecking(false);else window.setTimeout(()=>void check(),750);};void check();return()=>{active=false;};},[]);

 // One input accepts both code families. An old Unit Access Code is tried
 // first; a temporary invite code makes that lookup fail with "Invalid or
 // inactive Unit Access Code.", so the invite probe must run afterwards rather
 // than treating the first failure as final.
 const resolveAccess=async(rawCode:string,track:{invite:boolean}):Promise<any>=>{
  try{
   return await redeemUnitAccessCode(rawCode);
  }catch(codeError){
   let inviteLooksValid=false;
   try{inviteLooksValid=await isValidInviteCode(rawCode);}catch(probeError){console.warn('Invite code probe failed:',probeError);}
   if(!inviteLooksValid)throw codeError;
   // Marked before the call so a redemption failure is reported with the
   // service's own message instead of the generic old-code message.
   track.invite=true;
   return await redeemUnitInvite(rawCode);
  }
 };

 const submit=async(e:React.FormEvent)=>{e.preventDefault();setError('');setBusy(true);const rawCode=code.trim();const track={invite:false};try{const access=await resolveAccess(rawCode,track);showToast(`Access granted: ${access.unitName||'Unit'}`,'success');
  // The consultant slot gates the option below, so read the unit right after the join.
  let unit:any=null;
  if(access.unitId){try{unit=await getUnitById(access.unitId);}catch(unitError){console.warn('Unit lookup after join failed:',unitError);}}
  const takenUid=String(unit?.consultantUid||'');
  setConsultantUid(takenUid);
  setJoinedUnitId(String(access.unitId||''));
  const profile=await getOwnTeamProfile();
  if(!profile?.roleSelectedAt){
   const savedRole=String(profile?.role||'');
   const initial:SelfClinicalRole=savedRole==='nurse'||savedRole==='specialist'||savedRole==='resident'?(savedRole as SelfClinicalRole):'resident';
   setSelectedRole(initial);
   setName(String(profile?.name||''));
   setRolePicker(true);setChecking(false);
  }else{window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));window.location.reload();}
 }catch(err:any){
  // Errors from the invite path are already specific (used, expired, revoked);
  // a failed old-code lookup keeps the original friendly message.
  const rawMessage=String(err?.message||'');
  const message=track.invite&&rawMessage?rawMessage:FRIENDLY_ERROR;
  setError(message);showToast(message,'error');
 }finally{setBusy(false);}};

 const saveClinicalRole=async()=>{setBusy(true);setError('');try{
  // setOwnClinicalProfile accepts nurse/resident/specialist only. A Consultant
  // pick is stored as Specialist and then claims the unit's consultant seat,
  // which is where consultant status actually lives.
  const wantsConsultant=selectedRole==='consultant';
  const storedRole:SelfClinicalRole=wantsConsultant?'specialist':selectedRole;
  await setOwnClinicalProfile(name,storedRole);
  if(wantsConsultant&&joinedUnitId){
   try{
    await claimUnitConsultant(joinedUnitId);
   }catch(claimError:any){
    showToast(String(claimError?.message||'Your profile was saved as Specialist, but the consultant seat could not be claimed.'),'error');
    setRolePicker(false);window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));window.location.reload();return;
   }
  }
  showToast(wantsConsultant?'Profile saved. You are this unit’s consultant.':'Profile saved successfully.','success');
  setRolePicker(false);window.dispatchEvent(new CustomEvent('cardiovault-workspace-access-granted'));window.location.reload();
 }catch(err:any){const message='Could not save your clinical role. Please try again.';setError(message);showToast(message,'error');}finally{setBusy(false);}};

 const consultantSlotFree=!consultantUid;
 const roleOptions:Array<[RoleChoice,string]>=([['resident','Resident Doctor'],['specialist','Specialist'],...(consultantSlotFree?[['consultant','Consultant'] as [RoleChoice,string]]:[]),['nurse','Nurse']]);
 return <div className="min-h-screen bg-[#070B13] flex items-center justify-center p-4 text-slate-100"><div className="w-full max-w-md bg-[#0F172A] border border-slate-800 rounded-3xl p-7 shadow-2xl text-center"><CardioLogo size="lg" showText={false}/><h1 className="text-2xl font-extrabold mt-4">Workspace Access</h1>{checking?<div className="mt-6 flex items-center justify-center gap-2 text-sm text-slate-400"><Loader2 className="w-4 h-4 animate-spin"/>Checking your CardioVault workspace…</div>:rolePicker?<div className="mt-5 text-left space-y-4"><div><div className="text-xs text-cyan-400 font-bold uppercase tracking-wider">First-time setup</div><h2 className="text-xl font-black mt-1">What is your clinical role?</h2><p className="text-xs text-slate-400 mt-1">Choose your professional role. Department Admin is managed only by the workspace owner.</p></div><div><label className="text-xs font-bold text-slate-300">Your name</label><input value={name} onChange={e=>setName(e.target.value)} placeholder="Enter your name" className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-3 text-sm outline-none focus:border-cyan-500"/></div><div className="grid grid-cols-2 gap-2">{roleOptions.map(([value,label])=><button key={value} type="button" onClick={()=>setSelectedRole(value)} className={`p-3 rounded-xl border text-left text-sm font-bold ${selectedRole===value?'border-cyan-500 bg-cyan-500/10 text-cyan-300':'border-slate-700 bg-slate-900 text-slate-200'}`}>{label}</button>)}</div>{!consultantSlotFree&&<p className="text-[11px] text-amber-300/90">This unit already has a consultant.</p>}{selectedRole==='consultant'&&<p className="text-[11px] text-slate-400">Consultant status is held by the unit's consultant slot. Choosing Consultant claims that seat for you.</p>}{error&&<div className="rounded-xl border border-rose-900/60 bg-rose-950/20 p-3 text-left text-xs text-rose-300 whitespace-pre-wrap break-words font-mono">{error}</div>}<button type="button" disabled={busy||!name.trim()} onClick={()=>void saveClinicalRole()} className="w-full py-3 rounded-xl bg-cyan-500 text-slate-950 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2">{busy?<Loader2 className="w-4 h-4 animate-spin"/>:null}{busy?'Saving…':'Continue to CardioVault'}</button><button type="button" onClick={logout} className="w-full text-xs text-slate-500 hover:text-white">Sign out</button></div>:<><p className="text-xs text-slate-400 mt-2">This account is not assigned to a workspace. Enter the Unit Access Code provided by the workspace owner.</p><div className="mt-5 rounded-2xl border border-cyan-900/60 bg-cyan-950/20 p-4 text-left"><div className="flex items-center gap-2 text-cyan-300 text-xs font-bold"><ShieldCheck className="w-4 h-4"/> Unit-scoped access</div><p className="text-[11px] text-slate-400 mt-1">Only the unit attached to this code will be visible.</p></div><form onSubmit={submit} className="mt-5 space-y-3"><label className="block text-left text-xs font-semibold text-slate-300">Unit Access Code or Invite Code<input autoFocus value={code} onChange={e=>setCode(e.target.value.toUpperCase())} placeholder="CV-XXXX-XXXX-XX" className="mt-1 w-full rounded-xl bg-slate-900 border border-slate-700 px-3 py-3 text-center tracking-[0.18em] font-mono text-sm outline-none focus:border-cyan-500"/></label><p className="text-[11px] text-left text-slate-500">If you created this workspace, ask a colleague for a temporary invite code — creating a workspace does not grant clinical access.</p>{error&&<p className="text-xs text-rose-400 text-left">{error}</p>}<button disabled={busy||code.trim().length<6} className="w-full py-3 rounded-xl bg-cyan-500 text-slate-950 font-bold text-sm disabled:opacity-50 flex items-center justify-center gap-2"><KeyRound className="w-4 h-4"/>{busy?<><Loader2 className="w-4 h-4 animate-spin"/>Verifying…</>:'Access Unit'}<ArrowRight className="w-4 h-4"/></button></form><button type="button" onClick={logout} className="mt-4 text-xs text-slate-500 hover:text-white">Sign out</button></>}</div></div>;
};
