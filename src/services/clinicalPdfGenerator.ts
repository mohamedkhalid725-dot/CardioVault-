import { jsPDF } from 'jspdf';
import { Patient, Unit, Bed } from '../types/clinical';
import { installArabicTextSupport } from './pdfArabicSupport';

export type ClinicalPdfSection =
  | 'identity' | 'history' | 'vitals' | 'examination' | 'ecg' | 'labs'
  | 'imaging' | 'echo' | 'cardiology' | 'medications' | 'course'
  | 'timeline' | 'problems' | 'summary' | 'missing' | 'discrepancies';

export interface ClinicalPdfOptions {
  sections: ClinicalPdfSection[];
  unit?: Unit;
  bed?: Bed;
  reportTitle?: string;
  departmentLabel?: string;
  hospitalLabel?: string;
}

const NAVY: [number, number, number] = [31, 61, 137];
const BLUE: [number, number, number] = [45, 103, 219];
const INK: [number, number, number] = [35, 45, 58];
const MUTED: [number, number, number] = [94, 108, 123];
const GRID: [number, number, number] = [214, 222, 230];
const PALE: [number, number, number] = [246, 248, 251];
const WHITE: [number, number, number] = [255, 255, 255];
const WARN: [number, number, number] = [245, 184, 60];
const DANGER: [number, number, number] = [225, 72, 72];
const GREEN: [number, number, number] = [62, 132, 215];

const s = (v: any, fallback = 'Not provided'): string => {
  if (v === undefined || v === null || v === '') return fallback;
  if (Array.isArray(v)) return v.length ? v.map(x => String(x)).join(', ') : fallback;
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  return String(v);
};
const dateTime = (date?: string, time?: string) => [date, time].filter(Boolean).join(' ') || 'Not provided';
const latest = <T,>(items?: T[]) => items && items.length ? items[items.length - 1] : undefined;
const unique = (items: string[]) => Array.from(new Set(items.filter(Boolean)));

