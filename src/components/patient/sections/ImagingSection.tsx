import React, { useEffect, useRef, useState } from 'react';
import { Image as ImageIcon, Plus, Trash2, X, Layers, Edit2, Upload } from 'lucide-react';
import { Patient, ImagingStudy } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';
import { useIsPreviousViewer } from '../PreviousAdmissionViewer';
import { VoiceDictationButton } from '../VoiceDictationButton';
import { ImageZoomModal } from '../ImageZoomModal';
import { uploadClinicalMedia, optimizeClinicalImage, isClinicalImageFile, refreshClinicalMediaUrls } from '../../../services/mediaStorage';
import { deleteMediaFromStorage } from '../../../services/webFirebase';
import { syncCurrentUserNow } from '../../../services/cloudSyncBridge';

interface ImagingSectionProps { patient: Patient; }

const PRESET_SAMPLE_SCANS = [
  { name: 'Brain CT (Non-Contrast Ischemic Infarct)', url: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?w=800&auto=format&fit=crop&q=80' },
  { name: 'Chest Radiograph (CXR AP Portable)', url: 'https://images.unsplash.com/photo-1530497610245-94d3c16cda28?w=800&auto=format&fit=crop&q=80' },
  { name: 'Bedside Transthoracic Echocardiogram (TTE)', url: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=800&auto=format&fit=crop&q=80' },
  { name: 'Coronary Angiography (LAD DES Post-PCI)', url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&auto=format&fit=crop&q=80' },
];

const PRESET_MODALITIES = [
  'Chest X-ray',
  'CT Brain',
  'CT Chest / PE protocol',
  'CT Abdomen & Pelvis',
  'Echocardiogram (TTE/TEE)',
  'Coronary Angiogram',
  'Cardiac MRI',
  'Bedside POCUS',
];

const NEW_TYPE_VALUE = '__custom__';
const CUSTOM_MODALITY_KEY = 'cardiovault_imaging_modality_library_v1';
const loadCustomModalities = (): string[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(CUSTOM_MODALITY_KEY) || '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
  } catch { return []; }
};

export const ImagingSection: React.FC<ImagingSectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const isPreviousViewer = useIsPreviousViewer();
  const [selectedModality, setSelectedModality] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudyId, setEditingStudyId] = useState<string | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [activeStudyForUpload, setActiveStudyForUpload] = useState<string | null>(null);
  const [uploadingImages, setUploadingImages] = useState(false);
  const [savingStudy, setSavingStudy] = useState(false);
  const [resolvedImageUrls, setResolvedImageUrls] = useState<Record<string, string[]>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [studyType, setStudyType] = useState('Chest X-ray');
  const [customModalities, setCustomModalities] = useState<string[]>(loadCustomModalities);
  const [customModality, setCustomModality] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [indication, setIndication] = useState('Pre-operative / line placement check');
  const [findings, setFindings] = useState('');

  const modalityOptions = [...PRESET_MODALITIES, ...customModalities.filter(m => !PRESET_MODALITIES.includes(m))];
  if (studyType && studyType !== NEW_TYPE_VALUE && !modalityOptions.includes(studyType)) modalityOptions.push(studyType);

  const rawStudies: any[] = patient.imaging || (patient as any).imagingStudies || [];
  const studies: ImagingStudy[] = rawStudies.map((s, idx) => ({
    id: s.id || `img-${idx}-${Date.now()}`,
    date: s.date || new Date().toISOString().split('T')[0],
    modality: s.modality || s.type || 'X-Ray',
    region: s.region || s.bodyRegion || 'Chest',
    indication: s.indication || 'Clinical follow-up',
    findings: s.findings || '',
    impression: s.impression || '',
    imageUrls: s.imageUrls || s.images || [],
    imageStoragePaths: s.imageStoragePaths || [],
    radiologist: s.radiologist || s.operator || 'Attending Radiologist',
  }));

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const entries = await Promise.all(studies.map(async study => {
        try {
          const urls = await refreshClinicalMediaUrls(study.imageUrls || [], study.imageStoragePaths || []);
          return [study.id, urls] as const;
        } catch (error) {
          console.warn('Clinical imaging URL refresh failed:', error);
          return [study.id, study.imageUrls || []] as const;
        }
      }));
      if (!cancelled) setResolvedImageUrls(Object.fromEntries(entries));
    };
    void load();
    return () => { cancelled = true; };
  }, [studies.map(s => `${s.id}:${(s.imageStoragePaths || []).join(',')}`).join('|'), studies.map(s => (s.imageUrls || []).length).join('|')]);

  const filteredStudies = selectedModality === 'All' ? studies : studies.filter(s =>
    s.modality.toLowerCase().includes(selectedModality.toLowerCase())
  );

  const handleOpenAdd = () => {
    if (isPreviousViewer) return;
    setEditingStudyId(null);
    setStudyType('Chest X-ray');
    setCustomModality('');
    setDate(new Date().toISOString().split('T')[0]);
    setIndication('Routine follow-up / line verification');
    setFindings('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (study: ImagingStudy) => {
    if (isPreviousViewer) return;
    setEditingStudyId(study.id);
    setStudyType(study.modality || study.type || 'Chest X-ray');
    setCustomModality('');
    setDate(study.date);
    setIndication(study.indication || '');
    setFindings(study.findings || '');
    setShowAddModal(true);
  };

  const persist = (updated: ImagingStudy[]) => { if (isPreviousViewer) return; updatePatient(patient.id, { imaging: updated as any }); };

  const handleDeleteStudy = (studyId: string) => {
    if (isPreviousViewer) return;
    persist(studies.filter(s => s.id !== studyId));
    showToast('Imaging study removed', 'success');
  };

  const handleSaveStudy = (e: React.FormEvent) => {
    e.preventDefault();
    if (savingStudy) return;
    const finalType = studyType === NEW_TYPE_VALUE ? customModality.trim() : studyType.trim();
    if (!finalType) {
      showToast('Please choose an imaging type', 'error');
      return;
    }
    if (!findings.trim()) {
      showToast('Please write the findings before saving', 'error');
      return;
    }
    setSavingStudy(true);

    if (!PRESET_MODALITIES.includes(finalType) && !customModalities.includes(finalType)) {
      const next = [...customModalities, finalType];
      setCustomModalities(next);
      try { localStorage.setItem(CUSTOM_MODALITY_KEY, JSON.stringify(next)); } catch { /* keep the study even if the list cannot be remembered */ }
    }

    if (editingStudyId) {
      const updated = studies.map(s => s.id === editingStudyId ? {
        ...s,
        modality: finalType,
        date,
        indication,
        findings,
      } : s);
      persist(updated);
      showToast('Imaging study updated', 'success');
    } else {
      const studyPayload: ImagingStudy = {
        id: `img-${Date.now()}`,
        modality: finalType,
        date,
        indication,
        findings,
        imageUrls: [],
      };
      persist([studyPayload, ...studies]);
      showToast('New imaging study recorded', 'success');
    }
    setShowAddModal(false);
    setSavingStudy(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files: File[] = e.target.files ? Array.from(e.target.files) : [];
    if (!files.length || !activeStudyForUpload) return;

    const imageFiles = files.filter(isClinicalImageFile);
    if (!imageFiles.length) {
      showToast('Please choose image files only.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    setUploadingImages(true);
    try {
      const uploadBatchId=Date.now();
      const preparedFiles = await Promise.all(imageFiles.map(file => optimizeClinicalImage(file)));
      const uploaded = await Promise.all(preparedFiles.map((file, index) => {
        const path=`units/${patient.unitId}/patients/${patient.id}/imaging/${activeStudyForUpload}/${uploadBatchId}-${index}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
        return uploadClinicalMedia(file,path).then(result=>({result,path}));
      }));
      const urls = uploaded.map(item => item.result.url);
      const paths = uploaded.filter(item => item.result.cloud).map(item => item.result.storagePath || item.path);
      persist(studies.map(s => s.id === activeStudyForUpload
        ? { ...s, imageUrls: [...(s.imageUrls || []), ...urls], imageStoragePaths: [...(s.imageStoragePaths || []), ...paths] }
        : s
      ));
      const synced = await syncCurrentUserNow();
      if (!synced) throw new Error('Scan uploaded, but the patient record could not be saved to cloud. Please run Cloud Sync before leaving the patient file.');
      showToast(`${urls.length} scan image${urls.length === 1 ? '' : 's'} added.`, 'success');
    } catch (error) {
      console.error('Scan image upload failed:', error);
      showToast('Sorry, the images could not be added. Please try again.', 'error');
    } finally {
      setUploadingImages(false);
      setActiveStudyForUpload(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = async (studyId: string, imgIdx: number) => {
    const study=studies.find(s=>s.id===studyId);
    const storagePath=study?.imageStoragePaths?.[imgIdx];
    if(storagePath){try{await deleteMediaFromStorage(storagePath);}catch(error){console.warn('Cloud imaging delete failed:',error);}}
    persist(studies.map(s => {
      if (s.id !== studyId) return s;
      const nextUrls=[...(s.imageUrls || [])];nextUrls.splice(imgIdx,1);
      const nextPaths=[...(s.imageStoragePaths || [])];if(imgIdx<nextPaths.length)nextPaths.splice(imgIdx,1);
      return { ...s, imageUrls: nextUrls, imageStoragePaths: nextPaths };
    }));
    showToast('Attached image removed', 'success');
  };

  const handleAttachPreset = (studyId: string, url: string) => {
    persist(studies.map(s => s.id === studyId ? { ...s, imageUrls: [...(s.imageUrls || []), url] } : s));
    showToast('Preset scan image attached', 'success');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      <input ref={fileInputRef} type="file" accept="image/*" multiple onChange={handleFileUpload} className="hidden" />

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><ImageIcon className="w-5 h-5 text-cyan-500" /> Diagnostic Imaging & Scans</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">Chest X-ray, CT Brain/Chest/Abdo, Echocardiogram, Angiogram, MRI, Ultrasound with high-res scans</p>
        </div>
        <button disabled={isPreviousViewer} onClick={handleOpenAdd} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors shadow-sm self-start sm:self-auto"><Plus className="w-4 h-4" /> Add Imaging Study</button>
      </div>

      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        {['All', 'X-Ray', 'CT', 'Echo', 'Angiogram', 'MRI', 'Ultrasound'].map(mod => (
          <button key={mod} onClick={() => setSelectedModality(mod)} className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${selectedModality === mod ? 'bg-cyan-500 text-slate-950 shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'}`}>{mod}</button>
        ))}
      </div>

      <div className="space-y-5">
        {filteredStudies.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-sm">No imaging studies found for this modality filter. Click "Add Imaging Study" to record one.</div>
        ) : filteredStudies.map(study => (
          <div key={study.id} className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-500 flex items-center justify-center"><Layers className="w-5 h-5" /></div>
                <div><h3 className="text-base font-bold text-slate-900 dark:text-white">{study.modality}</h3><p className="text-xs text-slate-500 dark:text-slate-400">{study.date} • Indication: {study.indication}</p></div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button onClick={() => { if (uploadingImages) return; setActiveStudyForUpload(study.id); fileInputRef.current?.click(); }} disabled={uploadingImages} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5">{uploadingImages ? 'Uploading…' : <><Upload className="w-3.5 h-3.5 text-cyan-500" /> Upload Scan</>}</button>
                <button onClick={() => handleOpenEdit(study)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300" title="Edit Study"><Edit2 className="w-3.5 h-3.5" /></button>
                <button disabled={isPreviousViewer} onClick={() => handleDeleteStudy(study.id)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950 text-slate-400 hover:text-rose-500" title="Delete Study"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>

            <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1"><span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">Detailed Radiologic Findings</span><p className="text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{study.findings}</p></div>

            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                <span className="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5 text-cyan-500" /> Attached Scan Images ({(resolvedImageUrls[study.id] || study.imageUrls || []).length})</span>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar"><span className="text-[11px] text-slate-400 whitespace-nowrap">Or attach sample:</span>{PRESET_SAMPLE_SCANS.map((preset, idx) => <button key={idx} onClick={() => handleAttachPreset(study.id, preset.url)} className="px-2 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-600 dark:text-slate-300 whitespace-nowrap">{preset.name.split(' ')[0]}</button>)}</div>
              </div>

              {(resolvedImageUrls[study.id] || []).length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {(resolvedImageUrls[study.id] || []).map((url, imgIdx) => (
                    <div key={imgIdx} className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-black/40 cursor-zoom-in" onClick={() => setFullScreenImage(url)}>
                      <img src={url} alt={`${study.modality} Scan ${imgIdx + 1}`} referrerPolicy="no-referrer" draggable={false} className="w-full max-h-64 object-contain group-hover:scale-105 transition-transform duration-200" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none"><span className="p-1.5 rounded-lg bg-white/20 text-white backdrop-blur-sm">⌕</span></div>
                      <button onClick={e => { e.stopPropagation(); handleRemoveImage(study.id, imgIdx); }} className="absolute top-2 right-2 p-1.5 rounded-lg bg-rose-500/80 hover:bg-rose-500 text-white opacity-0 group-hover:opacity-100 transition-opacity" title="Remove Image"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
              ) : (study.imageUrls || []).length > 0 ? (
                <div className="py-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400">Loading scan images…</div>
              ) : (
                <div className="py-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400">No scan images attached yet. Click "Upload Scan" or select a sample image above.</div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800"><h3 className="text-base font-bold text-slate-900 dark:text-white">{editingStudyId ? 'Edit Imaging Study' : 'Add Diagnostic Imaging Study'}</h3><button onClick={() => setShowAddModal(false)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"><X className="w-5 h-5" /></button></div>
            <form onSubmit={handleSaveStudy} className="space-y-3.5 text-xs">
              <div><label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">Study Modality</label><select value={studyType} onChange={e => setStudyType(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white">{modalityOptions.map(m => <option key={m} value={m}>{m}</option>)}<option value={NEW_TYPE_VALUE}>Add new type…</option></select></div>
              {studyType === NEW_TYPE_VALUE && (<div><label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">New imaging type</label><input value={customModality} onChange={e => setCustomModality(e.target.value)} placeholder="e.g. Doppler Leg, Hysterosalpingogram" className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" /></div>)}
              <div><label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">Date of Study</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
              <div><label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">Clinical Indication</label><div className="flex items-start gap-2"><input value={indication} onChange={e => setIndication(e.target.value)} placeholder="e.g. Line confirmation, acute dyspnea, stroke rule-out" className="flex-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" /><VoiceDictationButton value={indication} onApply={setIndication} fieldLabel="Clinical Indication" /></div></div>
              <div><label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">Findings</label><div className="flex items-start gap-2"><textarea value={findings} onChange={e => setFindings(e.target.value)} rows={3} placeholder="Detailed anatomical observations, line positions, lung fields..." className="flex-1 w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" /><VoiceDictationButton value={findings} onApply={setFindings} fieldLabel="Imaging Findings" /></div></div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800"><button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium">Cancel</button><button type="submit" disabled={savingStudy} className="px-4 py-2 rounded-xl bg-cyan-500 disabled:opacity-40 hover:bg-cyan-400 text-slate-950 font-bold">{savingStudy ? 'Saving…' : 'Save Study'}</button></div>
            </form>
          </div>
        </div>
      )}

      {fullScreenImage && <ImageZoomModal src={fullScreenImage} alt="Expanded Scan" onClose={() => setFullScreenImage(null)} />}
    </div>
  );
};
