import React, { useRef, useState } from 'react';
import { Image as ImageIcon, Plus, Trash2, X, Layers, Edit2, Upload } from 'lucide-react';
import { Patient, ImagingStudy } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';
import { ImageZoomModal } from '../ImageZoomModal';

interface ImagingSectionProps { patient: Patient; }

const PRESET_SAMPLE_SCANS = [
  { name: 'Brain CT (Non-Contrast Ischemic Infarct)', url: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?w=800&auto=format&fit=crop&q=80' },
  { name: 'Chest Radiograph (CXR AP Portable)', url: 'https://images.unsplash.com/photo-1530497610245-94d3c16cda28?w=800&auto=format&fit=crop&q=80' },
  { name: 'Bedside Transthoracic Echocardiogram (TTE)', url: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=800&auto=format&fit=crop&q=80' },
  { name: 'Coronary Angiography (LAD DES Post-PCI)', url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&auto=format&fit=crop&q=80' },
];

export const ImagingSection: React.FC<ImagingSectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const [selectedModality, setSelectedModality] = useState('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudyId, setEditingStudyId] = useState<string | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [activeStudyForUpload, setActiveStudyForUpload] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [studyType, setStudyType] = useState('Chest X-ray');
  const [bodyRegion, setBodyRegion] = useState('Chest AP');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [indication, setIndication] = useState('Pre-operative / line placement check');
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [radiologist, setRadiologist] = useState('Staff Radiologist');

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
    radiologist: s.radiologist || s.operator || 'Attending Radiologist',
  }));

  const filteredStudies = selectedModality === 'All' ? studies : studies.filter(s =>
    s.modality.toLowerCase().includes(selectedModality.toLowerCase()) ||
    s.region.toLowerCase().includes(selectedModality.toLowerCase())
  );

  const handleOpenAdd = () => {
    setEditingStudyId(null);
    setStudyType('Chest X-ray');
    setBodyRegion('Chest AP');
    setDate(new Date().toISOString().split('T')[0]);
    setIndication('Routine follow-up / line verification');
    setFindings('');
    setImpression('');
    setRadiologist('Staff Radiologist');
    setShowAddModal(true);
  };

  const handleOpenEdit = (study: ImagingStudy) => {
    setEditingStudyId(study.id);
    setStudyType(study.modality || study.type || 'Chest X-ray');
    setBodyRegion(study.region || study.bodyRegion || 'Chest AP');
    setDate(study.date);
    setIndication(study.indication || '');
    setFindings(study.findings || '');
    setImpression(study.impression || '');
    setRadiologist(study.radiologist || 'Staff Radiologist');
    setShowAddModal(true);
  };

  const persist = (updated: ImagingStudy[]) => updatePatient(patient.id, { imaging: updated as any, imagingStudies: updated as any });

  const handleDeleteStudy = (studyId: string) => {
    persist(studies.filter(s => s.id !== studyId));
    showToast('Imaging study removed', 'success');
  };

  const handleSaveStudy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!findings.trim() || !impression.trim()) {
      showToast('Please provide findings and impression', 'error');
      return;
    }

    if (editingStudyId) {
      const updated = studies.map(s => s.id === editingStudyId ? {
        ...s,
        modality: studyType,
        region: bodyRegion,
        date,
        indication,
        findings,
        impression,
        radiologist,
      } : s);
      persist(updated);
      showToast('Imaging study updated', 'success');
    } else {
      const studyPayload: ImagingStudy = {
        id: `img-${Date.now()}`,
        modality: studyType,
        region: bodyRegion,
        date,
        indication,
        findings,
        impression,
        radiologist,
        imageUrls: [],
      };
      persist([studyPayload, ...studies]);
      showToast('New imaging study recorded', 'success');
    }
    setShowAddModal(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length || !activeStudyForUpload) return;

    const imageFiles = files.filter(file => file.type.startsWith('image/'));
    if (!imageFiles.length) {
      showToast('Please select image files only.', 'error');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    try {
      const dataUrls = await Promise.all(imageFiles.map(file => new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error || new Error('Could not read image'));
        reader.readAsDataURL(file);
      })));

      persist(studies.map(s => s.id === activeStudyForUpload
        ? { ...s, imageUrls: [...(s.imageUrls || []), ...dataUrls] }
        : s
      ));
      showToast(`${dataUrls.length} scan image${dataUrls.length === 1 ? '' : 's'} attached successfully`, 'success');
    } catch (error) {
      console.error('Scan image upload failed:', error);
      showToast('One or more images could not be uploaded.', 'error');
    } finally {
      setActiveStudyForUpload(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleRemoveImage = (studyId: string, imgIdx: number) => {
    persist(studies.map(s => {
      if (s.id !== studyId) return s;
      const next = [...(s.imageUrls || [])];
      next.splice(imgIdx, 1);
      return { ...s, imageUrls: next };
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
        <button onClick={handleOpenAdd} className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors shadow-sm self-start sm:self-auto"><Plus className="w-4 h-4" /> Add Imaging Study</button>
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
                <div><h3 className="text-base font-bold text-slate-900 dark:text-white">{study.modality} — {study.region}</h3><p className="text-xs text-slate-500 dark:text-slate-400">{study.date} • Indication: {study.indication}</p></div>
              </div>
              <div className="flex items-center gap-2 self-start sm:self-auto">
                <button onClick={() => { setActiveStudyForUpload(study.id); fileInputRef.current?.click(); }} className="px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5"><Upload className="w-3.5 h-3.5 text-cyan-500" /> Upload Scan</button>
                <button onClick={() => handleOpenEdit(study)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300" title="Edit Study"><Edit2 className="w-3.5 h-3.5" /></button>
                <button onClick={() => handleDeleteStudy(study.id)} className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950 text-slate-400 hover:text-rose-500" title="Delete Study"><Trash2 className="w-3.5 h-3.5" /></button>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1"><span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">Detailed Radiologic Findings</span><p className="text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">{study.findings}</p></div>
              <div className="p-3.5 bg-cyan-500/5 dark:bg-cyan-500/10 rounded-xl border border-cyan-500/30 space-y-1"><span className="font-bold text-cyan-700 dark:text-cyan-400 uppercase tracking-wider block text-[10px]">Diagnostic Impression</span><p className="text-slate-900 dark:text-white font-medium leading-relaxed whitespace-pre-wrap">{study.impression}</p>{study.radiologist && <span className="text-[11px] text-slate-500 dark:text-slate-400 block pt-1 italic">Interpreted by: {study.radiologist}</span>}</div>
            </div>

            <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs">
                <span className="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5 text-cyan-500" /> Attached Scan Images ({study.imageUrls?.length || 0})</span>
                <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar"><span className="text-[11px] text-slate-400 whitespace-nowrap">Or attach sample:</span>{PRESET_SAMPLE_SCANS.map((preset, idx) => <button key={idx} onClick={() => handleAttachPreset(study.id, preset.url)} className="px-2 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-600 dark:text-slate-300 whitespace-nowrap">{preset.name.split(' ')[0]}</button>)}</div>
              </div>

              {study.imageUrls && study.imageUrls.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {study.imageUrls.map((url, imgIdx) => (
                    <div key={imgIdx} className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 aspect-video bg-black/40 cursor-zoom-in" onClick={() => setFullScreenImage(url)}>
                      <img src={url} alt={`${study.modality} Scan ${imgIdx + 1}`} referrerPolicy="no-referrer" draggable={false} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200" />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 pointer-events-none"><span className="p-1.5 rounded-lg bg-white/20 text-white backdrop-blur-sm">⌕</span></div>
                      <button onClick={e => { e.stopPropagation(); handleRemoveImage(study.id, imgIdx); }} className="absolute top-2 right-2 p-1.5 rounded-lg bg-rose-500/80 hover:bg-rose-500 text-white opacity-0 group-hover:opacity-100 transition-opacity" title="Remove Image"><Trash2 className="w-4 h-4" /></button>
                    </div>
                  ))}
                </div>
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
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">Study Modality</label><select value={studyType} onChange={e => setStudyType(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"><option>Chest X-ray</option><option>CT Brain</option><option>CT Chest / PE protocol</option><option>CT Abdomen & Pelvis</option><option>Echocardiogram (TTE/TEE)</option><option>Coronary Angiogram</option><option>Cardiac MRI</option><option>Bedside POCUS</option></select></div>
                <div><label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">Anatomical Region</label><input value={bodyRegion} onChange={e => setBodyRegion(e.target.value)} placeholder="e.g. Chest AP Portable, Brain" className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">Date of Study</label><input type="date" value={date} onChange={e => setDate(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
                <div><label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">Radiologist / Operator</label><input value={radiologist} onChange={e => setRadiologist(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
              </div>
              <div><label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">Clinical Indication</label><input value={indication} onChange={e => setIndication(e.target.value)} placeholder="e.g. Line confirmation, acute dyspnea, stroke rule-out" className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
              <div><label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">Findings</label><textarea value={findings} onChange={e => setFindings(e.target.value)} rows={3} placeholder="Detailed anatomical observations, line positions, lung fields..." className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
              <div><label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">Impression</label><textarea value={impression} onChange={e => setImpression(e.target.value)} rows={2} placeholder="Summary diagnostic interpretation / recommendation..." className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white" /></div>
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800"><button type="button" onClick={() => setShowAddModal(false)} className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium">Cancel</button><button type="submit" className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold">Save Study</button></div>
            </form>
          </div>
        </div>
      )}

      {fullScreenImage && <ImageZoomModal src={fullScreenImage} alt="Expanded Scan" onClose={() => setFullScreenImage(null)} />}
    </div>
  );
};
