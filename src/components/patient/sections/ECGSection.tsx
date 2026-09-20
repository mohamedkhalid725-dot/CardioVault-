import React, { useEffect, useRef, useState } from 'react';
import { Activity, Plus, Image as ImageIcon, Trash2, Calendar, Clock } from 'lucide-react';
import { ECGRecord, Patient } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';
import { ImageZoomModal } from '../ImageZoomModal';
import { uploadClinicalMedia, optimizeClinicalImage, isClinicalImageFile, refreshClinicalMediaUrls } from '../../../services/mediaStorage';
import { deleteMediaFromStorage } from '../../../services/webFirebase';
import { syncCurrentUserNow } from '../../../services/cloudSyncBridge';

interface Props { patient: Patient; }
const blank = (): ECGRecord => ({ id: '', date: new Date().toISOString().split('T')[0], time: new Date().toTimeString().slice(0, 5), heartRate: 0, rhythm: '', regularity: '', axis: '', pr: 0, qrs: 0, qt: 0, qtc: 0, pWave: '', qrsFindings: '', stSegment: '', tWave: '', otherFindings: '', interpretation: [], finalImpression: '', imageUrls: [] });

export const ECGSection: React.FC<Props> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const records = Array.isArray(patient.ecgRecords) ? patient.ecgRecords : [];
  const [selectedId, setSelectedId] = useState<string | null>(records[0]?.id || null);
  const [draft, setDraft] = useState<ECGRecord>(blank());
  const [showModal, setShowModal] = useState(false);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [saving, setSaving] = useState(false);
  const [resolvedImageUrls, setResolvedImageUrls] = useState<Record<string, string[]>>({});
  const fileRef = useRef<HTMLInputElement>(null);
  const selected = records.find((r) => r.id === selectedId) || null;

  useEffect(() => {
    let cancelled = false;
    if (!selected) return;
    const urls = [...(selected.imageUrls || [])];
    if (!selected.imageStoragePaths?.length) {
      setResolvedImageUrls(prev => ({ ...prev, [selected.id]: urls }));
      return;
    }
    refreshClinicalMediaUrls(urls, selected.imageStoragePaths)
      .then(next => { if (!cancelled) setResolvedImageUrls(prev => ({ ...prev, [selected.id]: next })); })
      .catch(error => console.warn('Clinical ECG image URL refresh failed:', error));
    return () => { cancelled = true; };
  }, [selected?.id, selected?.imageStoragePaths?.join('|'), selected?.imageUrls?.length]);

  const displayImages = selected ? (resolvedImageUrls[selected.id] || selected.imageUrls || []) : [];

  const openNew = () => { setDraft(blank()); setShowModal(true); };
  const save = () => {
    if (saving) return;
    if (!draft.date || !draft.time || !draft.finalImpression.trim()) { showToast('Date, time and interpretation are required.', 'error'); return; }
    setSaving(true);
    const record = { ...draft, id: draft.id || `ecg-${Date.now()}`, interpretation: draft.interpretation.length ? draft.interpretation : draft.finalImpression.split('\n').filter(Boolean) };
    updatePatient(patient.id, { ecgRecords: [record, ...records] });
    setSelectedId(record.id); setShowModal(false); showToast('ECG record saved.', 'success');
    setSaving(false);
  };
  const addImage = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length || !selected) return;

    const imageFiles = files.filter(isClinicalImageFile);
    if (!imageFiles.length) {
      showToast('Please select image files only (JPG, PNG, WEBP, HEIC).', 'error');
      e.target.value = '';
      return;
    }

    setUploadingImages(true);
    try {
      const uploadBatchId=Date.now();
      const preparedFiles = await Promise.all(imageFiles.map(file => optimizeClinicalImage(file)));
      const uploaded = await Promise.all(preparedFiles.map((file, index) => {
        const path=`patients/${patient.id}/ecg/${selected.id}/${uploadBatchId}-${index}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        return uploadClinicalMedia(file,path).then(result=>({result,path}));
      }));
      const urls = uploaded.map(item => item.result.url);
      const paths = uploaded.filter(item => item.result.cloud).map(item => item.result.storagePath || item.path);
      const next = records.map(r => r.id === selected.id
        ? { ...r, imageUrls: [...(r.imageUrls || []), ...urls], imageStoragePaths: [...(r.imageStoragePaths || []), ...paths] }
        : r
      );
      updatePatient(patient.id, { ecgRecords: next });
      const synced = await syncCurrentUserNow();
      if (!synced) throw new Error('Image uploaded, but the patient record could not be saved to cloud. Please run Cloud Sync before leaving the patient file.');
      showToast(`${urls.length} ECG image${urls.length === 1 ? '' : 's'} uploaded and saved to cloud.`, 'success');
    } catch (error) {
      console.error('ECG image upload failed:', error);
      const message = error instanceof Error ? error.message : String(error); showToast(message.slice(0, 220), 'error');
    } finally {
      setUploadingImages(false);
      e.target.value = '';
    }
  };
  const deleteRecord = (id: string) => { if (!window.confirm('Delete this ECG record?')) return; const next = records.filter((r) => r.id !== id); updatePatient(patient.id, { ecgRecords: next }); setSelectedId(next[0]?.id || null); showToast('ECG record deleted.', 'info'); };
  const deleteImage = async (id: string, imageIndex: number) => {
    if (!window.confirm('Remove this ECG image?')) return;
    const record=records.find(r=>r.id===id);
    const storagePath=record?.imageStoragePaths?.[imageIndex];
    if(storagePath){try{await deleteMediaFromStorage(storagePath);}catch(error){console.warn('Cloud ECG image delete failed:',error);}}
    updatePatient(patient.id,{ecgRecords:records.map(r=>r.id===id?{...r,imageUrls:(r.imageUrls||[]).filter((_,i)=>i!==imageIndex),imageStoragePaths:(r.imageStoragePaths||[]).filter((_,i)=>i!==imageIndex)}:r)});
  };
  const input = 'w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white';

  return <div className="space-y-5 max-w-5xl mx-auto animate-in fade-in duration-150">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><Activity className="w-5 h-5 text-cyan-500" /> ECG</h2><p className="text-xs text-slate-500 dark:text-slate-400">Real physician-entered ECG records and patient-specific uploaded images.</p></div><div className="flex gap-2"><button disabled={!selected || uploadingImages} onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold disabled:opacity-40">{uploadingImages ? 'Uploading…' : <ImageIcon className="w-4 h-4 text-cyan-500" />} {uploadingImages ? '' : 'Add Image'}</button><input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={addImage} /><button onClick={openNew} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold"><Plus className="w-4 h-4" /> Add ECG</button></div></div>

    {records.length === 0 ? <div className="p-10 text-center rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E]"><Activity className="w-8 h-8 mx-auto text-slate-400 mb-3" /><p className="text-sm font-semibold text-slate-700 dark:text-slate-300">No ECG records yet.</p><p className="text-xs text-slate-400 mt-1">Add an ECG interpretation and optionally attach the actual ECG image.</p></div> : <div className="grid grid-cols-1 md:grid-cols-3 gap-5"><div className="space-y-2">{records.map((r) => <button key={r.id} onClick={() => setSelectedId(r.id)} className={`w-full text-left p-3.5 rounded-2xl border ${selectedId === r.id ? 'bg-cyan-500/10 border-cyan-500/40' : 'bg-white dark:bg-[#111C2E] border-slate-200 dark:border-slate-800'}`}><div className="flex items-center justify-between gap-2"><span className="text-xs font-bold text-slate-900 dark:text-white">{r.date}</span><span className="text-[10px] text-slate-400">{r.time}</span></div><p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{r.finalImpression || r.interpretation?.join(' • ') || 'ECG record'}</p></button>)}</div><div className="md:col-span-2">{selected && <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-5"><div className="flex items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800"><div><h3 className="text-lg font-bold text-slate-900 dark:text-white">ECG Interpretation</h3><div className="text-xs text-slate-400 flex gap-3"><span><Calendar className="inline w-3.5 h-3.5" /> {selected.date}</span><span><Clock className="inline w-3.5 h-3.5" /> {selected.time}</span></div></div><button onClick={() => deleteRecord(selected.id)} className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-rose-500"><Trash2 className="w-4 h-4" /></button></div><div className="grid grid-cols-2 sm:grid-cols-4 gap-3">{([['HR',selected.heartRate,'bpm'],['PR',selected.pr,'ms'],['QRS',selected.qrs,'ms'],['QTc',selected.qtc,'ms']] as const).map(([l,v,u]) => <div key={l} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60"><span className="text-[10px] text-slate-400 block">{l}</span><b className="text-sm text-slate-900 dark:text-white">{v || '—'} {u}</b></div>)}</div><div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-900/60"><b className="text-xs text-slate-400 block mb-2">Physician Interpretation</b><p className="text-sm whitespace-pre-wrap text-slate-700 dark:text-slate-300">{selected.finalImpression || selected.interpretation?.join('\n') || 'Not documented.'}</p></div><div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs"><div><b className="text-slate-400">Rhythm:</b> {selected.rhythm || '—'}</div><div><b className="text-slate-400">Axis:</b> {selected.axis || '—'}</div><div><b className="text-slate-400">ST/T:</b> {selected.stSegment || selected.tWave || '—'}</div><div><b className="text-slate-400">Other:</b> {selected.otherFindings || '—'}</div></div><div><b className="text-xs text-slate-400 block mb-2">Attached ECG Images ({displayImages.length})</b>{displayImages.length ? <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">{displayImages.map((src,i) => <div key={`${selected.id}-${i}`} className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 cursor-zoom-in" onClick={() => setFullScreenImage(src)}><img src={src} alt={`ECG ${i+1}`} draggable={false} className="w-full max-h-72 object-contain bg-white" /><button onClick={(e) => { e.stopPropagation(); deleteImage(selected.id,i); }} className="absolute top-2 right-2 p-2 rounded-lg bg-black/60 text-white"><Trash2 className="w-3.5 h-3.5" /></button></div>)}</div> : <div className="text-xs text-slate-400 p-4 border border-dashed rounded-xl">No image attached to this ECG record.</div>}</div></div>}</div></div>}

    {showModal && <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"><div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-2xl"><div className="flex items-center justify-between pb-4 border-b border-slate-200 dark:border-slate-800"><h3 className="text-lg font-bold text-slate-900 dark:text-white">Add ECG Record</h3><button onClick={() => setShowModal(false)}><XIcon /></button></div><div className="grid grid-cols-1 sm:grid-cols-3 gap-3 py-4"><label className="text-xs font-semibold">Date<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={input + ' mt-1'} /></label><label className="text-xs font-semibold">Time<input type="time" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} className={input + ' mt-1'} /></label><label className="text-xs font-semibold">Heart Rate<input type="number" value={draft.heartRate || ''} onChange={(e) => setDraft({ ...draft, heartRate: Number(e.target.value) })} className={input + ' mt-1'} /></label><label className="text-xs font-semibold">Rhythm<input value={draft.rhythm} onChange={(e) => setDraft({ ...draft, rhythm: e.target.value })} className={input + ' mt-1'} /></label><label className="text-xs font-semibold">Axis<input value={draft.axis} onChange={(e) => setDraft({ ...draft, axis: e.target.value })} className={input + ' mt-1'} /></label><label className="text-xs font-semibold">PR (ms)<input type="number" value={draft.pr || ''} onChange={(e) => setDraft({ ...draft, pr: Number(e.target.value) })} className={input + ' mt-1'} /></label><label className="text-xs font-semibold">QRS (ms)<input type="number" value={draft.qrs || ''} onChange={(e) => setDraft({ ...draft, qrs: Number(e.target.value) })} className={input + ' mt-1'} /></label><label className="text-xs font-semibold">QTc (ms)<input type="number" value={draft.qtc || ''} onChange={(e) => setDraft({ ...draft, qtc: Number(e.target.value) })} className={input + ' mt-1'} /></label><label className="sm:col-span-3 text-xs font-semibold">Physician Interpretation<textarea required rows={5} value={draft.finalImpression} onChange={(e) => setDraft({ ...draft, finalImpression: e.target.value, interpretation: e.target.value.split('\n').filter(Boolean) })} className={input + ' mt-1'} placeholder="Enter the physician's interpretation..." /></label></div><div className="flex justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800"><button onClick={() => setShowModal(false)} className="px-4 py-2 text-xs text-slate-500">Cancel</button><button onClick={save} disabled={saving} className="px-5 py-2 rounded-xl bg-cyan-500 disabled:opacity-40 text-slate-950 text-xs font-bold">{saving ? 'Saving…' : 'Save ECG'}</button></div></div></div>}
    {fullScreenImage && <ImageZoomModal src={fullScreenImage} alt="Expanded ECG" onClose={() => setFullScreenImage(null)} />}
  </div>;
};

const XIcon: React.FC = () => <span className="text-slate-400 text-xl leading-none">×</span>;