export function generateClinicalCasePdf(patient: Patient, options: ClinicalPdfOptions): Blob {
  const selected = new Set(options.sections);
  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  installArabicTextSupport(doc);

  const M = 13;
  const W = 184;
  const RIGHT = 197;
  const TOP = 39;
  const BOTTOM = 277;
  let page = 0;
  let sectionNo = 0;

  const fill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const draw = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);
  const ink = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);

  const header = () => {
    fill(NAVY); doc.rect(0, 0, 210, 31, 'F');
    fill(WHITE); doc.roundedRect(M, 7, 5, 17, 1.2, 1.2, 'F');
    draw([180, 215, 255]); doc.setLineWidth(0.8);
    doc.line(M + 1, 16, M + 2.5, 16); doc.line(M + 2.5, 16, M + 3.4, 12);
    doc.line(M + 3.4, 12, M + 4.7, 20); doc.line(M + 4.7, 20, M + 6.2, 14);
    doc.line(M + 6.2, 14, M + 7.4, 16);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(17); ink(WHITE);
    doc.text('CardioVault', M + 10, 14.5);
    doc.setFontSize(8.5); ink([190, 220, 245]);
    doc.text(options.reportTitle || 'CCU / CARDIOLOGY CASE PRESENTATION', M + 10, 21);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8);
    doc.text(options.hospitalLabel || options.departmentLabel || 'Department Clinical Record', M + 10, 26);

    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); ink([190, 220, 245]);
    doc.text('CONFIDENTIAL', 166, 11);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.3);
    doc.text('Clinical Medical Record', 166, 17);
    doc.text('Generated ' + new Date().toLocaleDateString(), 166, 23);
  };

  const footer = () => {
    draw([215, 220, 226]); doc.setLineWidth(0.3); doc.line(M, 282, RIGHT, 282);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); ink(MUTED);
    doc.text((options.hospitalLabel || 'CardioVault') + ' - ' + (options.departmentLabel || 'CCU Department'), M, 288);
    doc.text('Confidential Medical Record', M, 293);
    doc.setFont('helvetica', 'bold'); ink(NAVY);
    doc.text('Page ' + page + ' of ' + doc.getNumberOfPages(), RIGHT - 25, 293);
  };

  const newPage = () => {
    if (page > 0) footer();
    doc.addPage(); page += 1; header();
    return TOP;
  };

  let y = newPage();

  const ensure = (height: number) => {
    if (y + height <= BOTTOM) return;
    y = newPage();
  };

  const title = (label: string) => {
    // Keep the section title with the first content block.
    ensure(28); sectionNo += 1;
    fill(WHITE); draw(BLUE); doc.setLineWidth(1.4); doc.line(M, y, M, y + 8);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10); ink(NAVY);
    doc.text(sectionNo + '. ' + label.toUpperCase(), M + 4, y + 6);
    y += 12;
  };

  const paragraph = (label: string, value: any, accent: 'normal' | 'warning' | 'danger' = 'normal') => {
    const valueText = s(value);
    const lines = doc.splitTextToSize(valueText, W - 10) as string[];
    const h = Math.max(14, 9 + lines.length * 3.8);
    ensure(h + 2);
    fill(accent === 'warning' ? [255, 250, 231] : accent === 'danger' ? [255, 241, 241] : WHITE);
    draw(accent === 'warning' ? WARN : accent === 'danger' ? DANGER : GRID);
    doc.roundedRect(M, y, W, h, 1.2, 1.2, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.2);
    ink(accent === 'warning' ? [151, 105, 10] : accent === 'danger' ? [157, 45, 45] : NAVY);
    doc.text(label, M + 4, y + 5);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(8); ink(INK);
    doc.text(lines, M + 4, y + 9);
    y += h + 3;
  };

  const bullets = (items: string[], accent: 'normal' | 'warning' | 'danger' = 'normal') => {
    const clean = unique(items);
    if (!clean.length) return;
    for (const item of clean) paragraph('•', item, accent);
  };

  const table = (headers: string[], rows: string[][], widths?: number[]) => {
    if (!rows.length) return;
    const ws = widths || headers.map(() => W / headers.length);
    const drawHeader = () => {
      fill(NAVY); draw(NAVY); let x = M;
      headers.forEach((h, i) => {
        doc.rect(x, y, ws[i], 7, 'F');
        doc.setFont('helvetica', 'bold'); doc.setFontSize(6.8); ink(WHITE);
        doc.text(h, x + 2, y + 4.7); x += ws[i];
      });
      y += 7;
    };
    const rowHeight = (row: string[]) => {
      const cells = row.map((v, i) => doc.splitTextToSize(v || 'Not provided', ws[i] - 4) as string[]);
      return Math.max(7, ...cells.map(c => c.length * 3.2 + 3));
    };
    // Keep the table header with its first row.
    if (y + 7 + rowHeight(rows[0]) > BOTTOM) y = newPage();
    drawHeader();
    for (const row of rows) {
      const cells = row.map((v, i) => doc.splitTextToSize(v || 'Not provided', ws[i] - 4) as string[]);
      const h = Math.max(7, ...cells.map(c => c.length * 3.2 + 3));
      if (y + h > BOTTOM) { y = newPage(); drawHeader(); }
      let x = M;
      cells.forEach((lines, i) => {
        fill(PALE); draw(GRID); doc.rect(x, y, ws[i], h, 'FD');
        doc.setFont('helvetica', 'normal'); doc.setFontSize(6.8); ink(INK);
        doc.text(lines, x + 2, y + 4.2); x += ws[i];
      });
      y += h;
    }
    y += 4;
  };

  const patientBanner = () => {
    ensure(28);
    fill([249, 250, 252]); draw(GRID); doc.roundedRect(M, y, W, 25, 1.5, 1.5, 'FD');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(13); ink(NAVY);
    doc.text(s(patient.fullName, 'Unnamed Patient'), M + 5, y + 8);
    doc.setFont('helvetica', 'normal'); doc.setFontSize(7.3); ink(INK);
    doc.text('Age: ' + s(patient.age) + '  |  Sex: ' + s(patient.sex) + '  |  MRN: ' + s(patient.mrn), M + 5, y + 14);
    doc.text('Admission: ' + dateTime(patient.admissionDate, patient.admissionTime) + '  |  Unit: ' + s(options.unit?.name) + '  |  Bed: ' + s(options.bed?.bedNumber), M + 5, y + 19);
    fill(BLUE); doc.roundedRect(RIGHT - 31, y + 5, 25, 7, 2, 2, 'F');
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.7); ink(WHITE);
    doc.text(s(patient.status, 'ACTIVE').toUpperCase(), RIGHT - 28.5, y + 9.5);
    y += 29;
  };

  const identity = () => {
    title('Patient Identification');
    table(['PARAMETER', 'VALUE', 'SOURCE / RECORD'], [
      ['Patient Name', s(patient.fullName), 'Patient File'],
      ['Age', s(patient.age) + ' years', 'Patient File'],
      ['Sex', s(patient.sex), 'Patient File'],
      ['Bed Number', s(options.bed?.bedNumber), 'Department / Unit'],
      ['Date & Time of Admission', dateTime(patient.admissionDate, patient.admissionTime), 'Admission Record'],
      ['File / MRN', s(patient.mrn), 'Patient File'],
      ['Primary Diagnosis', s(patient.primaryDiagnosis), 'Patient File'],
      ['Status', s(patient.status), 'Patient File'],
    ], [43, 86, 55]);
  };

  const history = () => {
    const c = patient.clinicalSummary;
    title('Chief Complaint');
    paragraph('Main Complaint', c?.chiefComplaint);
    title('History of Present Illness');
    paragraph('HPI', c?.hpi);
    title('Past Medical History');
    bullets((c?.pmh || []).map(x => s(x)));
    title('Past Cardiac History');
    const ch = patient.cardiovascularHistory;
    bullets([
      ch?.hypertension ? 'Hypertension (HTN)' : '',
      ch?.diabetes ? 'Diabetes Mellitus (DM)' : '',
      ch?.dyslipidemia ? 'Dyslipidemia' : '',
      ch?.cad ? 'Coronary artery disease (CAD)' : '',
      ch?.previousMI ? 'Previous myocardial infarction (MI)' : '',
      ch?.heartFailure ? 'Heart failure' : '',
      ch?.arrhythmias ? 'Arrhythmias' : '',
      ch?.valvularDisease ? 'Valvular heart disease' : '',
      ch?.previousPCI ? 'Previous PCI' : '',
      ch?.previousCABG ? 'Previous CABG' : '',
      ch?.previousStroke ? 'Previous stroke / CVA' : '',
      ch?.pvd ? 'Peripheral vascular disease' : '',
      ch?.smoking ? 'Smoking' : '',
      ch?.alcohol ? 'Alcohol intake' : '',
    ]);
    if (ch?.previousAdmissions || ch?.previousICU || ch?.other) {
      paragraph('Previous Admissions / Other', [
        ch.previousAdmissions ? 'Previous admissions: ' + ch.previousAdmissions : '',
        ch.previousICU ? 'Previous ICU: ' + ch.previousICU : '',
        ch.other ? 'Other: ' + ch.other : '',
      ].filter(Boolean).join('\n'));
    }
    title('Surgical / Procedure History');
    bullets((c?.psh || []).map(x => s(x)));
    title('Drug History / Home Medications');
    paragraph('Home Medication History', c?.drugHistory);
    title('Allergy History');
    paragraph('Documented Allergies', (c?.allergies || []).join(', ') || 'No documented allergies');
    title('Social History');
    paragraph('Social History', c?.socialHistory);
    title('Family History');
    paragraph('Family History', c?.familyHistory);
  };

  const vitals = () => {
    title('Vital Signs on Admission / Latest');
    const first = patient.vitalsHistory?.[0];
    const last = latest(patient.vitalsHistory);
    const v = first || last;
    if (v) {
      table(['PARAMETER', 'ADMISSION / LATEST VALUE', 'STATUS / REFERENCE'], [
        ['Blood Pressure (BP)', s(v.sbp) + ' / ' + s(v.dbp) + ' mmHg', 'Recorded'],
        ['Heart Rate (HR)', s(v.hr) + ' bpm', 'Recorded'],
        ['Respiratory Rate (RR)', s(v.rr) + ' /min', 'Recorded'],
        ['Oxygen Saturation (SpO₂)', s(v.spo2) + '%', 'Recorded'],
        ['Temperature', s(v.temp) + ' °C', Number(v.temp) >= 38 ? 'FEVERISH' : 'Recorded'],
        ['Glasgow Coma Scale (GCS)', s(v.gcsTotal) + ' /15', 'Recorded'],
        ['Pain', s(v.pain), 'Recorded when documented'],
      ], [60, 64, 60]);
    }
    if (patient.vitalsHistory?.length) {
      table(['DATE / TIME', 'BP', 'HR', 'RR', 'SpO₂', 'TEMP', 'GCS'],
        patient.vitalsHistory.slice(-12).map(vr => [
          dateTime(vr.timestamp, ''),
          s(vr.sbp) + '/' + s(vr.dbp),
          s(vr.hr), s(vr.rr), s(vr.spo2), s(vr.temp), s(vr.gcsTotal),
        ]), [34, 28, 20, 20, 22, 25, 35]);
    }
    const fluids = patient.fluidRecords || [];
    const fluid = latest(fluids);
    if (fluid || patient.fluidIntakeHistory?.length || patient.urineOutputHistory?.length) {
      table(['FLUID BALANCE', 'VALUE', 'DATE / TIME'], [
        ['Total Intake', s(fluid?.totalIntake, 'Not documented') + ' mL', dateTime(fluid?.date, fluid?.timestamp)],
        ['Total Output', s(fluid?.totalOutput, 'Not documented') + ' mL', dateTime(fluid?.date, fluid?.timestamp)],
        ['Urine Output', s(fluid?.urineOutput, 'Not documented') + ' mL', dateTime(fluid?.date, fluid?.timestamp)],
        ['Net Balance', s(fluid?.netBalance, 'Not documented') + ' mL', dateTime(fluid?.date, fluid?.timestamp)],
      ], [48, 60, 76]);
    }
  };

  const examination = () => {
    title('Physical Examination on Admission / Latest');
    const e = patient.examination;
    table(['SYSTEM', 'DOCUMENTED FINDINGS'], [
      ['General Appearance', [e?.general?.appearance, e?.general?.consciousness, e?.general?.distress].filter(Boolean).join('; ')],
      ['Cardiovascular', [e?.cardiovascular?.heartSounds, e?.cardiovascular?.murmurs, e?.cardiovascular?.perfusion].filter(Boolean).join('; ')],
      ['Respiratory', [e?.respiratory?.chestExam, e?.respiratory?.airEntry, e?.respiratory?.addedSounds].filter(Boolean).join('; ')],
      ['Abdomen', [e?.abdomen?.palpation, e?.abdomen?.tenderness, e?.abdomen?.organomegaly, e?.abdomen?.ascites].filter(Boolean).join('; ')],
      ['Neurological', [e?.neurological?.consciousness, e?.neurological?.gcs, e?.neurological?.motor, e?.neurological?.sensory].filter(Boolean).join('; ')],
      ['Extremities', [e?.extremities?.pulses, e?.extremities?.edema, e?.extremities?.perfusion].filter(Boolean).join('; ')],
    ], [50, 134]);
    if (e?.customFields?.length) table(['FINDING', 'VALUE'], e.customFields.map(x => [s(x.label), s(x.value)]), [70, 114]);
  };

  const ecg = () => {
    title('Electrocardiogram (ECG)');
    const e = latest(patient.ecgRecords);
    if (!e) { paragraph('ECG', 'No ECG record documented.'); return; }
    table(['PARAMETER', 'DOCUMENTED FINDING'], [
      ['Date / Time', dateTime(e.date, e.time)],
      ['Rhythm', s(e.rhythm)], ['Heart Rate', s(e.heartRate) + ' bpm'],
      ['Regularity', s(e.regularity)], ['Axis', s(e.axis)],
      ['PR / QRS / QT / QTc', [e.pr, e.qrs, e.qt, e.qtc].map(x => s(x)).join(' / ')],
      ['ST Segment', s(e.stSegment)], ['T Wave', s(e.tWave)],
      ['QRS Findings', s(e.qrsFindings)], ['Other Findings', s(e.otherFindings)],
      ['Final Impression', s(e.finalImpression)],
    ], [48, 136]);
    if (e.interpretation?.length) bullets(e.interpretation);
  };

  const labs = () => {
    title('Laboratory Investigations');
    const rows: string[][] = [];
    for (const panel of (patient.labs || []).slice(-2)) {
      const add = (category: string, name: string, value: any, unit: string, note?: string) => {
        if (value !== undefined && value !== null && value !== '') rows.push([category, name, s(value), unit || '—', note || 'Documented']);
      };
      add('CBC / Coagulation', 'Hemoglobin', panel.hb, '', 'CBC');
      add('CBC / Coagulation', 'WBC', panel.wbc, '', 'CBC');
      add('CBC / Coagulation', 'Platelets', panel.platelets, '', 'CBC');
      add('Renal / Electrolytes', 'Creatinine', panel.creatinine, 'mg/dL', 'Renal function');
      add('Renal / Electrolytes', 'Potassium', panel.k, 'mEq/L', Number(panel.k) >= 6 ? 'High / clinically important' : 'Recorded');
      add('Renal / Electrolytes', 'Sodium', panel.na, 'mEq/L');
      add('Cardiac Biomarkers', 'Troponin', panel.troponin, '', 'Cardiac biomarker');
      add('Cardiac Biomarkers', 'CK-MB', panel.ckmb, '', 'Cardiac biomarker');
      add('Inflammation', 'CRP', panel.crp, '', 'Inflammatory marker');
      add('Inflammation', 'ESR', panel.esr, '', 'Inflammatory marker');
      add('Liver Function', 'AST', panel.ast, 'U/L');
      add('Liver Function', 'ALT', panel.alt, 'U/L');
      add('Liver Function', 'Bilirubin', panel.bilirubin, '');
      add('Liver Function', 'Albumin', panel.albumin, 'g/dL');
      add('Metabolic', 'Glucose', panel.glucose, '');
      add('Metabolic', 'Lactate', panel.lactate, 'mmol/L');
      for (const custom of panel.customLabs || []) add('Custom', custom.name, custom.value, custom.unit, custom.referenceRange);
    }
    table(['TEST CATEGORY', 'TEST NAME', 'RESULT', 'UNIT', 'CLINICAL NOTE'], rows, [35, 39, 31, 23, 56]);
    title('Serial Laboratory Results');
    table(['DATE', 'TROPONIN', 'CRP', 'CREATININE', 'K⁺', 'OTHER / NOTES'],
      (patient.labs || []).map(p => [
        s(p.date), s(p.troponin), s(p.crp), s(p.creatinine), s(p.k),
        [p.hb, p.wbc, p.platelets].some(v => v !== undefined && v !== null) ? 'CBC documented' : '—',
      ]), [28, 29, 27, 32, 25, 43]);
  };

  const imaging = () => {
    title('Radiological Investigations');
    if (!patient.imaging?.length) { paragraph('Imaging', 'No imaging study documented.'); return; }
    for (const study of patient.imaging) {
      paragraph((s(study.type || study.modality, 'Imaging') + (study.bodyRegion || study.region ? ' — ' + s(study.bodyRegion || study.region) : '')), [
        study.indication ? 'Indication: ' + study.indication : '',
        study.findings ? 'Findings: ' + study.findings : '',
        study.impression ? 'Impression: ' + study.impression : '',
        study.notes ? 'Notes: ' + study.notes : '',
      ].filter(Boolean).join('\n'));
    }
  };

  const echo = () => {
    title('Echocardiography');
    const e = patient.cardiology?.echo;
    if (!e) { paragraph('Echo', 'No echocardiographic data documented.'); return; }
    table(['ECHOCARDIOGRAPHIC PARAMETER', 'DOCUMENTED FINDING'], [
      ['Left Ventricular Ejection Fraction (LVEF)', e.ef !== undefined ? s(e.ef) + '%' : 'Not provided'],
      ['LV Dimensions / Geometry', s(e.lvDimensions)],
      ['LV Function', s(e.lvFunction)], ['RWMA', s(e.rwma)],
      ['Right Ventricular Function', s(e.rvFunction)],
      ['Left / Right Atrium', [s(e.la), s(e.ra)].join(' / ')],
      ['Valvular Assessment', [e.mr, e.ar, e.as, e.ms, e.tr, e.pr].map(x => s(x, '')).filter(Boolean).join('; ') || 'Not provided'],
      ['Pulmonary Artery Pressure', e.pasp !== undefined ? s(e.pasp) + ' mmHg' : 'Not provided'],
      ['IVC', s(e.ivc)], ['Pericardium', s(e.pericardium)],
      ['Other Findings', s(e.otherFindings)],
    ], [58, 126]);
    paragraph('Echo Summary', patient.cardiology?.echoBriefSummary);
  };

  const cardiology = () => {
    title('Coronary Angiography / PCI');
    const c = patient.cardiology?.coronary;
    table(['PARAMETER', 'DOCUMENTED INFORMATION'], [
      ['Coronary Angiography', s(c?.cath)], ['Coronary Findings', s(c?.coronaryFindings)],
      ['PCI', s(c?.pci)], ['Stent', s(c?.stent)], ['CABG', s(c?.cabg)],
    ], [58, 126]);
    title('Cardiac History / Risk Profile');
    const h = patient.cardiovascularHistory;
    bullets([
      h?.cad ? 'Coronary artery disease documented.' : '',
      h?.previousMI ? 'Previous MI documented.' : '',
      h?.previousPCI ? 'Previous PCI documented.' : '',
      h?.heartFailure ? 'Heart failure documented.' : '',
      h?.arrhythmias ? 'Arrhythmia history documented.' : '',
      h?.valvularDisease ? 'Valvular heart disease documented.' : '',
      h?.previousCABG ? 'Previous CABG documented.' : '',
    ]);
    title('Antithrombotic Therapy');
    const a = patient.cardiology?.antithrombotic;
    table(['THERAPY', 'DOCUMENTED'], [
      ['Antiplatelet', s(a?.antiplatelet)], ['Anticoagulation', s(a?.anticoagulation)], ['Thrombolysis', s(a?.thrombolysis)],
    ], [58, 126]);
  };

  const medications = () => {
    title('Current In-Hospital Medications');
    const meds = (patient.medications || []).filter(m => m.status !== 'Discontinued');
    table(['MEDICATION', 'DOSE', 'ROUTE', 'FREQUENCY', 'INDICATION'], meds.map(m => [
      s(m.name || m.drug), [s(m.dose), s(m.doseUnit, '')].filter(Boolean).join(' '), s(m.route), s(m.frequency), s(m.indication),
    ]), [46, 27, 23, 35, 53]);
    if (patient.infusions?.length) {
      title('Current Infusions');
      table(['DRUG', 'DOSE', 'UNIT', 'RATE', 'LINE / NOTES'], patient.infusions.map(i => [
        s(i.drugName), s(i.dose), s(i.unit), s(i.rateMlHr) + ' mL/hr', [i.concentration, i.carrierFluid, i.lineSite].filter(Boolean).join(' / '),
      ]), [45, 25, 24, 29, 61]);
    }
  };

  const course = () => {
    title('Hospital Course');
    const notes = [...(patient.progressNotes || [])].sort((a, b) => dateTime(a.date, a.time).localeCompare(dateTime(b.date, b.time)));
    if (!notes.length) { paragraph('Hospital Course', 'No progress notes documented.'); return; }
    for (const n of notes) {
      const body = [
        n.subjective ? 'Subjective: ' + n.subjective : '',
        n.objective ? 'Objective: ' + n.objective : '',
        n.assessment ? 'Assessment: ' + n.assessment : '',
        n.investigations ? 'Investigations: ' + n.investigations : '',
        n.treatment ? 'Treatment: ' + n.treatment : '',
        n.response ? 'Response: ' + n.response : '',
        n.plan ? 'Plan: ' + n.plan : '',
        n.events ? 'Events: ' + n.events : '',
      ].filter(Boolean).join('\n');
      paragraph(dateTime(n.date, n.time) + ' — ' + s(n.author, 'Clinical Note'), body || n.plan || n.assessment);
    }
  };

  const timeline = () => {
    title('Important Events Timeline');
    const events = patient.timelineEvents?.length
      ? patient.timelineEvents
      : (patient.auditTrail || []).map(e => ({ timestamp: e.timestamp, title: e.action, summary: '', author: e.actor || '' }));
    table(['DATE / TIME', 'CLINICAL EVENT', 'ACTION / DETAILS', 'RESULT / OUTCOME'],
      events.map((e: any) => [
        s(e.timestamp), s(e.title || e.action), s(e.summary || e.details || ''), s(e.author, ''),
      ]), [31, 43, 66, 44]);
  };

  const problems = () => {
    title('Problem List');
    if (patient.problems?.length) {
      table(['#', 'PROBLEM', 'STATUS', 'PRIORITY / NOTES'], patient.problems.map((p, i) => [
        String(i + 1), s(p.problem), s(p.status), s(p.priority) + (p.notes ? ' — ' + p.notes : ''),
      ]), [10, 76, 34, 64]);
    } else {
      const documented = [patient.primaryDiagnosis, ...(patient.secondaryDiagnoses || [])].filter(Boolean);
      table(['#', 'DOCUMENTED DIAGNOSIS / PROBLEM'], documented.map((p, i) => [String(i + 1), p]), [10, 174]);
    }
  };

  const summary = () => {
    title('Final Case Summary');
    const c = patient.clinicalSummary;
    const parts = [
      patient.fullName + ', ' + s(patient.age) + '-year-old ' + s(patient.sex).toLowerCase() + '.',
      'Primary diagnosis: ' + s(patient.primaryDiagnosis) + '.',
      (patient.secondaryDiagnoses || []).length ? 'Secondary diagnoses: ' + patient.secondaryDiagnoses.join(', ') + '.' : '',
      c?.chiefComplaint ? 'Chief complaint: ' + c.chiefComplaint + '.' : '',
      c?.hpi ? 'History of present illness: ' + c.hpi : '',
      patient.handover?.assessment ? 'Assessment: ' + patient.handover.assessment : '',
      patient.handover?.recommendation ? 'Recommendation: ' + patient.handover.recommendation : '',
    ].filter(Boolean);
    paragraph('Clinical Summary', parts.join('\n'));
  };

  const missing = () => {
    const missingFields: string[] = [];
    const checks: Array<[string, any]> = [
      ['Chief complaint', patient.clinicalSummary?.chiefComplaint],
      ['History of present illness', patient.clinicalSummary?.hpi],
      ['Past medical history', patient.clinicalSummary?.pmh?.length],
      ['Home medication history', patient.clinicalSummary?.drugHistory],
      ['Allergy history', patient.clinicalSummary?.allergies?.length],
      ['Social history', patient.clinicalSummary?.socialHistory],
      ['Family history', patient.clinicalSummary?.familyHistory],
      ['Admission vitals', patient.vitalsHistory?.length],
      ['Physical examination', patient.examination],
      ['ECG', patient.ecgRecords?.length],
      ['Laboratory results', patient.labs?.length],
      ['Imaging', patient.imaging?.length],
      ['Echocardiography', patient.cardiology?.echo],
      ['Current medications', patient.medications?.length],
      ['Progress notes', patient.progressNotes?.length],
    ];
    checks.forEach(([label, value]) => {
      if (value === undefined || value === null || value === '' || value === 0 || (Array.isArray(value) && value.length === 0)) {
        missingFields.push(label + ' — not provided in the patient record.');
      }
    });
    title('Missing / Unavailable Information');
    bullets(missingFields, 'warning');
    if (!missingFields.length) paragraph('Data Completeness', 'No empty required clinical category was detected from the selected patient record.');
  };

  const discrepancies = () => {
    const rows = (patient.corrections || []).map(c => [
      dateTime(c.timestamp, ''),
      s(c.recordType),
      s(c.fieldName),
      s(c.originalValue),
      s(c.correctedValue),
      s(c.reason),
    ]);
    title('Data Discrepancies / Corrections');
    if (rows.length) {
      table(['DATE / TIME', 'RECORD', 'FIELD', 'ORIGINAL', 'CORRECTED', 'REASON'], rows, [26, 25, 30, 32, 32, 39]);
    } else {
      paragraph('Recorded discrepancies', 'No formal correction/discrepancy entries are stored in the patient record. The report does not infer discrepancies from missing or conflicting external documents.');
    }
  };

  // Keep the source-template order used by the supplied case presentation.
  if (selected.has('identity')) { patientBanner(); identity(); }
  if (selected.has('history')) history();
  if (selected.has('vitals')) vitals();
  if (selected.has('examination')) examination();
  if (selected.has('ecg')) ecg();
  if (selected.has('labs')) labs();
  if (selected.has('imaging')) imaging();
  if (selected.has('echo')) echo();
  if (selected.has('cardiology')) cardiology();
  if (selected.has('medications')) medications();
  if (selected.has('course')) course();
  if (selected.has('timeline')) timeline();
  if (selected.has('problems')) problems();
  if (selected.has('summary')) summary();
  if (selected.has('missing')) missing();
  if (selected.has('discrepancies')) discrepancies();

  footer();
  const total = doc.getNumberOfPages();
  for (let i = 1; i <= total; i += 1) {
    doc.setPage(i);
    doc.setFont('helvetica', 'bold'); doc.setFontSize(6.6); ink(NAVY);
    doc.text('Page ' + i + ' of ' + total, RIGHT - 25, 293);
  }
  return doc.output('blob') as Blob;
}
