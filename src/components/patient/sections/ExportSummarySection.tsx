import React, { useMemo, useState } from 'react';
import { jsPDF } from 'jspdf';
import { FileDown, Printer, Copy, Check, FileText, Image as ImageIcon } from 'lucide-react';
import { Patient } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

type SectionKey = 'overview'|'history'|'vitals'|'ecg'|'examination'|'cardiology'|'medications'|'icu'|'imaging'|'labs'|'procedures'|'calculators'|'progress';
const sectionIds: SectionKey[] = ['overview','history','vitals','ecg','examination','cardiology','medications','icu','imaging','labs','procedures','calculators','progress'];
const sections: Array<{id: SectionKey; label: string}> = sectionIds.map((id) => ({ id, label: id === 'icu' ? 'ICU / Ventilator & ABG' : id === 'vitals' ? 'Vitals & Balance' : id === 'progress' ? 'Progress Notes' : id.charAt(0).toUpperCase() + id.slice(1) }));
interface Props { patient: Patient; }
const val = (v: unknown) => v === undefined || v === null || v === '' ? '—' : String(v);
const rows = (items: Array<[string, unknown]>) => items.map(([label, value]) => ({ label, value: val(value) }));

const loadImage = async (src: string): Promise<{data: string; width: number; height: number; type: 'PNG'|'JPEG'} | null> => {
  try {
    let dataUrl = src;
    if (!/^data:image\//i.test(src)) {
      const response = await fetch(src);
      const blob = await response.blob();
      dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
      });
    }
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error('Image could not be decoded'));
      element.src = dataUrl;
    });
    return { data: dataUrl, width: image.naturalWidth || 1200, height: image.naturalHeight || 800, type: /^data:image\/png/i.test(dataUrl) ? 'PNG' : 'JPEG' };
  } catch (error) {
    console.warn('PDF image load failed', error);
    return null;
  }
};

