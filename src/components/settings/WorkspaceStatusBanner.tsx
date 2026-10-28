import React,{useEffect,useState} from 'react';
import {AlertTriangle,Lock}from 'lucide-react';
import {getSubscription}from'../../services/workspaceSubscription';
import {isLocalPreview}from'../../config/localPreview';

// Slim, in-flow banner shown under the header. It is informational only: the
// platform owner sees it too, because ownership still allows writes while the
// workspace itself is read-only for everybody else.
export const WorkspaceStatusBanner:React.FC=()=>{
 const[status,setStatus]=useState('');
 const[daysLeft,setDaysLeft]=useState(0);

 useEffect(()=>{
  // Preview has no cloud workspace: never ask Firebase for a clock here.
  if(isLocalPreview())return;
  let active=true;
  const load=async()=>{
   try{
    const sub=await getSubscription();
    if(!active)return;
    setStatus(String(sub?.status||'none'));
    const days=Number(sub?.daysLeft||0);
    setDaysLeft(Number.isFinite(days)?Math.max(0,Math.ceil(days)):0);
   }catch{
    // A clock we cannot read must never break the header.
    if(active)setStatus('');
   }
  };
  void load();
  const timer=window.setInterval(()=>void load(),60000);
  return()=>{active=false;window.clearInterval(timer);};
 },[]);

 if(status!=='grace'&&status!=='locked')return null;

 if(status==='locked'){
  return <div className="w-full border-b border-rose-500/30 bg-rose-500/10 px-3 sm:px-4 py-2 text-xs text-rose-700 dark:text-rose-300 flex items-center gap-2">
   <Lock className="w-3.5 h-3.5 shrink-0"/>
   <span className="font-semibold">The subscription has ended. Renew to restore write access.</span>
  </div>;
 }

 return <div className="w-full border-b border-amber-500/30 bg-amber-500/10 px-3 sm:px-4 py-2 text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2">
  <AlertTriangle className="w-3.5 h-3.5 shrink-0"/>
  <span className="font-semibold">Subscription expired — {daysLeft} {daysLeft===1?'day':'days'} of grace left. The workspace becomes read-only afterwards.</span>
 </div>;
};
