import React,{useState} from 'react';
import {Camera,CheckCircle2,FileSearch,Loader2,TriangleAlert,X} from 'lucide-react';
import {LabResult,Patient} from '../../../types/clinical';
import {uploadClinicalMedia} from '../../../services/mediaStorage';

interface Props { patient:Patient; onClose:()=>void; onConfirm:(results:LabResult[])=>void; }

interface ExtractedTest {
  testName:string; value:string|number; unit:string; referenceRange:string;
  status:'normal'|'low'|'high'|'critical'|'unknown'; confidence:'low'|'moderate'|'high';
}

const readFileAsDataUrl=(file:File)=>new Promise<string>((resolve,reject)=>{
  const reader=new FileReader(); reader.onload=()=>resolve(String(reader.result||'')); reader.onerror=()=>reject(new Error('Unable to read the report image.')); reader.readAsDataURL(file);
});

export const LabReportScanner:React.FC<Props>=({patient,onClose,onConfirm})=>{
  const [file,setFile]=useState<File|null>(null);
  const [preview,setPreview]=useState('');
  const [scanning,setScanning]=useState(false);
  const [saving,setSaving]=useState(false);
  const [panel,setPanel]=useState('');
  const [reportPatientName,setReportPatientName]=useState('');
  const [reportDate,setReportDate]=useState('');
  const [warnings,setWarnings]=useState<string[]>([]);
  const [tests,setTests]=useState<ExtractedTest[]>([]);
  const [error,setError]=useState('');

  const selectFile=async(f:File|null)=>{
    if(!f)return;
    if(!f.type.startsWith('image/')){setError('Please select an image of the laboratory report.');return;}
    if(f.size>10*1024*1024){setError('Report image is too large. Maximum size is 10 MB.');return;}
    setFile(f); setPreview(URL.createObjectURL(f)); setError(''); setTests([]);
  };

  const scan=async()=>{
    if(!file)return;
    setScanning(true);setError('');
    try{
      const imageBase64=await readFileAsDataUrl(file);
      const response=await fetch('/api/ai/scan-lab',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({imageBase64,patientName:patient.fullName})});
      const data=await response.json();
      if(!response.ok)throw new Error(String(data?.error||'Laboratory scan failed.'));
      setPanel(String(data?.panel||'Custom Lab'));
      setReportPatientName(String(data?.patientName||''));
      setReportDate(String(data?.reportDate||''));
      setWarnings(Array.isArray(data?.warnings)?data.warnings.map(String):[]);
      setTests(Array.isArray(data?.tests)?data.tests:[]);
    }catch(e:any){setError(String(e?.message||'Laboratory scan failed.'));}finally{setScanning(false);}
  };

  const update=(index:number,key:keyof ExtractedTest,value:any)=>setTests(prev=>prev.map((t,i)=>i===index?{...t,[key]:value}:t));

  const confirm=async()=>{
    if(!file||!tests.length)return;
    setSaving(true);setError('');
    try{
      const idBase=Date.now();
      const extension=file.type.includes('png')?'png':file.type.includes('webp')?'webp':'jpg';
      const path=`patients/${patient.id}/lab-reports/lab-report-${idBase}.${extension}`;
      const uploaded=await uploadClinicalMedia(file,path);
      const timestamp=reportDate ? reportDate : new Date().toISOString().slice(0,16).replace('T',' ');
      const results:LabResult[]=tests.map((t,i)=>({
        id:`lab-scan-${idBase}-${i}`,panel:panel||'Custom Lab',testName:t.testName,value:Number.isFinite(Number(t.value))?Number(t.value):t.value,
        unit:t.unit,referenceRange:t.referenceRange||undefined,status:t.status==='unknown'?undefined:t.status,flag:t.status==='critical'?'Critical':t.status==='high'?'High':t.status==='low'?'Low':'Normal',
        timestamp,reportDate:reportDate||undefined,reportPatientName:reportPatientName||undefined,
        sourceImageUrl:uploaded.url,sourceImageStoragePath:uploaded.cloud?path:undefined,extractionConfidence:t.confidence
      }));
      onConfirm(results);
      results.filter(result=>result.status==='critical').forEach(result=>{
        createPanelAlarm(patient.id,'labs',`Critical Lab: ${result.testName}`,`${result.testName}: ${String(result.value)} ${result.unit||''}`.trim(),'critical');
      });
      setSaving(false); onClose();
    }catch(e:any){setError(String(e?.message||'Could not save the lab report image.'));setSaving(false);}
  };

  const mismatch=reportPatientName && patient.fullName && reportPatientName.trim().toLowerCase()!==patient.fullName.trim().toLowerCase();
  return <div className="fixed inset-0 z-[120] bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-3">
    <div className="w-full max-w-5xl max-h-[94vh] overflow-hidden rounded-3xl bg-white dark:bg-[#0F172A] border border-slate-200 dark:border-slate-800 shadow-2xl">
      <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div><h3 className="text-lg font-extrabold flex items-center gap-2"><FileSearch className="w-5 h-5 text-cyan-500"/>Scan Lab Report</h3><p className="text-[11px] text-slate-500">AI extracts visible values only. Nothing is saved until you confirm.</p></div>
        <button onClick={onClose} disabled={scanning||saving}><X className="w-5 h-5"/></button>
      </div>
      <div className="p-4 overflow-y-auto max-h-[78vh] space-y-4">
        {!file ? <label className="min-h-48 rounded-2xl border-2 border-dashed border-cyan-500/30 bg-cyan-500/5 flex flex-col items-center justify-center gap-2 cursor-pointer"><Camera className="w-10 h-10 text-cyan-500"/><span className="font-bold">Choose lab report image</span><span className="text-[10px] text-slate-400">CBC, Chemistry, Cardiac Markers, ABG, etc.</span><input type="file" accept="image/*" className="hidden" onChange={e=>void selectFile(e.target.files?.[0]||null)}/></label> :
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <div className="space-y-2"><div className="rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black/5"><img src={preview} alt="Lab report preview" className="w-full max-h-[55vh] object-contain"/></div><label className="inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold cursor-pointer"><Camera className="w-4 h-4"/>Replace image<input type="file" accept="image/*" className="hidden" onChange={e=>void selectFile(e.target.files?.[0]||null)}/></label>{!tests.length&&<button onClick={()=>void scan()} disabled={scanning} className="ml-2 px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-extrabold disabled:opacity-40">{scanning?<><Loader2 className="inline w-4 h-4 animate-spin mr-1"/>Scanning…</>:<>Scan with AI</>}</button>}</div>
          <div className="space-y-3">
            {error&&<div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-500 text-xs">{error}</div>}
            {mismatch&&<div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-600 text-xs font-semibold"><TriangleAlert className="inline w-4 h-4 mr-1"/>Patient name mismatch: report says “{reportPatientName}”, current patient is “{patient.fullName}”. Review before confirming.</div>}
            {warnings.map((w,i)=><div key={i} className="p-2.5 rounded-xl bg-amber-500/10 text-amber-600 text-[10px]">{w}</div>)}
            {tests.length>0&&<><div className="rounded-xl bg-slate-50 dark:bg-slate-900/60 p-3 text-xs"><b>Detected panel:</b> {panel||'—'} {reportDate&&<span>• Report date: {reportDate}</span>}</div>
            <div className="space-y-2">{tests.map((t,i)=><div key={i} className="rounded-xl border border-slate-200 dark:border-slate-800 p-3">
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-center"><input value={t.testName} onChange={e=>update(i,'testName',e.target.value)} className="rounded-lg border p-2 text-xs bg-white dark:bg-slate-900"/><input value={String(t.value)} onChange={e=>update(i,'value',e.target.value)} className="rounded-lg border p-2 text-xs bg-white dark:bg-slate-900"/><input value={t.unit} onChange={e=>update(i,'unit',e.target.value)} className="rounded-lg border p-2 text-xs bg-white dark:bg-slate-900"/><input value={t.referenceRange} onChange={e=>update(i,'referenceRange',e.target.value)} placeholder="Reference range" className="rounded-lg border p-2 text-xs bg-white dark:bg-slate-900"/><select value={t.status} onChange={e=>update(i,'status',e.target.value)} className="rounded-lg border p-2 text-xs bg-white dark:bg-slate-900"><option value="normal">Normal</option><option value="low">Low</option><option value="high">High</option><option value="critical">Critical</option><option value="unknown">Unknown</option></select></div><div className="mt-1 text-[9px] text-slate-400">AI confidence: {t.confidence} • Review every value before confirming.</div></div>)}</div>
            <div className="flex justify-end gap-2"><button onClick={onClose} disabled={saving} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">Cancel</button><button onClick={()=>void confirm()} disabled={saving} className="px-5 py-2 rounded-xl bg-emerald-500 text-white text-xs font-extrabold">{saving?<><Loader2 className="inline w-4 h-4 animate-spin mr-1"/>Saving…</>:<><CheckCircle2 className="inline w-4 h-4 mr-1"/>Confirm & Add Results</>}</button></div>
            </>}
          </div>
        </div>}
      </div>
    </div>
  </div>;
};