export const ExportSummarySection: React.FC<Props> = ({ patient }) => {
  const { units, beds, showToast } = useApp();
  const [selected, setSelected] = useState<SectionKey[]>(sectionIds);
  const [copied, setCopied] = useState(false);
  const unit = units.find((item) => item.id === patient.unitId);
  const bed = beds.find((item) => item.id === patient.bedId);
  const latest = patient.vitalsHistory?.[0];

  const data = useMemo(() => {
    const p: any = patient;
    const intake = (p.fluidIntakeHistory || []).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    const output = (p.urineOutputHistory || []).reduce((sum: number, item: any) => sum + Number(item.amount || 0), 0);
    return {
      overview: rows([['MRN', p.mrn], ['Age / Sex', `${p.age} / ${p.sex}`], ['Unit / Bed', `${unit?.name || '—'} / ${bed?.bedNumber || '—'}`], ['Status', p.status], ['Primary Diagnosis', p.primaryDiagnosis], ['Code Status', p.codeStatus], ['Admission', `${p.admissionDate || '—'} ${p.admissionTime || ''}`], ['Attending Physician', p.attendingPhysician || p.attending]]),
      history: rows([['Chief Complaint', p.clinicalSummary?.chiefComplaint], ['History of Present Illness', p.clinicalSummary?.hpi], ['Past Medical History', p.clinicalSummary?.pmh?.join(', ')], ['Past Surgical History', p.clinicalSummary?.psh?.join(', ')], ['Drug History', p.clinicalSummary?.drugHistory], ['Allergies', p.allergies?.join(', ') || 'NKDA']]),
      vitals: rows([['BP', latest ? `${latest.sbp}/${latest.dbp} mmHg` : '—'], ['HR', latest ? `${latest.hr} bpm` : '—'], ['RR', latest ? `${latest.rr} /min` : '—'], ['SpO₂', latest ? `${latest.spo2}%` : '—'], ['Temperature', latest ? `${latest.temp} °C` : '—'], ['GCS', latest?.gcsTotal], ['Fluid Intake', `${intake} mL`], ['Urine Output', `${output} mL`], ['Net Balance', `${intake - output} mL`]]),
      ecg: (p.ecgRecords || []).map((r: any) => rows([['Date / Time', `${r.date || '—'} ${r.time || ''}`], ['Rate', r.heartRate || r.rate], ['Rhythm', r.rhythm], ['PR / QRS / QTc', `${r.pr || '—'} / ${r.qrs || '—'} / ${r.qtc || '—'} ms`], ['Interpretation', r.finalImpression || r.interpretation?.join('; ') || 'ECG recorded']])),
      examination: rows([['General', `${p.examination?.general?.appearance || '—'} ${p.examination?.general?.consciousness || ''}`], ['Cardiovascular', `${p.examination?.cardiovascular?.heartSounds || '—'}; Murmurs: ${p.examination?.cardiovascular?.murmurs || '—'}`], ['Respiratory', `${p.examination?.respiratory?.chestExam || '—'}; Air entry: ${p.examination?.respiratory?.airEntry || '—'}`], ['Abdomen', p.examination?.abdomen?.palpation], ['Neurological', `${p.examination?.neurological?.consciousness || '—'}; GCS ${p.examination?.neurological?.gcs || '—'}`]]),
      cardiology: rows([['Rhythm', p.cardiology?.rhythm], ['Ejection Fraction', p.cardiology?.echo?.ef ? `${p.cardiology.echo.ef}%` : undefined], ['ROMA', p.cardiology?.echo?.roma], ['Other Findings', p.cardiology?.echo?.otherFindings], ['Echo Brief Summary', p.cardiology?.echoBriefSummary], ['Cath Records', p.cardiology?.cathRecords?.length || 0], ['Biomarker Records', p.cardiology?.biomarkerRecords?.length || 0], ['Devices', p.cardiology?.devicesList?.join(', ')] ]),
      medications: (p.medications || []).map((m: any) => rows([['Medication', m.drug || m.name], ['Dose', m.dose], ['Route', m.route], ['Frequency', m.frequency], ['Indication', m.indication], ['Status', m.status || 'Active']])),
      icu: rows([['Mode', p.ventilator?.mode], ['FiO₂', p.ventilator?.fio2 ? `${p.ventilator.fio2}%` : undefined], ['PEEP', p.ventilator?.peep], ['RR', p.ventilator?.rr], ['Tidal Volume', p.ventilator?.tidalVolume], ['Plateau Pressure', p.ventilator?.plateauPressure], ['ABG Records', p.ventilator?.abgHistory?.length || 0]]),
      imaging: (p.imaging || []).map((x: any) => rows([['Date', x.date], ['Study', x.type || x.modality], ['Region', x.region || x.bodyRegion], ['Findings', x.findings], ['Impression', x.impression], ['Images', x.imageUrls?.length || x.images?.length || 0]])),
      labs: (p.labResults || p.labs || []).map((x: any) => rows([['Date / Time', x.timestamp || x.date], ['Panel', x.panel || 'Lab'], ['Test', x.testName || x.name], ['Result', `${x.value ?? x.result ?? '—'} ${x.unit || ''}`], ['Reference Range', x.referenceRange]])),
      procedures: (p.procedures || []).map((x: any) => rows([['Date / Time', `${x.date || '—'} ${x.time || ''}`], ['Procedure', x.name || x.procedure], ['Indication', x.indication], ['Performed By', x.performedBy || x.operator], ['Outcome', x.outcome]])),
      calculators: (p.calculatorResults || []).map((x: any) => rows([['Calculator', x.name], ['Result', x.score], ['Interpretation', x.interpretation]])),
      progress: (p.progressNotes || []).map((x: any) => rows([['Date / Time', `${x.date || '—'} ${x.time || ''}`], ['Author', x.author || 'Physician'], ['Assessment', x.assessment], ['Plan', x.plan || x.clinicalStatus || '—']]))
    } as Record<SectionKey, any>;
  }, [patient, unit?.name, bed?.bedNumber, latest]);

  const toggle = (id: SectionKey) => setSelected((previous) => previous.includes(id) ? previous.filter((item) => item !== id) : [...previous, id]);
  const copy = async () => {
    try { await navigator.clipboard.writeText(`[SBAR] ${patient.fullName} | ${unit?.name || 'Unit'} ${bed?.bedNumber || ''}\nDiagnosis: ${patient.primaryDiagnosis}\nStatus: ${patient.status}`); setCopied(true); showToast('SBAR copied.', 'success'); window.setTimeout(() => setCopied(false), 1800); }
    catch { showToast('Clipboard access unavailable.', 'error'); }
  };

  const exportPdf = async () => {
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4' });
      let page = 1;
      const M = 12, W = 186, B = 272;
      let y = 64;
      const logoData = await loadImage('/cardiovault-logo.svg');
      const header = () => {
        doc.setFillColor(255, 255, 255); doc.rect(0, 0, 210, 297, 'F'); doc.setDrawColor(14, 91, 112); doc.setLineWidth(0.45); doc.line(M, 31, 198, 31);
        if (logoData) doc.addImage(logoData.data, 'PNG', M, 5, 19, 19, undefined, 'FAST');
        doc.setTextColor(10, 32, 57); doc.setFont('helvetica', 'bold'); doc.setFontSize(20); doc.text('Cardio', 34, 14); doc.setTextColor(12, 151, 163); doc.text('Vault', 70, 14); doc.setTextColor(10, 32, 57); doc.setFontSize(8.7); doc.text('ICU / CCU Clinical Patient Report', 34, 21); doc.setFontSize(6.2); doc.setFont('helvetica', 'normal'); doc.setTextColor(78, 91, 101); doc.text('Medical Document', 164, 16); doc.text(`Generated: ${new Date().toLocaleString()}`, 146, 22); doc.setFont('helvetica', 'bold'); doc.setTextColor(184, 27, 34); doc.setFontSize(8.5); doc.text('CONFIDENTIAL', 164, 10);
      };
      const footer = () => { doc.setDrawColor(180, 194, 201); doc.line(M, 282, 198, 282); doc.setTextColor(53, 74, 87); doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text('CardioVault', M, 288); doc.setFont('helvetica', 'normal'); doc.text(' ICU / CCU Clinical Notebook', M + 22, 288); doc.text('Confidential Medical Document', M, 293); doc.text(`Page ${page}`, 177, 293); };
      const addPage = () => { footer(); doc.addPage(); page += 1; header(); y = 38; };
      const ensure = (height: number) => { if (y + height > B) addPage(); };
      const title = (text: string) => { ensure(15); doc.setFillColor(226, 242, 246); doc.setDrawColor(160, 195, 204); doc.roundedRect(M, y, W, 9, 1.2, 1.2, 'FD'); doc.setTextColor(8, 70, 94); doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.text(text, M + 5, y + 6); y += 12; };
      const table = (items: any) => { const groups = Array.isArray(items) && items.length && Array.isArray(items[0]) ? items : [items]; for (const group of groups) { for (const row of group) { const wrapped = doc.splitTextToSize(String(row.value), 133) as string[]; const height = Math.max(7, wrapped.length * 4.1 + 3); ensure(height); doc.setFillColor(250, 252, 253); doc.setDrawColor(215, 227, 231); doc.rect(M, y, W, height, 'FD'); doc.setFillColor(237, 247, 249); doc.rect(M, y, 43, height, 'F'); doc.setTextColor(16, 58, 77); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2); doc.text(row.label, M + 3, y + 4.7); doc.setFont('helvetica', 'normal'); doc.setTextColor(30, 44, 54); doc.text(wrapped, M + 47, y + 4.7); y += height; } y += 2.5; } };
      const addClinicalImage = async (src: string, label: string) => { const image = await loadImage(src); if (!image) return; const maxW = 176, maxH = 92, ratio = Math.min(maxW / image.width, maxH / image.height), w = image.width * ratio, h = image.height * ratio; ensure(h + 17); doc.setTextColor(9, 72, 94); doc.setFont('helvetica', 'bold'); doc.setFontSize(7.8); doc.text(label, M, y + 5); doc.addImage(image.data, image.type, M, y + 8, w, h, undefined, 'FAST'); y += h + 12; };
      header();
      doc.setFillColor(247, 250, 252); doc.setDrawColor(188, 205, 212); doc.roundedRect(M, 37, W, 24, 2, 2, 'FD'); doc.setTextColor(8, 31, 54); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.text(patient.fullName || 'Unnamed Patient', M + 6, 46); doc.setFontSize(7.7); doc.setFont('helvetica', 'normal'); doc.text(`MRN: ${val(patient.mrn)}    Age: ${val(patient.age)}    Sex: ${val(patient.sex)}`, M + 6, 52); doc.text(`Unit: ${unit?.name || '—'}    Bed: ${bed?.bedNumber || '—'}    Admission: ${val(patient.admissionDate)} ${val(patient.admissionTime)}`, M + 6, 57); doc.setTextColor(166, 25, 30); doc.setFont('helvetica', 'bold'); doc.text(String(patient.status || 'Active'), M + 158, 46);
      for (const id of selected) { title(sections.find((section) => section.id === id)?.label || id); const value = data[id]; if (Array.isArray(value)) table(value.length ? value : [{label: 'Record', value: 'No records documented.'}]); else table(value); if (id === 'ecg') for (let i = 0; i < (patient.ecgRecords || []).length; i += 1) { const record: any = (patient.ecgRecords || [])[i]; const images = record.imageUrls || []; for (let j = 0; j < images.length; j += 1) await addClinicalImage(images[j], `ECG ${i + 1} — Image ${j + 1}`); } if (id === 'imaging') for (let i = 0; i < (patient.imaging || []).length; i += 1) { const study: any = (patient.imaging || [])[i]; const images = study.imageUrls || study.images || []; for (let j = 0; j < images.length; j += 1) await addClinicalImage(images[j], `Imaging ${i + 1} — Image ${j + 1}`); } }
      footer(); doc.save(`CardioVault_${String(patient.fullName || 'Patient').replace(/[^a-z0-9]+/gi, '_')}_${String(patient.mrn || '').replace(/\s+/g, '_')}.pdf`); showToast('Clinical PDF exported with CardioVault header and embedded ECG/imaging images.', 'success');
    } catch (error) { console.error(error); showToast('Unable to generate the PDF. Please try again.', 'error'); }
  };

  return <div className="space-y-5 max-w-5xl mx-auto animate-in fade-in duration-150"><div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><FileText className="w-5 h-5 text-cyan-500" /> Clinical Patient PDF</h2><p className="text-xs text-slate-500 dark:text-slate-400">Patient identity is always included. CardioVault clinical branding is repeated on every page. ECG and imaging uploads are embedded as images inside their sections.</p></div><div className="flex flex-wrap gap-2"><button onClick={() => setSelected(sectionIds)} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">Select All</button><button onClick={() => setSelected([])} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">Deselect All</button><button onClick={copy} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs">{copied ? <Check className="inline w-3.5 h-3.5" /> : <Copy className="inline w-3.5 h-3.5" />} SBAR</button><button onClick={() => window.print()} className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs"><Printer className="inline w-3.5 h-3.5" /> Print</button><button disabled={!selected.length} onClick={exportPdf} className="px-3 py-1.5 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold disabled:opacity-40"><FileDown className="inline w-3.5 h-3.5" /> Export PDF</button></div></div><div className="grid grid-cols-1 md:grid-cols-3 gap-4"><div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-4 space-y-2"><h3 className="text-xs font-bold text-slate-400 uppercase">PDF Sections</h3>{sections.map((section) => <label key={section.id} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300"><input type="checkbox" checked={selected.includes(section.id)} onChange={() => toggle(section.id)} />{section.label}</label>)}<div className="pt-3 mt-2 border-t border-slate-200 dark:border-slate-800 text-[11px] text-slate-400 flex items-center gap-1.5"><ImageIcon className="w-3.5 h-3.5" /> ECG/Imaging uploads are embedded directly in the generated PDF.</div></div><div className="md:col-span-2 bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5"><h3 className="text-sm font-bold text-slate-900 dark:text-white mb-3">Clinical Form Preview</h3><div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden"><div className="p-4 border-b bg-slate-50 dark:bg-slate-900"><div className="flex items-center gap-3"><img src="/cardiovault-logo.svg" className="w-10 h-10 object-contain rounded-lg bg-[#020514]" /><div><div className="font-bold text-lg text-slate-900 dark:text-white">CardioVault</div><div className="text-xs text-slate-500">ICU / CCU Clinical Patient Report</div></div></div><div className="font-bold text-base text-slate-900 dark:text-white mt-3">{patient.fullName}</div><div className="text-xs text-slate-500">MRN {val(patient.mrn)} • {val(patient.age)} / {val(patient.sex)} • {unit?.name || '—'} / {bed?.bedNumber || '—'}</div></div>{selected.map((id) => <div key={id} className="p-4 border-b border-slate-100 dark:border-slate-800"><div className="text-[10px] font-bold uppercase tracking-wider text-cyan-600 dark:text-cyan-400">{sections.find((section) => section.id === id)?.label}</div><div className="text-xs text-slate-500 mt-1">Structured clinical section • {Array.isArray(data[id]) ? data[id].length : 1} record block(s)</div>{(id === 'ecg' || id === 'imaging') && <div className="text-[11px] text-slate-400 mt-1">Images are placed directly into the generated PDF.</div>}</div>)}</div></div></div></div>;
};
