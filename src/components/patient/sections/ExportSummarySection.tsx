import React, { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { FileDown, Printer, Copy, Check, FileText } from 'lucide-react';
import { Patient } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface Props { patient: Patient; }
type SectionKey = 'overview'|'history'|'vitals'|'ecg'|'cardiology'|'medications'|'icu'|'imaging'|'labs'|'procedures'|'calculators'|'progress';
const sections: Array<{id:SectionKey;label:string}> = [
  {id:'overview',label:'Overview'},{id:'history',label:'History'},{id:'vitals',label:'Vitals & Balance'},{id:'ecg',label:'ECG'},
  {id:'cardiology',label:'Cardiology'},{id:'medications',label:'Medications'},{id:'icu',label:'ICU / Ventilator'},{id:'imaging',label:'Imaging'},
  {id:'labs',label:'Labs'},{id:'procedures',label:'Procedures'},{id:'calculators',label:'Calculators'},{id:'progress',label:'Progress Notes'}
];

export const ExportSummarySection: React.FC<Props> = ({ patient }) => {
  const { units, beds, showToast } = useApp();
  const [selected, setSelected] = useState<SectionKey[]>(sections.map((s) => s.id));
  const [copied, setCopied] = useState(false);
  const unit = units.find((u) => u.id === patient.unitId);
  const bed = beds.find((b) => b.id === patient.bedId);
  const latestVital = patient.vitalsHistory?.[0];
  const textFor = (id: SectionKey): string[] => {
    switch (id) {
      case 'overview': return [`Patient: ${patient.fullName}`, `MRN: ${patient.mrn}`, `Status: ${patient.status}`, `Unit: ${unit?.name || '—'} | Bed: ${bed?.bedNumber || '—'}`, `Diagnosis: ${patient.primaryDiagnosis}`, `Admission: ${patient.admissionDate} ${patient.admissionTime || ''}`];
      case 'history': return [`Chief complaint: ${patient.clinicalSummary?.chiefComplaint || '—'}`, `HPI: ${patient.clinicalSummary?.hpi || '—'}`, `PMH: ${patient.clinicalSummary?.pmh?.join(', ') || '—'}`, `Allergies: ${patient.allergies?.join(', ') || 'NKDA'}`];
      case 'vitals': return latestVital ? [`Latest: ${latestVital.timestamp}`, `BP ${latestVital.sbp}/${latestVital.dbp} mmHg | HR ${latestVital.hr} | RR ${latestVital.rr} | SpO₂ ${latestVital.spo2}% | Temp ${latestVital.temp}°C`, `GCS ${latestVital.gcsTotal} | RASS ${latestVital.rass}`] : ['No vital records recorded.'];
      case 'ecg': return (patient.ecgRecords || []).length ? (patient.ecgRecords || []).slice(0,10).map((r) => `${r.date} ${r.time}: ${r.finalImpression || r.interpretation?.join('; ') || 'ECG recorded'}`) : ['No ECG records recorded.'];
      case 'cardiology': return [`Rhythm: ${patient.cardiology?.rhythm || '—'}`, `LVEF: ${patient.cardiology?.echo?.ef ?? '—'}%`, `Echo summary: ${patient.cardiology?.echoBriefSummary || '—'}`, `Cath records: ${patient.cardiology?.cathRecords?.length || 0}`, `Biomarker records: ${patient.cardiology?.biomarkerRecords?.length || 0}`, `Devices: ${patient.cardiology?.devicesList?.length || 0}`];
      case 'medications': return (patient.medications || []).map((m) => `${m.drug || m.name || 'Medication'} — ${m.dose} ${m.route} ${m.frequency} (${m.status || 'Active'})`).slice(0,30).concat((patient.medications || []).length ? [] : ['No medications recorded.']);
      case 'icu': return [`Ventilator mode: ${patient.ventilator?.mode || '—'}`, `FiO₂ ${patient.ventilator?.fio2 ?? '—'}% | PEEP ${patient.ventilator?.peep ?? '—'} | RR ${patient.ventilator?.rr ?? '—'}`, `ABG records: ${patient.ventilator?.abgHistory?.length || 0}`];
      case 'imaging': return (patient.imaging || []).map((x) => `${x.date}: ${x.type || x.modality || 'Imaging'} — ${x.impression || x.findings || 'Study recorded'}`).slice(0,20).concat((patient.imaging || []).length ? [] : ['No imaging studies recorded.']);
      case 'labs': return (patient.labs || []).map((x) => `${x.date}: Hb ${x.hb}, WBC ${x.wbc}, Plt ${x.platelets}, Cr ${x.creatinine}, Na ${x.na}, K ${x.k}, Troponin ${x.troponin}`).slice(0,20).concat((patient.labs || []).length ? [] : ['No laboratory panels recorded.']);
      case 'procedures': return (patient.procedures || []).map((p) => `${p.date} ${p.time}: ${p.name || p.procedure || 'Procedure'}${p.surgeryName ? ` — ${p.surgeryName}` : ''}`).slice(0,20).concat((patient.procedures || []).length ? [] : ['No procedures recorded.']);
      case 'calculators': return (patient.calculatorResults || []).map((r) => `${r.name}: ${r.score} — ${r.interpretation}`).slice(0,20).concat((patient.calculatorResults || []).length ? [] : ['No calculator results recorded.']);
      case 'progress': return (patient.progressNotes || []).map((n) => `${n.date} ${n.time} — ${n.author || 'Physician'} — ${n.plan || n.assessment || 'Clinical note'}`).slice(0,20).concat((patient.progressNotes || []).length ? [] : ['No progress notes recorded.']);
    }
  };
  const preview = selected.flatMap((id) => [`\n=== ${sections.find((s) => s.id === id)?.label?.toUpperCase()} ===`, ...textFor(id)]);
  const sbar = `[SBAR] ${patient.fullName} | ${unit?.name || 'Unit'} ${bed?.bedNumber || ''}\nDiagnosis: ${patient.primaryDiagnosis}\nStatus: ${patient.status}\nLatest vitals: ${latestVital ? `BP ${latestVital.sbp}/${latestVital.dbp}, HR ${latestVital.hr}, SpO2 ${latestVital.spo2}%` : 'Not recorded'}\nPlan: ${patient.progressNotes?.[0]?.plan || 'Not documented'}`;
  const toggle = (id: SectionKey) => setSelected((p) => p.includes(id) ? p.filter((x) => x !== id) : [...p, id]);
  const preset = (ids: SectionKey[]) => setSelected(ids);
  const copySBAR = async () => { try { await navigator.clipboard.writeText(sbar); setCopied(true); showToast('SBAR copied.', 'success'); window.setTimeout(() => setCopied(false), 2000); } catch { showToast('Clipboard access unavailable.', 'error'); } };
  const exportPdf = () => {
    try {
      const doc = new jsPDF(); let y = 18;
      const add = (line: string, size = 10, bold = false) => { doc.setFont('helvetica', bold ? 'bold' : 'normal'); doc.setFontSize(size); const wrapped = doc.splitTextToSize(line, 175) as string[]; if (y + wrapped.length * 5 > 282) { doc.addPage(); y = 18; } doc.text(wrapped, 18, y); y += wrapped.length * 5 + 2; };
      add('CardioVault — Clinical Patient Record', 16, true); add(`${patient.fullName} | MRN ${patient.mrn}`, 11, true); add(`${unit?.name || 'Unit'} — ${bed?.bedNumber || 'Bed'} | ${patient.status}`); add(`Generated ${new Date().toLocaleString()}`, 9);
      selected.forEach((id) => { add(`=== ${sections.find((s) => s.id === id)?.label?.toUpperCase()} ===`, 11, true); textFor(id).forEach((line) => add(line)); });
      doc.save(`CardioVault_${patient.fullName.replace(/[^a-z0-9]+/gi,'_')}_${patient.mrn}.pdf`); showToast('Patient PDF exported successfully.', 'success');
    } catch (e) { console.error(e); showToast('Unable to generate the PDF. Please try again.', 'error'); }
  };
  return <div className="space-y-5 max-w-5xl mx-auto animate-in fade-in duration-150">
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><FileText className="w-5 h-5 text-cyan-500" /> Patient Record PDF / Export</h2><p className="text-xs text-slate-500 dark:text-slate-400">Select sections, preview the dossier, copy SBAR, or export to PDF.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => preset(sections.map((s) => s.id))} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">Select All</button><button onClick={() => preset([])} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">Deselect All</button><button onClick={copySBAR} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">{copied ? <Check className="inline w-3.5 h-3.5" /> : <Copy className="inline w-3.5 h-3.5" />} SBAR</button><button onClick={() => window.print()} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs"><Printer className="inline w-3.5 h-3.5" /> Print</button><button onClick={exportPdf} disabled={!selected.length} className="px-3 py-1.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold disabled:opacity-40"><FileDown className="inline w-3.5 h-3.5" /> Export PDF</button></div></div>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2"><h3 className="text-xs font-bold text-slate-400 uppercase">Sections</h3>{sections.map((s) => <label key={s.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"><input type="checkbox" checked={selected.includes(s.id)} onChange={() => toggle(s.id)} />{s.label}</label>)}</div><div className="md:col-span-2 bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5"><h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Live Preview</h3><pre className="whitespace-pre-wrap break-words text-xs leading-relaxed text-slate-700 dark:text-slate-300 max-h-[60vh] overflow-y-auto">{preview.join('\n')}</pre></div></div>
  </div>;
};
