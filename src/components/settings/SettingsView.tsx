import React,{useState} from 'react';
import { Settings, Shield, Moon, Sun, Lock, Database, RefreshCw, User, Download, Building2, BedDouble } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { StorageService } from '../../services/storage';
import { UnitManagementModalV2 } from '../units/UnitManagementModalV2';
import { BedManagementModal } from '../units/BedManagementModal';

export const SettingsView:React.FC=()=>{
 const{theme,toggleTheme,auth,lockApp,resetDatabase,showToast}=useApp();
 const[showUnits,setShowUnits]=useState(false),[showBeds,setShowBeds]=useState(false);
 const[doctorName,setDoctorName]=useState(auth.userName),[doctorEmail,setDoctorEmail]=useState(auth.userEmail),[newPin,setNewPin]=useState(''),[confirmPin,setConfirmPin]=useState('');
 const updateProfile=(e:React.FormEvent)=>{e.preventDefault();StorageService.saveAuth({userName:doctorName,userEmail:doctorEmail});showToast('Clinician profile updated.','success');};
 const updatePin=(e:React.FormEvent)=>{
   e.preventDefault();
   const cleanPin=newPin.replace(/\D/g,'').slice(0,4),cleanConfirm=confirmPin.replace(/\D/g,'').slice(0,4);
   if(cleanPin.length!==4){showToast('PIN must be exactly 4 digits.','error');return;}
   if(cleanPin!==cleanConfirm){showToast('PIN confirmation does not match.','error');return;}
   StorageService.saveAuth({pinCode:cleanPin});
   setNewPin('');setConfirmPin('');
   showToast('Security PIN updated successfully.','success');
   window.setTimeout(()=>window.location.reload(),250);
 };
 const backup=()=>{const data={units:StorageService.getUnits(),beds:StorageService.getBeds(),patients:StorageService.getPatients(),timestamp:new Date().toISOString()};const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=`cardiovault_backup_${new Date().toISOString().split('T')[0]}.json`;a.click();window.setTimeout(()=>URL.revokeObjectURL(url),1000);showToast('Clinical database exported.','success');};
 const card='bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm';
 const input='w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500 touch-manipulation';
 return <div className="max-w-4xl mx-auto px-4 py-6 pb-28 space-y-6 animate-in fade-in duration-150">
   <div><h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Settings className="w-6 h-6 text-cyan-500"/> System Settings & Security</h1><p className="text-xs text-slate-500 dark:text-slate-400">Physician profile, privacy, appearance, data persistence and clinical units.</p></div>
   <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
     <div className={card}><h2 className="text-sm font-bold mb-4 flex items-center gap-2"><User className="w-4 h-4 text-cyan-500"/> Clinician Profile</h2><form onSubmit={updateProfile} className="space-y-3"><label className="text-xs font-semibold">Full Name & Title<input type="text" value={doctorName} onChange={e=>setDoctorName(e.target.value)} className={input+' mt-1'} /></label><label className="text-xs font-semibold">Email<input type="email" value={doctorEmail} onChange={e=>setDoctorEmail(e.target.value)} className={input+' mt-1'} /></label><button type="submit" className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">Update Profile</button></form></div>
     <div className={card}><h2 className="text-sm font-bold mb-4 flex items-center gap-2"><Shield className="w-4 h-4 text-emerald-500"/> Security PIN</h2><form onSubmit={updatePin} className="space-y-3"><div className="grid grid-cols-2 gap-2"><div><label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">New PIN</label><input type="text" inputMode="numeric" autoComplete="new-password" maxLength={4} placeholder="••••" value={newPin} onChange={e=>setNewPin(e.target.value.replace(/\D/g,'').slice(0,4))} className={input+' text-center tracking-[0.45em]'} /></div><div><label className="block text-[11px] text-slate-500 dark:text-slate-400 mb-1">Confirm PIN</label><input type="text" inputMode="numeric" autoComplete="new-password" maxLength={4} placeholder="••••" value={confirmPin} onChange={e=>setConfirmPin(e.target.value.replace(/\D/g,'').slice(0,4))} className={input+' text-center tracking-[0.45em]'} /></div></div><div className="flex flex-wrap gap-2"><button type="submit" className="px-4 py-2 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-white text-xs font-bold touch-manipulation">Confirm PIN</button><button type="button" onClick={lockApp} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold touch-manipulation"><Lock className="inline w-3.5 h-3.5"/> Lock Screen</button></div><p className="text-[10px] text-slate-500 dark:text-slate-400">Enter 4 digits in both fields, then press Confirm PIN.</p></form></div>
     <div className={card}><h2 className="text-sm font-bold mb-3 flex items-center gap-2">{theme==='dark'?<Sun className="w-4 h-4 text-amber-400"/>:<Moon className="w-4 h-4 text-indigo-500"/>} Visual Theme</h2><button type="button" onClick={toggleTheme} className="px-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold touch-manipulation">{theme==='dark'?'Switch to Light Mode':'Switch to Dark Mode'}</button></div>
     <div className={card}><h2 className="text-sm font-bold mb-3 flex items-center gap-2"><Database className="w-4 h-4 text-cyan-500"/> Database & Backup</h2><div className="flex flex-wrap gap-2"><button type="button" onClick={backup} className="px-3 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold"><Download className="inline w-3.5 h-3.5"/> Export Backup</button><button type="button" onClick={()=>{if(window.confirm('Reset database to the standard clinical sample?'))resetDatabase();}} className="px-3 py-2 rounded-xl bg-rose-500/10 text-rose-500 border border-rose-500/30 text-xs font-semibold"><RefreshCw className="inline w-3.5 h-3.5"/> Reset Sample</button></div></div>
   </div>
   <div className={card}><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="text-base font-bold flex items-center gap-2"><Building2 className="w-5 h-5 text-cyan-500"/> Unit Management</h2><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Add, rename or safely delete clinical units.</p></div><button type="button" onClick={()=>setShowUnits(true)} className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">Manage Units</button></div></div>
   <div className={card}><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="text-base font-bold flex items-center gap-2"><BedDouble className="w-5 h-5 text-cyan-500"/> Bed Management</h2><p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Add beds or remove empty beds from any clinical unit.</p></div><button type="button" onClick={()=>setShowBeds(true)} className="px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">Manage Beds</button></div></div>
   <UnitManagementModalV2 isOpen={showUnits} onClose={()=>setShowUnits(false)}/><BedManagementModal isOpen={showBeds} onClose={()=>setShowBeds(false)}/>
 </div>;
};
