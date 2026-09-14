import React, { useState, useRef } from 'react';
import {
  Image as ImageIcon,
  Plus,
  ZoomIn,
  Trash2,
  Calendar,
  FileText,
  Maximize2,
  X,
  Layers,
  Edit2,
  Eye,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Patient, ImagingStudy } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface ImagingSectionProps {
  patient: Patient;
}

const PRESET_SAMPLE_SCANS = [
  {
    name: 'Brain CT (Non-Contrast Ischemic Infarct)',
    url: 'https://images.unsplash.com/photo-1516549655169-df83a0774514?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Chest Radiograph (CXR AP Portable)',
    url: 'https://images.unsplash.com/photo-1530497610245-94d3c16cda28?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Bedside Transthoracic Echocardiogram (TTE)',
    url: 'https://images.unsplash.com/photo-1579684385127-1ef15d508118?w=800&auto=format&fit=crop&q=80',
  },
  {
    name: 'Coronary Angiography (LAD DES Post-PCI)',
    url: 'https://images.unsplash.com/photo-1576091160399-112ba8d25d1d?w=800&auto=format&fit=crop&q=80',
  },
];

export const ImagingSection: React.FC<ImagingSectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const [selectedModality, setSelectedModality] = useState<string>('All');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStudyId, setEditingStudyId] = useState<string | null>(null);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [activeStudyForUpload, setActiveStudyForUpload] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Form State
  const [studyType, setStudyType] = useState('Chest X-ray');
  const [bodyRegion, setBodyRegion] = useState('Chest AP');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [indication, setIndication] = useState('Pre-operative / line placement check');
  const [findings, setFindings] = useState('');
  const [impression, setImpression] = useState('');
  const [radiologist, setRadiologist] = useState('Dr. S. Al-Mansoor, MD (Staff Radiologist)');
  const [imageUrl, setImageUrl] = useState('');

  // Normalise studies from patient.imaging or patient.imagingStudies
  const rawStudies: any[] = (patient.imaging || (patient as any).imagingStudies || []);
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

  const filteredStudies =
    selectedModality === 'All'
      ? studies
      : studies.filter(
          (s) =>
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
    setImageUrl('');
    setShowAddModal(true);
  };

  const handleOpenEdit = (study: ImagingStudy) => {
    setEditingStudyId(study.id);
    setStudyType(study.modality);
    setBodyRegion(study.region);
    setDate(study.date);
    setIndication(study.indication);
    setFindings(study.findings);
    setImpression(study.impression);
    setRadiologist(study.radiologist || 'Staff Radiologist');
    setImageUrl(study.imageUrls?.[0] || '');
    setShowAddModal(true);
  };

  const handleDeleteStudy = (studyId: string) => {
    const updated = studies.filter((s) => s.id !== studyId);
    updatePatient(patient.id, {
      imaging: updated as any,
      imagingStudies: updated as any,
    });
    showToast('Imaging study removed', 'success');
  };

  const handleSaveStudy = (e: React.FormEvent) => {
    e.preventDefault();
    if (!findings.trim() || !impression.trim()) {
      showToast('Please provide findings and impression', 'error');
      return;
    }

    let updated: ImagingStudy[];
    const studyPayload: ImagingStudy = {
      id: editingStudyId || `img-${Date.now()}`,
      modality: studyType as any,
      region: bodyRegion,
      date,
      indication,
      findings,
      impression,
      radiologist,
      imageUrls: imageUrl ? [imageUrl] : [],
    };

    if (editingStudyId) {
      updated = studies.map((s) => (s.id === editingStudyId ? { ...studyPayload, imageUrls: imageUrl ? [imageUrl] : s.imageUrls } : s));
      showToast('Imaging study updated', 'success');
    } else {
      updated = [studyPayload, ...studies];
      showToast('New imaging study recorded', 'success');
    }

    updatePatient(patient.id, {
      imaging: updated as any,
      imagingStudies: updated as any,
    });
    setShowAddModal(false);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeStudyForUpload) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const updated = studies.map((s) =>
        s.id === activeStudyForUpload ? { ...s, imageUrls: [...(s.imageUrls || []), dataUrl] } : s
      );
      updatePatient(patient.id, { imaging: updated as any, imagingStudies: updated as any });
      showToast('Scan image attached successfully', 'success');
      setActiveStudyForUpload(null);
    };
    reader.readAsDataURL(file);
  };

  const handleRemoveImage = (studyId: string, imgIdx: number) => {
    const updated = studies.map((s) => {
      if (s.id === studyId) {
        const next = [...(s.imageUrls || [])];
        next.splice(imgIdx, 1);
        return { ...s, imageUrls: next };
      }
      return s;
    });
    updatePatient(patient.id, { imaging: updated as any, imagingStudies: updated as any });
    showToast('Attached image removed', 'success');
  };

  const handleAttachPreset = (studyId: string, url: string) => {
    const updated = studies.map((s) =>
      s.id === studyId ? { ...s, imageUrls: [...(s.imageUrls || []), url] } : s
    );
    updatePatient(patient.id, { imaging: updated as any, imagingStudies: updated as any });
    showToast('Preset scan image attached', 'success');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileUpload}
        className="hidden"
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <ImageIcon className="w-5 h-5 text-cyan-500" /> Diagnostic Imaging & Scans
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Chest X-ray, CT Brain/Chest/Abdo, Echocardiogram, Angiogram, MRI, Ultrasound with high-res scans
          </p>
        </div>

        <button
          onClick={handleOpenAdd}
          className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors shadow-sm self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" /> Add Imaging Study
        </button>
      </div>

      {/* Modality Filter Pills */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-2 overflow-x-auto no-scrollbar">
        {['All', 'X-Ray', 'CT', 'Echo', 'Angiogram', 'MRI', 'Ultrasound'].map((mod) => (
          <button
            key={mod}
            onClick={() => setSelectedModality(mod)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-bold whitespace-nowrap transition-all ${
              selectedModality === mod
                ? 'bg-cyan-500 text-slate-950 shadow-sm'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            {mod}
          </button>
        ))}
      </div>

      {/* Studies List */}
      <div className="space-y-5">
        {filteredStudies.length === 0 ? (
          <div className="text-center py-12 bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 text-slate-400 text-sm">
            No imaging studies found for this modality filter. Click "Add Imaging Study" to record one.
          </div>
        ) : (
          filteredStudies.map((study) => (
            <div
              key={study.id}
              className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 dark:border-slate-800 gap-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-10 h-10 rounded-xl bg-cyan-500/15 text-cyan-500 flex items-center justify-center font-bold">
                    <Layers className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-slate-900 dark:text-white">
                      {study.modality} — {study.region}
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {study.date} • Indication: {study.indication}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 self-start sm:self-auto">
                  {/* Upload button */}
                  <button
                    onClick={() => {
                      setActiveStudyForUpload(study.id);
                      fileInputRef.current?.click();
                    }}
                    className="cursor-pointer px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Upload className="w-3.5 h-3.5 text-cyan-500" /> Upload Scan
                  </button>

                  <button
                    onClick={() => handleOpenEdit(study)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 transition-colors"
                    title="Edit Study"
                  >
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => handleDeleteStudy(study.id)}
                    className="p-1.5 rounded-lg bg-slate-100 hover:bg-rose-100 dark:bg-slate-800 dark:hover:bg-rose-950 text-slate-400 hover:text-rose-500 transition-colors"
                    title="Delete Study"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Study Findings & Impression */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                <div className="p-3.5 bg-slate-50 dark:bg-slate-900/60 rounded-xl border border-slate-200 dark:border-slate-800 space-y-1">
                  <span className="font-bold text-slate-400 uppercase tracking-wider block text-[10px]">
                    Detailed Radiologic Findings
                  </span>
                  <p className="text-slate-800 dark:text-slate-200 leading-relaxed whitespace-pre-wrap">
                    {study.findings}
                  </p>
                </div>

                <div className="p-3.5 bg-cyan-500/5 dark:bg-cyan-500/10 rounded-xl border border-cyan-500/30 space-y-1">
                  <span className="font-bold text-cyan-700 dark:text-cyan-400 uppercase tracking-wider block text-[10px]">
                    Diagnostic Impression
                  </span>
                  <p className="text-slate-900 dark:text-white font-medium leading-relaxed whitespace-pre-wrap">
                    {study.impression}
                  </p>
                  {study.radiologist && (
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 block pt-1 italic">
                      Interpreted by: {study.radiologist}
                    </span>
                  )}
                </div>
              </div>

              {/* Attached Scans Gallery */}
              <div className="space-y-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <ImageIcon className="w-3.5 h-3.5 text-cyan-500" /> Attached Scan Images ({study.imageUrls?.length || 0})
                  </span>

                  {/* Preset attachment dropdown */}
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-400">Or attach sample:</span>
                    {PRESET_SAMPLE_SCANS.map((preset, idx) => (
                      <button
                        key={idx}
                        onClick={() => handleAttachPreset(study.id, preset.url)}
                        className="px-2 py-0.5 rounded text-[10px] bg-slate-100 dark:bg-slate-800 hover:bg-cyan-500/20 text-slate-600 dark:text-slate-300 transition-colors"
                      >
                        {preset.name.split(' ')[0]}
                      </button>
                    ))}
                  </div>
                </div>

                {study.imageUrls && study.imageUrls.length > 0 ? (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {study.imageUrls.map((url, imgIdx) => (
                      <div
                        key={imgIdx}
                        className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800 aspect-video bg-black/40"
                      >
                        <img
                          src={url}
                          alt={`${study.modality} Scan ${imgIdx + 1}`}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                          <button
                            onClick={() => setFullScreenImage(url)}
                            className="p-1.5 rounded-lg bg-white/20 hover:bg-white/40 text-white backdrop-blur-sm"
                            title="Zoom In"
                          >
                            <ZoomIn className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleRemoveImage(study.id, imgIdx)}
                            className="p-1.5 rounded-lg bg-rose-500/80 hover:bg-rose-500 text-white"
                            title="Remove Image"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="py-4 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-xl text-xs text-slate-400">
                    No scan images attached yet. Click "Upload Scan" or select a sample image above.
                  </div>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {/* Add / Edit Study Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
              <h3 className="text-base font-bold text-slate-900 dark:text-white">
                {editingStudyId ? 'Edit Imaging Study' : 'Add Diagnostic Imaging Study'}
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveStudy} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">
                    Study Modality
                  </label>
                  <select
                    value={studyType}
                    onChange={(e) => setStudyType(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  >
                    <option value="Chest X-ray">Chest X-ray (CXR)</option>
                    <option value="CT Brain">CT Brain (Non-contrast)</option>
                    <option value="CT Chest / PE protocol">CT Chest (PE protocol)</option>
                    <option value="CT Abdomen & Pelvis">CT Abdomen & Pelvis</option>
                    <option value="Echocardiogram (TTE/TEE)">Echocardiogram (TTE/TEE)</option>
                    <option value="Coronary Angiogram">Coronary Angiogram (Cath)</option>
                    <option value="Cardiac MRI">Cardiac MRI</option>
                    <option value="Bedside POCUS">Bedside POCUS / Ultrasound</option>
                  </select>
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">
                    Anatomical Region
                  </label>
                  <input
                    type="text"
                    value={bodyRegion}
                    onChange={(e) => setBodyRegion(e.target.value)}
                    placeholder="e.g. Chest AP Portable, Brain"
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">
                    Date of Study
                  </label>
                  <input
                    type="date"
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>

                <div>
                  <label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">
                    Radiologist / Operator
                  </label>
                  <input
                    type="text"
                    value={radiologist}
                    onChange={(e) => setRadiologist(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">
                  Clinical Indication
                </label>
                <input
                  type="text"
                  value={indication}
                  onChange={(e) => setIndication(e.target.value)}
                  placeholder="e.g. Line confirmation, acute dyspnea, stroke rule-out"
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">
                  Findings
                </label>
                <textarea
                  value={findings}
                  onChange={(e) => setFindings(e.target.value)}
                  rows={3}
                  placeholder="Detailed anatomical observations, line positions, lung fields..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-slate-500 dark:text-slate-400 font-medium mb-1">
                  Impression
                </label>
                <textarea
                  value={impression}
                  onChange={(e) => setImpression(e.target.value)}
                  rows={2}
                  placeholder="Summary diagnostic interpretation / recommendation..."
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold"
                >
                  Save Study
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Fullscreen Image Zoom Modal */}
      {fullScreenImage && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center p-4 animate-in fade-in duration-150"
          onClick={() => setFullScreenImage(null)}
        >
          <div className="relative max-w-4xl max-h-[85vh] w-full flex items-center justify-center">
            <img
              src={fullScreenImage}
              alt="Expanded Scan"
              referrerPolicy="no-referrer"
              className="max-h-[80vh] max-w-full rounded-2xl object-contain shadow-2xl border border-slate-700"
            />
            <button
              onClick={() => setFullScreenImage(null)}
              className="absolute top-2 right-2 p-2 rounded-full bg-slate-900/80 text-white hover:bg-slate-800 border border-slate-700"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
          <p className="text-xs text-slate-400 mt-3">Click anywhere to close full preview</p>
        </div>
      )}
    </div>
  );
};
