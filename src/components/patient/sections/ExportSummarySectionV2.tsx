import React, { useMemo, useState } from 'react';
import { FileDown, Eye, Loader2, CheckSquare, Square } from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { Patient } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';
import { generateClinicalCasePdf, ClinicalPdfSection } from '../../../services/clinicalPdfGenerator';

GlobalWorkerOptions.workerSrc = pdfWorker;

const SECTION_OPTIONS: Array<[ClinicalPdfSection, string, string]> = [
  ['identity', 'Patient Identification', 'Patient'],
  ['history', 'Clinical History', 'History'],
  ['vitals', 'Vitals & Fluid Balance', 'Vitals'],
  ['examination', 'Physical Examination', 'Exam'],
  ['ecg', 'ECG', 'ECG'],
  ['labs', 'Laboratory Investigations', 'Labs'],
  ['imaging', 'Radiological Investigations', 'IMG'],
  ['echo', 'Echocardiography', 'Echo'],
  ['cardiology', 'Coronary / Cardiology', 'Cardio'],
  ['medications', 'Medications & Infusions', 'Rx'],
  ['course', 'Hospital Course', 'Course'],
  ['timeline', 'Important Events Timeline', 'TL'],
  ['problems', 'Problem List', 'Problems'],
  ['summary', 'Final Case Summary', 'Summary'],
  ['missing', 'Missing / Unavailable Information', 'Missing'],
  ['discrepancies', 'Data Discrepancies / Corrections', 'Data'],
];

const DEFAULTS = SECTION_OPTIONS.map(([id]) => id);

