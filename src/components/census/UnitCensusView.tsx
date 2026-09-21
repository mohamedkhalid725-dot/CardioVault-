import React, { useEffect, useState } from 'react';
import { ArrowLeft, Plus, ChevronRight, BedDouble, UserPlus, LogOut, X, LockKeyhole } from 'lucide-react';
import { useApp } from '../../context/AppContext';
import { PatientStatus } from '../../types/clinical';
import { canEditClinicalData, canManageStructure, getStoredWorkspaceAccess } from '../../services/workspaceAccess';

export const UnitCensusView: React.FC = () => {
  const { currentUnitId, getUnitById, getBedsByUnit, units, beds, patients, setCurrentPatientId, setCurrentView, addBed, addPatient, setActivePatientSection, dischargePatient, showToast } = useApp();
  const [showAdmitModal,setShowAdmitModal]=useState(false);
  const [selectedBedId,setSelectedBedId]=useState<string|null>(null);
  const [dischargeTarget,setDischargeTarget]=useState<{id:string;name:string;bed:string}|null>(null);
  const [dischargeReason,setDischargeReason]=useState('Clinical Discharge');
  const [dischargeSummary,setDischargeSummary]=useState('');
  const [newPatientName,setNewPatientName]=useState('');
  const [newPatientAge,setNewPatientAge]=useState(55);
  const [newPatientSex,setNewPatientSex]=useState<'Male'|'Female'>('Male');
  const [newPatientDiagnosis,setNewPatientDiagnosis]=useState('');
  const [newPatientStatus,setNewPatientStatus]=useState<PatientStatus>('Stable');
  const [newPatientMRN,setNewPatientMRN]=useState('');

  const access=getStoredWorkspaceAccess();
  const editable=canEditClinicalData();
  const structureAdmin=canManageStructure();
  const currentUnit=currentUnitId?getUnitById(currentUnitId):null;
  const unitBeds=currentUnitId?getBedsByUnit(currentUnitId):[];

  useEffect(()=>{
    try{
      const raw=localStorage.getItem('cardiovault_beds_v2');const stored=raw?JSON.parse(raw):[];
      if(!Array.isArray(stored))return;
      const patientMap=new Map<string,any>(patients.map(p=>[p.id,p]));
      let changed=false;
      const repaired=stored.map((b:any)=>{
        if(b?.patientId){const p=patientMap.get(b.patientId);if(!p||p.isArchived){changed=true;return {...b,patientId:undefined,status:'Empty'};}}
        return b;
      });
      if(changed)localStorage.setItem('cardiovault_beds_v2',JSON.stringify(repaired));
    }catch(error){console.warn('Bed self-heal failed:',error);}
  },[patients]);

  if(!currentUnit)return <div className="p-8 text-center text-slate-400"><p>No unit selected.</p><button onClick={()=>setCurrentView('home')} className="mt-4 px-4 py-2 bg-cyan-500 text-slate-950 rounded-xl font-semibold text-sm">Return Home</button></div>;

  const handleOpenPatient=(patientId:string)=>{setCurrentPatientId(patientId);setActivePatientSection('overview');setCurrentView('patient');};
  const handleOpenAdmitModal=(bedId:string)=>{if(!editable)return;setSelectedBedId(bedId);setNewPatientName('');setNewPatientDiagnosis('');setNewPatientMRN(`MRN-${Math.floor(100000+Math.random()*900000)}`);setShowAdmitModal(true);};
  const handleAdmitSubmit=(e:React.FormEvent)=>{e.preventDefault();if(!editable||!newPatientName.trim()||!selectedBedId)return;try{const p=addPatient({fullName:newPatientName.trim(),age:newPatientAge,sex:newPatientSex,mrn:newPatientMRN,primaryDiagnosis:newPatientDiagnosis.trim()||'Acute Admission',status:newPatientStatus,unitId:currentUnit.id},selectedBedId);setShowAdmitModal(false);handleOpenPatient(p.id);}catch(error:any){showToast(String(error?.message||'Admission failed.'),'error');}};
  const openDischarge=(e:React.MouseEvent,patientId:string,name:string,bedNumber:string)=>{e.stopPropagation();if(!editable)return;setDischargeTarget({id:patientId,name,bed:bedNumber});setDischargeReason('Clinical Discharge');setDischargeSummary('');};
  const confirmDischarge=()=>{if(!editable||!dischargeTarget)return;try{dischargePatient(dischargeTarget.id,dischargeReason,dischargeSummary);setDischargeTarget(null);setCurrentView('census');showToast(`${dischargeTarget.name} discharged. ${dischargeTarget.bed} is now available.`,'success');}catch(error:any){showToast(String(error?.message||'Discharge failed.'),'error');}};
  const getStatusBadge=(status:PatientStatus)=>{const styles=status==='Critical'?'bg-rose-500/15 text-rose-500 border-rose-500/30':status==='Unstable'?'bg-amber-500/15 text-amber-500 border-amber-500/30':'bg-emerald-500/15 text-emerald-500 border-emerald-500/30';return <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[9px] font-semibold border ${styles}`}><span className="w-1.5 h-1.5 rounded-full bg-current"/>{status}</span>;};

  return <div className="max-w-5xl mx-auto px-4 py-6 space-y-5 animate-in fade-in duration-200">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3"><button onClick={()=>setCurrentView('home')} className="p-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700"><ArrowLeft className="w-5 h-5"/></button><div><h1 className="text-2xl font-bold text-slate-900 dark:text-white">{currentUnit.name}</h1><p className="text-xs text-slate-500 dark:text-slate-400">{unitBeds.length} Beds • {currentUnit.type}{access?.role!=='owner'&&access?.unitName?` • Access: ${access.unitName}`:''}</p></div></div>
      {structureAdmin?<button onClick={()=>addBed(currentUnit.id)} className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 border border-cyan-500/30 text-xs font-bold"><Plus className="w-4 h-4"/> Add Bed</button>:<div className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 text-[11px] font-semibold"><LockKeyhole className="w-3.5 h-3.5"/> Beds managed by Owner</div>}
    </div>

    <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] overflow-hidden shadow-sm">
      <div className="hidden md:grid grid-cols-[90px_1.5fr_1.4fr_120px_210px] gap-3 px-5 py-3 bg-slate-50 dark:bg-slate-900/70 text-[10px] font-bold uppercase tracking-wider text-slate-400"><span>Bed</span><span>Patient</span><span>Diagnosis</span><span>Status</span><span>Actions</span></div>
      {unitBeds.map(bed=>{
        const patient=bed.patientId?patients.find(p=>p.id===bed.patientId&&!p.isArchived):null;
        return <div key={bed.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] md:grid-cols-[90px_1.5fr_1.4fr_120px_210px] gap-2 md:gap-3 md:items-center px-3 md:px-5 py-2 md:py-3 border-t border-slate-100 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-900/40">
          <div className="flex items-center gap-2 min-w-[66px]"><div className={`w-8 h-8 rounded-lg flex items-center justify-center ${patient?'bg-cyan-500/10 text-cyan-500':'bg-slate-200/60 dark:bg-slate-800 text-slate-400'}`}><BedDouble className="w-4 h-4"/></div><div><span className="text-[11px] font-bold text-slate-700 dark:text-slate-300">{bed.bedNumber}</span><div className="text-[8px] text-slate-400">Bed</div></div></div>
          {patient ? <>
            <button onClick={()=>handleOpenPatient(patient.id)} className="text-left min-w-0 overflow-hidden">
              <div className="flex items-center gap-1.5 min-w-0"><div className="text-xs font-bold text-slate-900 dark:text-white truncate">{patient.fullName}</div>{getStatusBadge(patient.status)}</div>
              <div className="text-[9px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{patient.mrn} • {patient.primaryDiagnosis||'—'}</div>
            </button>
            <div className="hidden md:block text-xs text-slate-600 dark:text-slate-300 truncate">{patient.primaryDiagnosis||'—'}</div>
            <div className="hidden md:block">{getStatusBadge(patient.status)}</div>
            <div className="flex items-center gap-1 md:gap-2">
              <button onClick={()=>handleOpenPatient(patient.id)} title="View" className="inline-flex items-center justify-center gap-1 px-2 md:px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-[10px] md:text-xs font-bold"><ChevronRight className="w-3.5 h-3.5"/><span className="hidden sm:inline">View</span></button>
              {editable&&<button onClick={e=>openDischarge(e,patient.id,patient.fullName,bed.bedNumber)} title="Discharge" className="inline-flex items-center justify-center gap-1 px-2 md:px-3 py-1.5 rounded-lg border border-rose-500/40 text-rose-500 text-[10px] md:text-xs font-bold"><LogOut className="w-3.5 h-3.5"/><span className="hidden sm:inline">Discharge</span></button>}
            </div>
          </> : <>
            <div className="min-w-0"><div className="text-xs font-semibold text-slate-400">Empty Bed</div><div className="text-[9px] text-slate-400/80 truncate">Available for immediate admission</div></div>
            <div className="hidden md:block md:col-span-2"></div>
            {editable&&<button type="button" onClick={()=>handleOpenAdmitModal(bed.id)} className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 rounded-lg bg-cyan-500 text-slate-950 font-bold text-[10px]"><UserPlus className="w-3.5 h-3.5"/><span className="hidden sm:inline">Admit</span></button>}
          </>}
        </div>;
      })}
    </div>

    {showAdmitModal&&editable&&<div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"><div className="w-full max-w-lg bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl"><h3 className="text-lg font-bold">Admit Patient to {currentUnit.name}</h3><form onSubmit={handleAdmitSubmit} className="space-y-4 mt-5"><input required value={newPatientName} onChange={e=>setNewPatientName(e.target.value)} placeholder="Patient Full Name" className={input}/><div className="grid grid-cols-2 gap-3"><input value={newPatientMRN} onChange={e=>setNewPatientMRN(e.target.value)} placeholder="MRN" className={input}/><input type="number" value={newPatientAge} onChange={e=>setNewPatientAge(parseInt(e.target.value)||0)} placeholder="Age" className={input}/></div><div className="grid grid-cols-2 gap-3"><select value={newPatientSex} onChange={e=>setNewPatientSex(e.target.value as any)} className={input}><option>Male</option><option>Female</option><option>Other</option></select><select value={newPatientStatus} onChange={e=>setNewPatientStatus(e.target.value as PatientStatus)} className={input}><option>Stable</option><option>Unstable</option><option>Critical</option></select></div><input required value={newPatientDiagnosis} onChange={e=>setNewPatientDiagnosis(e.target.value)} placeholder="Primary Diagnosis" className={input}/><div className="flex justify-end gap-2"><button type="button" onClick={()=>setShowAdmitModal(false)} className="px-4 py-2 text-xs">Cancel</button><button type="submit" className="px-5 py-2.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">Complete Admission</button></div></form></div></div>}
    {dischargeTarget&&editable&&<div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"><div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl border border-rose-200 dark:border-rose-900/40 p-6 shadow-2xl"><div className="flex items-start justify-between"><div><h3 className="text-lg font-bold">Discharge Patient</h3><p className="text-xs text-slate-500 mt-1">Are you sure you want to discharge <strong>{dischargeTarget.name}</strong> from {dischargeTarget.bed}?</p></div><button onClick={()=>setDischargeTarget(null)}><X className="w-4 h-4"/></button></div><div className="space-y-3 mt-5"><select value={dischargeReason} onChange={e=>setDischargeReason(e.target.value)} className={input}><option>Clinical Discharge</option><option>Transfer</option><option>Patient Improved</option><option>Against Medical Advice</option><option>Death</option></select><textarea value={dischargeSummary} onChange={e=>setDischargeSummary(e.target.value)} rows={4} placeholder="Optional discharge summary..." className={input}/></div><div className="flex justify-end gap-2 mt-5"><button onClick={()=>setDischargeTarget(null)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">Cancel</button><button onClick={confirmDischarge} className="px-5 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold"><LogOut className="inline w-3.5 h-3.5 mr-1"/>Discharge</button></div></div></div>}
  </div>;
};
const input='w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-slate-900 dark:text-white';
