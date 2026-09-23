import React,{useEffect,useState}from'react';
import{ArrowLeft,Edit,ArrowRightLeft,LogOut,ChevronDown}from'lucide-react';
import{useApp}from'../../context/AppContext';
import{Patient,PatientStatus}from'../../types/clinical';
interface PatientFileHeaderProps{patient:Patient;onEditClick?:()=>void;readOnly?:boolean;}

export const PatientFileHeader:React.FC<PatientFileHeaderProps>=({patient,onEditClick,readOnly=false})=>{
 const{setCurrentView,getUnitById,beds,units,transferPatient,dischargePatient,updatePatient}=useApp();
 const[showTransferModal,setShowTransferModal]=useState(false),[showDischargeModal,setShowDischargeModal]=useState(false),[compact,setCompact]=useState(false);
 const[targetUnitId,setTargetUnitId]=useState(patient.unitId),[targetBedId,setTargetBedId]=useState(''),[dischargeReason,setDischargeReason]=useState('Discharged Home'),[dischargeSummary,setDischargeSummary]=useState('');
 const currentUnit=getUnitById(patient.unitId);const currentBed=beds.find(b=>b.id===patient.bedId);const availableBeds=beds.filter(b=>b.unitId===targetUnitId&&!b.patientId);

 useEffect(()=>{let frame=0;const onScroll=()=>{if(frame)return;frame=requestAnimationFrame(()=>{setCompact(window.scrollY>72);frame=0;});};onScroll();window.addEventListener('scroll',onScroll,{passive:true});return()=>{cancelAnimationFrame(frame);window.removeEventListener('scroll',onScroll);};},[]);

 const handleTransfer=(e:React.FormEvent)=>{e.preventDefault();if(!targetBedId)return;transferPatient(patient.id,targetUnitId,targetBedId);setShowTransferModal(false);};
 const handleDischarge=(e:React.FormEvent)=>{e.preventDefault();dischargePatient(patient.id,dischargeReason,dischargeSummary);setShowDischargeModal(false);};
 const handleStatusChange=(newStatus:PatientStatus)=>{if(!readOnly)updatePatient(patient.id,{status:newStatus});};
 const openTransfer=()=>{setTargetUnitId(patient.unitId);setTargetBedId('');setShowTransferModal(true);};

 return <>
  <div className="sticky z-40 w-full bg-white/96 dark:bg-[#111C2E]/96 backdrop-blur-xl border-b border-slate-200/90 dark:border-slate-800/90 shadow-sm" style={{top:'3.65rem'}}>
   <div className="max-w-7xl mx-auto w-full px-3 sm:px-6">
    <div className={`flex items-center gap-2.5 transition-[height,padding] duration-200 ease-out ${compact?'h-[4.05rem]':'h-[8.35rem] pt-3'}`}>
     <button onClick={()=>setCurrentView(readOnly?'archive':'census')} className="rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 p-2 shrink-0 transition-colors"><ArrowLeft className="w-5 h-5"/></button>
     <div className="relative shrink-0">
      {patient.photoUrl?<img src={patient.photoUrl} alt="" referrerPolicy="no-referrer" className={`rounded-xl object-cover ring-2 ring-cyan-500/40 shadow-sm transition-[width,height,border-radius] duration-200 ${compact?'w-9 h-9':'w-12 h-12 rounded-2xl'}`}/>:<div className={`rounded-xl bg-gradient-to-tr from-cyan-600 to-sky-400 text-white font-bold flex items-center justify-center shadow-sm transition-[width,height,font-size,border-radius] duration-200 ${compact?'w-9 h-9 text-sm':'w-12 h-12 rounded-2xl text-lg'}`}>{patient.fullName.charAt(0)}</div>}
      {patient.status==='Critical'&&<span className="absolute -top-1 -right-1 w-3 h-3 bg-rose-500 border-2 border-white dark:border-[#111C2E] rounded-full"/>}
     </div>
     <div className="min-w-0 flex-1">
      <div className="flex items-center gap-2 min-w-0">
       <h1 className={`font-extrabold truncate transition-[font-size] duration-200 ${compact?'text-sm':'text-lg sm:text-xl'}`}>{patient.fullName}</h1>
       {readOnly?<span className="text-[9px] font-bold px-2 py-1 rounded-full bg-amber-500/15 text-amber-600 shrink-0">READ ONLY</span>:<div className="relative shrink-0"><select value={patient.status} onChange={e=>handleStatusChange(e.target.value as PatientStatus)} className={`appearance-none text-[10px] sm:text-xs font-bold px-2.5 py-1 rounded-full border pr-6 ${patient.status==='Critical'?'bg-rose-500/15 text-rose-500 border-rose-500/40':patient.status==='Unstable'?'bg-amber-500/15 text-amber-500 border-amber-500/40':'bg-emerald-500/15 text-emerald-500 border-emerald-500/40'}`}><option>Critical</option><option>Unstable</option><option>Stable</option></select><ChevronDown className="absolute right-1.5 top-1/2 -translate-y-1/2 w-3 h-3 pointer-events-none"/></div>}
      </div>
      <div className="text-[10px] sm:text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">MRN: <b>{patient.mrn}</b> • {currentUnit?.name||'Unit'} • Bed {currentBed?.bedNumber||'Archived'} • {patient.age}y / {patient.sex}</div>
     </div>
     {!compact&&<div className="hidden sm:flex items-center gap-1.5 shrink-0"><button onClick={onEditClick} className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-[10px] font-bold"><Edit className="w-3 h-3 text-cyan-500"/>Edit</button><button onClick={openTransfer} className="flex items-center gap-1 rounded-xl bg-slate-100 dark:bg-slate-800 px-2.5 py-1.5 text-[10px] font-bold"><ArrowRightLeft className="w-3 h-3 text-sky-500"/>Transfer</button><button onClick={()=>setShowDischargeModal(true)} className="flex items-center gap-1 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-600 px-2.5 py-1.5 text-[10px] font-bold"><LogOut className="w-3 h-3"/>Discharge</button></div>}
    </div>
    {!compact&&<div className="max-w-7xl mx-auto flex items-center justify-between gap-2 pb-3 -mt-1"><div className="min-w-0 text-[10px] sm:text-xs text-slate-500 truncate"><b className="text-slate-700 dark:text-slate-300">Diagnosis:</b> {patient.primaryDiagnosis||'Not documented'}</div></div>}
   </div>
  </div>
  {showTransferModal&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"><div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl p-5 space-y-4 max-h-[calc(100vh-2rem)] overflow-y-auto"><h3 className="text-lg font-bold">Transfer {patient.fullName}</h3><form onSubmit={handleTransfer} className="space-y-4"><select value={targetUnitId} onChange={e=>{setTargetUnitId(e.target.value);setTargetBedId('')}} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border"><option value="">Select Unit</option>{units.map(u=><option key={u.id} value={u.id}>{u.name} ({u.type})</option>)}</select><select required value={targetBedId} onChange={e=>setTargetBedId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border"><option value="">Select Bed</option>{availableBeds.map(b=><option key={b.id} value={b.id}>{b.bedNumber}</option>)}</select><div className="flex justify-end gap-2"><button type="button" onClick={()=>setShowTransferModal(false)} className="px-4 py-2 text-xs">Cancel</button><button className="px-4 py-2 rounded-xl bg-sky-500 text-white text-xs font-bold">Confirm Transfer</button></div></form></div></div>}
  {showDischargeModal&&<div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"><div className="w-full max-w-md bg-white dark:bg-[#111C2E] rounded-2xl p-5 space-y-4 max-h-[calc(100vh-2rem)] overflow-y-auto"><h3 className="text-lg font-bold">Discharge & Archive Patient</h3><form onSubmit={handleDischarge} className="space-y-4"><select value={dischargeReason} onChange={e=>setDischargeReason(e.target.value)} className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border"><option>Discharged Home</option><option>Transferred to Ward</option><option>Transferred to Rehab</option><option>Deceased</option><option>Left AMA</option></select><textarea rows={4} value={dischargeSummary} onChange={e=>setDischargeSummary(e.target.value)} placeholder="Discharge clinical summary..." className="w-full px-3 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border"/><div className="flex justify-end gap-2"><button type="button" onClick={()=>setShowDischargeModal(false)} className="px-4 py-2 text-xs">Cancel</button><button className="px-4 py-2 rounded-xl bg-rose-500 text-white text-xs font-bold">Discharge to Archive</button></div></form></div></div>}
 </>;
};