export const ExportSummarySectionV2: React.FC<{ patient: Patient }> = ({ patient }) => {
  const { units, beds, showToast } = useApp();
  const [selected, setSelected] = useState<ClinicalPdfSection[]>(DEFAULTS);
  const [busy, setBusy] = useState(false);
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [preview, setPreview] = useState(false);

  const unit = units.find(u => u.id === patient.unitId);
  const bed = beds.find(b => b.id === patient.bedId);
  const allSelected = selected.length === SECTION_OPTIONS.length;

  const toggle = (id: ClinicalPdfSection) =>
    setSelected(current => current.includes(id) ? current.filter(x => x !== id) : [...current, id]);

  const selectAll = () => setSelected(allSelected ? [] : DEFAULTS);

  const renderPreview = async (blob: Blob) => {
    const data = await blob.arrayBuffer();
    const pdf = await getDocument({ data }).promise;
    const images: string[] = [];
    for (let i = 1; i <= pdf.numPages; i += 1) {
      const page = await pdf.getPage(i);
      const viewport = page.getViewport({ scale: 1.2 });
      const canvas = document.createElement('canvas');
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      await page.render({ canvasContext: ctx, viewport }).promise;
      images.push(canvas.toDataURL('image/png'));
    }
    setPreviewPages(images);
  };

  const generate = async (save: boolean) => {
    if (!selected.length) {
      showToast('Select at least one section.', 'error');
      return;
    }
    setBusy(true);
    try {
      const blob = generateClinicalCasePdf(patient, {
        sections: selected,
        unit,
        bed,
        reportTitle: 'CCU / CARDIOLOGY CASE PRESENTATION',
        departmentLabel: unit?.name || 'CCU Department',
        hospitalLabel: 'CardioVault Department Clinical Record',
      });
      setPreview(true);
      setPreviewPages([]);
      await renderPreview(blob);
      if (save) {
        const filename = `CardioVault-Case-Presentation-${patient.mrn || patient.id}.pdf`;
        if (Capacitor.isNativePlatform()) {
          const reader = new FileReader();
          const base64 = await new Promise<string>((resolve, reject) => {
            reader.onload = () => {
              const result = String(reader.result || '');
              resolve(result.includes(',') ? result.split(',')[1] : result);
            };
            reader.onerror = () => reject(reader.error || new Error('Unable to read PDF.'));
            reader.readAsDataURL(blob);
          });
          await Filesystem.writeFile({
            path: `CardioVault/${filename}`,
            data: base64,
            directory: Directory.Documents,
            recursive: true,
          });
          showToast('Clinical case PDF saved to Documents/CardioVault.', 'success');
        } else {
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          window.setTimeout(() => URL.revokeObjectURL(url), 2000);
          showToast('Clinical case PDF saved.', 'success');
        }
      }
    } catch (error) {
      console.error('CardioVault clinical PDF generation failed:', error);
      showToast(error instanceof Error ? error.message : 'PDF generation failed.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const selectedLabels = useMemo(
    () => SECTION_OPTIONS.filter(([id]) => selected.includes(id)).map(([, label]) => label),
    [selected],
  );

  return (
    <div className="space-y-4 max-w-5xl mx-auto">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-5">
        <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
          <div>
            <h2 className="text-xl font-black">Clinical Case Presentation PDF</h2>
            <p className="text-xs text-slate-500 mt-1">
              Built around the supplied 6-page CCU/Cardiology case-presentation template: structured sections, clinical tables, missing-data and discrepancy blocks.
            </p>
            <p className="text-[11px] text-slate-400 mt-2">
              Patient: <span className="font-bold text-slate-600 dark:text-slate-200">{patient.fullName}</span>
              {' • '}{selected.length} sections selected
            </p>
          </div>
          <div className="flex gap-2 shrink-0">
            <button onClick={() => void generate(false)} disabled={busy} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold disabled:opacity-50">
              <Eye className="w-4 h-4" /> Preview
            </button>
            <button onClick={() => void generate(true)} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-black disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              {busy ? 'Generating…' : 'Generate & Save PDF'}
            </button>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button onClick={selectAll} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold">
            {allSelected ? <CheckSquare className="w-4 h-4 text-cyan-500" /> : <Square className="w-4 h-4 text-slate-400" />}
            {allSelected ? 'Clear all' : 'Select all'}
          </button>
          <span className="text-[10px] text-slate-400">The PDF always uses the same CardioVault clinical template; selected sections control the content.</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-4">
          {SECTION_OPTIONS.map(([id, label, short]) => {
            const active = selected.includes(id);
            return (
              <button key={id} onClick={() => toggle(id)} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-xs font-semibold transition ${active ? 'border-cyan-500/50 bg-cyan-500/10' : 'border-slate-200 dark:border-slate-800 text-slate-500'}`}>
                <span className={`w-7 h-7 rounded-lg flex items-center justify-center text-[8px] font-black ${active ? 'bg-cyan-500 text-slate-950' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>{short}</span>
                <span className="flex-1">{label}</span>
                {active ? <CheckSquare className="w-4 h-4 text-cyan-500 shrink-0" /> : <Square className="w-4 h-4 text-slate-300 shrink-0" />}
              </button>
            );
          })}
        </div>

        {selectedLabels.length > 0 && (
          <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-950/40 border border-slate-200 dark:border-slate-800 p-3">
            <div className="text-[9px] uppercase tracking-widest font-black text-cyan-500">Selected content</div>
            <div className="text-[11px] text-slate-500 mt-1">{selectedLabels.join(' • ')}</div>
          </div>
        )}
      </div>

      {preview && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-black">PDF Preview</h3>
              <p className="text-[11px] text-slate-500">Actual generated A4 pages.</p>
            </div>
            <button onClick={() => { setPreview(false); setPreviewPages([]); }} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">Close</button>
          </div>
          <div className="mt-3 space-y-4 max-h-[75vh] overflow-auto rounded-xl bg-slate-100 dark:bg-slate-950 p-2">
            {previewPages.length ? previewPages.map((src, i) => (
              <div key={i} className="bg-white rounded-lg shadow-sm overflow-hidden">
                <img src={src} alt={`PDF page ${i + 1}`} className="w-full h-auto block" />
              </div>
            )) : <div className="h-32 flex items-center justify-center text-xs text-slate-400">Rendering PDF…</div>}
          </div>
        </div>
      )}
    </div>
  );
};
