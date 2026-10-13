import React, { useEffect, useState } from 'react';
import { jsPDF } from 'jspdf';
import { FileDown, Eye, Loader2 } from 'lucide-react';
import { getDocument, GlobalWorkerOptions } from 'pdfjs-dist';
import pdfWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

GlobalWorkerOptions.workerSrc = pdfWorker;
import { Patient } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';
import { Capacitor } from '@capacitor/core';
import { Directory, Filesystem } from '@capacitor/filesystem';
import { installArabicTextSupport } from '../../../services/pdfArabicSupport';

// CCU case-presentation template: toggle groups mapped to the 25 numbered sections.
const sections = [
  ['identification', 'Identification & Admission (§1–2)'],
  ['history', 'History (§3–11)'],
  ['vitals-exam', 'Vitals & Examination (§12–13)'],
  ['ecg', 'ECG (§14)'],
  ['labs', 'Laboratory (§15–16)'],
  ['imaging-cardiology', 'Imaging & Cardiology (§17–19)'],
  ['medications', 'Medications (§8, §20)'],
  ['icu-procedures', 'ICU & Procedures (§21–22)'],
  ['course-plan', 'Course, Timeline & Plan (§23–25)'],
] as const;

const NP = 'Not provided';

// Recorded-values-only rule (locked): anything unrecorded is omitted from the
// PDF entirely — no "Not provided" rows, cells, or sections, even when the
// section toggle is on. A fully-empty section (title + no content) vanishes.
const isBlankRendered = (s: any): boolean => {
  const str = String(s ?? '').trim();
  if (!str || str === NP || str === '—' || str === '-') return true;
  // Slash-joined composites ("Not provided / Not provided") and
  // space-joined leftovers ("Not provided Not provided").
  const withoutNp = str.split(NP).join('').replace(/[/•·:;|—–-]+/g, ' ').trim();
  if (!withoutNp) return true;
  return str.split('/').every(part => {
    const t = part.trim();
    return !t || t === '—' || t === '-' || t.startsWith(NP);
  });
};

// App icon (public/cardiovault-logo.svg, same asset as the in-app CardioLogo)
// rasterized at runtime so jsPDF can embed it in the header. Null on failure
// so the header falls back to a drawn tile — the PDF never breaks.
const loadLogoDataUrl = (): Promise<string | null> => new Promise(resolve => {
  try {
    const img = new Image();
    img.onload = () => {
      try {
        const size = 256;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) { resolve(null); return; }
        ctx.drawImage(img, 0, 0, size, size);
        resolve(canvas.toDataURL('image/png'));
      } catch { resolve(null); }
    };
    img.onerror = () => resolve(null);
    img.src = '/cardiovault-logo.svg';
  } catch { resolve(null); }
});

const val = (v: any, fallback = NP) => {
  if (v === undefined || v === null || v === '') return fallback;
  if (Array.isArray(v)) return v.length ? v.join(', ') : fallback;
  return String(v);
};

const compact = (v: any, max = 90) => {
  const s = val(v, '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

const nonEmpty = (v: any) => v !== undefined && v !== null && v !== '' && !(Array.isArray(v) && !v.length);

// Bed numbers are stored as "Bed 1" — strip a leading "Bed" so callers can
// safely prefix their own ("Bed 1", never "Bed Bed 1").
const bedLabel = (b: any) => {
  const s = val(b?.bedNumber, '');
  if (!s) return NP;
  return s.replace(/^bed\s+/i, '') || NP;
};

// MRN values are stored as "MRN-xxx" — strip a leading "MRN" so callers can
// safely prefix their own ("MRN 754854", never "MRN MRN-754854").
const mrnLabel = (m: any) => {
  const s = val(m, '');
  if (!s) return NP;
  return s.replace(/^mrn[\s\-:]*/i, '').trim() || NP;
};

// Vitals-like numbers: 0/empty/non-numeric all render as missing, so the PDF
// never prints a clinically misleading "0 kg / 0 cm".
const posNum = (v: any) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? String(v) : '';
};

type Badge = { t: string; kind: 'rose' | 'amber' | 'navy' | 'green' };

export const ExportSummarySectionV2: React.FC<{ patient: Patient }> = ({ patient }) => {
  const { units, beds, showToast } = useApp();
  const [previewUrl, setPreviewUrl] = useState('');
  const [previewPages, setPreviewPages] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>(sections.map(s => s[0]));
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState(false);
  const unit = units.find(u => u.id === patient.unitId);
  const bed = beds.find(b => b.id === patient.bedId);

  const has = (id: string) => selected.includes(id);
  const toggle = (id: string) =>
    setSelected(x => x.includes(id) ? x.filter(v => v !== id) : [...x, id]);

  useEffect(() => () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const closePreview = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl('');
    setPreviewPages([]);
    setPreview(false);
  };

  const renderPdfPreview = async (pdfData: ArrayBuffer) => {
    const pdf = await getDocument({ data: pdfData }).promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const pdfPage = await pdf.getPage(pageNumber);
      const viewport = pdfPage.getViewport({ scale: 1.35 });
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) continue;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      await pdfPage.render({ canvasContext: context, viewport }).promise;
      pages.push(canvas.toDataURL('image/png'));
    }
    setPreviewPages(pages);
  };

  const exportPdf = async (saveToDevice = true) => {
    if (!selected.length) {
      showToast('Select at least one section.', 'error');
      return;
    }
    setBusy(true);
    try {
      const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
      installArabicTextSupport(doc);

      // ---- palette (CCU template: navy #1e3a8a) ----
      const navy = [30, 58, 138];
      const navyDark = [23, 45, 108];
      const blueBar = [37, 99, 235];
      const ink = [28, 48, 65];
      const muted = [91, 110, 126];
      const line = [205, 222, 230];
      const pale = [232, 245, 248];
      const white = [255, 255, 255];
      const roseBg = [255, 228, 232];
      const roseTx = [159, 18, 57];
      const amberBg = [254, 240, 199];
      const amberTx = [146, 64, 14];
      const rowRose = [255, 241, 242];

      const PAGE_W = 210;
      const MARGIN = 8;
      const CONTENT_W = PAGE_W - MARGIN * 2; // 194
      const FOOTER_TOP = 270; // content must stay above this
      const generatedAt = new Date().toLocaleString();

      const fill = (c: number[]) => doc.setFillColor(c[0], c[1], c[2]);
      const draw = (c: number[]) => doc.setDrawColor(c[0], c[1], c[2]);
      const text = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);

      const p: any = patient as any;
      const unitLine = unit?.name
        ? `${unit.name} — CCU Department`
        : 'CCU Department';
      // CardioVault header brand mark (app icon). Loaded once per export.
      const logoPng = await loadLogoDataUrl();

      // ---- cross-source discrepancy scan (existing data only, never invented) ----
      const discrepancies: Badge[] = [];
      {
        // Age mentions inside free text vs the recorded age.
        const freeText = [
          p.clinicalSummary?.chiefComplaint, p.clinicalSummary?.hpi, p.clinicalSummary?.summary,
          ...((p.progressNotes || []).map((n: any) => `${n.assessment || ''} ${n.subjective || ''} ${n.objective || ''}`)),
        ].filter(Boolean).join('\n');
        const mentions = new Set<number>();
        const re = /(?:age\s*[:=]?\s*(\d{1,3})|(\d{1,3})\s*(?:-?years?-old|years?\s*old|y\.?o\.?|yo\b))|(?:\u0627\u0644\u0639\u0645\u0631\s*[:=]?\s*(\d{1,3})|(\d{1,3})\s*(?:\u0633\u0646\u0629|\u0633\u0646\u0647|\u0639\u0627\u0645))/gi;
        let m: RegExpExecArray | null;
        while ((m = re.exec(freeText)) !== null) {
          const n = Number(m[1] || m[2] || m[3] || m[4]);
          if (n >= 0 && n <= 120) mentions.add(n);
        }
        mentions.forEach(a => {
          if (typeof patient.age === 'number' && Math.abs(a - patient.age) > 1) {
            discrepancies.push({ t: `Age discrepancy: file ${patient.age} vs note ${a}`, kind: 'amber' });
          }
        });
        // Heart-rate cross-check: latest vitals vs latest ECG vs cardiology spot value.
        const hrs: Array<[string, number]> = [];
        const lv = p.vitalsHistory?.[0];
        if (lv?.hr) hrs.push(['vitals', Number(lv.hr)]);
        if (p.ecgRecords?.[0]?.heartRate) hrs.push(['ECG', Number(p.ecgRecords[0].heartRate)]);
        if (p.cardiology?.heartRate) hrs.push(['cardiology', Number(p.cardiology.heartRate)]);
        for (let i = 0; i < hrs.length; i += 1) {
          for (let j = i + 1; j < hrs.length; j += 1) {
            if (Math.abs(hrs[i][1] - hrs[j][1]) > 10) {
              discrepancies.push({ t: `HR discrepancy: ${hrs[i][0]} ${hrs[i][1]} vs ${hrs[j][0]} ${hrs[j][1]}`, kind: 'amber' });
            }
          }
        }
        // GCS components vs recorded total.
        if (lv && lv.gcsEye != null && lv.gcsVerbal != null && lv.gcsMotor != null && lv.gcsTotal != null) {
          const sum = Number(lv.gcsEye) + Number(lv.gcsVerbal) + Number(lv.gcsMotor);
          if (sum !== Number(lv.gcsTotal)) {
            discrepancies.push({ t: `GCS discrepancy: components E${lv.gcsEye}V${lv.gcsVerbal}M${lv.gcsMotor} (=${sum}) vs total ${lv.gcsTotal}`, kind: 'amber' });
          }
        }
      }

      let y = 0;

      const header = () => {
        fill(navy);
        doc.rect(0, 0, PAGE_W, 32, 'F');
        // Brand mark: app icon, with a drawn tile fallback so the header
        // never breaks when the SVG cannot be rasterized.
        let textX = MARGIN + 1;
        if (logoPng) {
          try {
            doc.addImage(logoPng, 'PNG', MARGIN, 5, 15, 15);
            textX = MARGIN + 19;
          } catch { /* fall through to tile */ }
        }
        if (textX === MARGIN + 1) {
          fill([8, 145, 178]);
          doc.roundedRect(MARGIN, 5, 15, 15, 3, 3, 'F');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          text(white);
          doc.text('CV', MARGIN + 7.5, 14.5, { align: 'center' });
          textX = MARGIN + 19;
        }
        // CardioVault brand + unit line
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        text(white);
        doc.text('CardioVault', textX, 12);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        text([200, 214, 235]);
        doc.text(compact(unitLine, 60), textX, 17);
        doc.text('CCU Case Presentation  •  Confidential Medical Record', textX, 21.5);
        // patient line
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9.5);
        text(white);
        doc.text(
          `${compact(patient.fullName, 32) || 'Unnamed Patient'}   •   ${[posNum(patient.age), val(patient.sex, '')].filter(Boolean).join(' / ') || NP}   •   MRN ${mrnLabel(patient.mrn)}`,
          textX, 25.5
        );
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7.5);
        text([200, 214, 235]);
        doc.text(
          `Bed ${bedLabel(bed)}  •  Admitted ${val(patient.admissionDate)} ${val(patient.admissionTime)}  •  Generated ${generatedAt}`,
          textX, 30.5
        );
      };

      const footer = () => {
        fill([248, 251, 252]);
        doc.rect(0, 282, PAGE_W, 15, 'F');
        draw(line);
        doc.setLineWidth(0.3);
        doc.line(MARGIN, 282, PAGE_W - MARGIN, 282);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        text(muted);
        doc.text('CardioVault — CCU Department', 9, 288);
      };

      // Measured page-break guard: estimate block height with the same
      // splitTextToSize wrap math used for drawing, then roll to a fresh
      // headered page before content can collide with the footer.
      const newPage = (continuationLabel?: string) => {
        footer();
        doc.addPage();
        header();
        y = 38;
        if (continuationLabel) {
          sectionTitle(0, `${continuationLabel} (continued)`);
        }
      };
      const ensureSpace = (needed: number, continuationLabel?: string) => {
        if (y + needed > FOOTER_TOP) newPage(continuationLabel);
      };

      // Provisional section titles: a title is painted only when its section
      // actually emits content. Fully-empty sections vanish completely.
      let pendingTitle: { num: number; label: string } | null = null;
      const sectionTitle = (num: number, label: string) => {
        pendingTitle = { num, label };
      };
      const flushTitle = () => {
        if (!pendingTitle) return;
        const { num, label } = pendingTitle;
        pendingTitle = null;
        ensureSpace(12);
        fill(pale);
        draw(line);
        doc.roundedRect(MARGIN, y, CONTENT_W, 8, 1.8, 1.8, 'FD');
        fill(blueBar);
        doc.roundedRect(MARGIN, y, 2.2, 8, 1.2, 1.2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        text(navy);
        doc.text(num > 0 ? `${num}.  ${label}` : label, MARGIN + 5, y + 5.4);
        y += 10.5;
      };

      const measureLines = (s: string, w: number): string[] =>
        doc.splitTextToSize(s, w) as string[];

      // Small badge pill; draws at (x, yBaseline), returns its width.
      const pill = (x: number, yBase: number, label: string, kind: Badge['kind']): number => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        const w = doc.getTextWidth(label) + 4;
        const bg = kind === 'rose' ? roseBg : kind === 'amber' ? amberBg : kind === 'navy' ? navy : [220, 252, 231];
        const fg = kind === 'rose' ? roseTx : kind === 'amber' ? amberTx : kind === 'navy' ? white : [22, 101, 52];
        fill(bg);
        doc.roundedRect(x, yBase - 3.6, w, 4.8, 1.2, 1.2, 'F');
        text(fg);
        doc.text(label, x + 2, yBase);
        return w;
      };

      // Label + wrapped value stacked block, optional badges after the label.
      // Unrecorded values are omitted entirely (no "Not provided" blocks).
      const para = (label: string, value: any, badges: Badge[] = []) => {
        if (isBlankRendered(val(value))) return;
        flushTitle();
        const lines = measureLines(val(value), CONTENT_W - 6);
        const h = 9 + lines.length * 3.8;
        ensureSpace(h);
        fill(white);
        draw(line);
        doc.roundedRect(MARGIN, y, CONTENT_W, h, 1.4, 1.4, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        text(navy);
        doc.text(label, MARGIN + 3, y + 4);
        let bx = MARGIN + 3 + doc.getTextWidth(label) + 3;
        badges.forEach(b => { bx += pill(bx, y + 4, b.t, b.kind) + 2; });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        text(ink);
        doc.text(lines, MARGIN + 3, y + 8);
        y += h + 2.5;
      };

      // Two-column key/value grid. Pairs with no recorded value are dropped
      // (kept only when they carry badges, e.g. discrepancy flags).
      const kvGrid = (rows: Array<[string, any, Badge[]?]>) => {
        const shown = rows.filter(([, value, badges]) =>
          (badges && badges.length > 0) || !isBlankRendered(val(value)));
        if (!shown.length) return;
        flushTitle();
        const half = (CONTENT_W - 3) / 2;
        for (let i = 0; i < shown.length; i += 2) {
          const pair = shown.slice(i, i + 2);
          const heights = pair.map(([label, value]) => {
            const vLines = measureLines(val(value), half - 6);
            const lLines = measureLines(label, half - 6);
            return 8 + (lLines.length + vLines.length) * 3.6;
          });
          const boxH = Math.max(13, ...heights);
          ensureSpace(boxH + 2);
          pair.forEach(([label, value, badges], col) => {
            const xx = MARGIN + col * (half + 3);
            fill(white);
            draw(line);
            doc.roundedRect(xx, y, half, boxH, 1.2, 1.2, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            text(navy);
            doc.text(label, xx + 3, y + 4);
            if (badges?.length) {
              let bx = xx + 3 + doc.getTextWidth(label) + 2.5;
              badges.forEach(b => { bx += pill(bx, y + 4, b.t, b.kind) + 1.5; });
            }
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9.5);
            text(ink);
            doc.text(measureLines(val(value), half - 6), xx + 3, y + 8);
          });
          y += boxH + 2;
        }
        y += 1;
      };

      // Navy-head table with per-row page-break guard, repeated header, optional row tints.
      const cleanTable = (
        headers: string[], widths: number[], rows: string[][],
        emptyLabel: string, sectionLabel: string, rowFill?: number[][],
      ) => {
        const rowH = 6.2;
        // Empty table (no recorded rows) is omitted entirely.
        if (!rows.length) return;
        void emptyLabel;
        flushTitle();
        const drawHeaderRow = () => {
          let xx = MARGIN;
          fill(navy);
          draw(navyDark);
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(7.8);
          headers.forEach((h, i) => {
            doc.rect(xx, y, widths[i], rowH, 'FD');
            text(white);
            doc.text(h, xx + 1.7, y + 4.4);
            xx += widths[i];
          });
          y += rowH;
        };
        ensureSpace(rowH * 2);
        drawHeaderRow();
        rows.forEach((row, ri) => {
          const cellLines = widths.map((w, i) => measureLines(val(row[i]), w - 3.4));
          const rh = Math.max(rowH, 3 + Math.max(...cellLines.map(l => l.length)) * 3.7);
          if (y + rh > FOOTER_TOP) {
            newPage(sectionLabel);
            drawHeaderRow();
          }
          let xx = MARGIN;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.8);
          widths.forEach((w, i) => {
            fill(rowFill?.[ri] || white);
            draw(line);
            doc.rect(xx, y, w, rh, 'FD');
            text(ink);
            doc.text(cellLines[i], xx + 1.7, y + 3.4);
            xx += w;
          });
          y += rh;
        });
        y += 3;
      };

      // ---- lab flagging (reference ranges, existing values only) ----
      type Flag = { t: string; critical: boolean };
      const num = (v: any): number | null => {
        const n = Number(v);
        return v === undefined || v === null || v === '' || Number.isNaN(n) ? null : n;
      };
      const flagNum = (v: any, low: number, high: number, critLow?: number, critHigh?: number, positiveIfAny?: boolean): Flag | null => {
        const n = num(v);
        if (n === null) return null;
        if (positiveIfAny && n > 0) return { t: 'POSITIVE', critical: true };
        if ((critLow !== undefined && n < critLow) || (critHigh !== undefined && n > critHigh)) {
          return { t: n < low ? 'CRIT LOW' : 'CRIT HIGH', critical: true };
        }
        if (n < low) return { t: 'LOW', critical: false };
        if (n > high) return { t: 'HIGH', critical: false };
        return null;
      };

      // ---- document ----
      header();
      y = 37;

      // ============ §1–2 Identification & Admission ============
      if (has('identification')) {
        sectionTitle(1, 'Patient Identification');
        kvGrid([
          ['Full Name', patient.fullName || patient.name],
          ['MRN', patient.mrn],
          ['Age / Sex', `${val(patient.age)} / ${val(patient.sex)}`, discrepancies.filter(d => d.t.startsWith('Age'))],
          ['Weight / Height', (() => { const w = posNum(patient.weight); const h = posNum(patient.height); return !w && !h ? NP : `${w ? `${w} kg` : NP} / ${h ? `${h} cm` : NP}`; })()],
          ['Unit / Bed', `${val(unit?.name)} / ${val(bed?.bedNumber)}`],
          ['Status / Code Status', `${val(patient.status, 'Active')} / ${val(patient.codeStatus)}`],
        ]);
        sectionTitle(2, 'Admission & Administrative Data');
        kvGrid([
          ['Admission Date / Time', `${val(patient.admissionDate)} ${val(patient.admissionTime)}`],
          ['Primary Diagnosis', patient.primaryDiagnosis || patient.diagnosis],
          ['Secondary Diagnoses', (patient.secondaryDiagnoses || []).join(', ')],
          ['Additional Conditions', (patient.additionalConditions || []).join(', ')],
          ['Attended Clinician / Nurse', `${val(p.attendedClinician)} / ${val(p.attendedNurse)}`],
          ['Past Admissions', (patient.pastAdmissions || []).map((a: any) => `${val(a.admissionDate)} ${val(a.unitName)} (${val(a.dischargeReason)})`).join(' • ')],
        ]);
        if (discrepancies.filter(d => !d.t.startsWith('Age')).length) {
          para('Data Discrepancies', discrepancies.filter(d => !d.t.startsWith('Age')).map(d => d.t).join(' • '),
            discrepancies.filter(d => !d.t.startsWith('Age')));
        }
      }

      // ============ §3–11 History ============
      if (has('history')) {
        const s: any = p.clinicalSummary || {};
        const cv: any = p.cardiovascularHistory || {};
        sectionTitle(3, 'Chief Complaint');
        para('Complaint', s.chiefComplaint);
        sectionTitle(4, 'History of Present Illness');
        para('HPI', s.hpi || s.summary);
        sectionTitle(5, 'Past Medical History');
        const pmhList = [...(s.pmh || [])];
        para('PMH', pmhList.length ? pmhList.join(', ') : NP);
        sectionTitle(6, 'Cardiovascular History');
        {
          const labels: Record<string, string> = {
            hypertension: 'Hypertension', diabetes: 'Diabetes', dyslipidemia: 'Dyslipidemia', cad: 'CAD',
            previousMI: 'Previous MI', heartFailure: 'Heart Failure', arrhythmias: 'Arrhythmias',
            valvularDisease: 'Valvular Disease', previousPCI: 'Previous PCI', previousCABG: 'Previous CABG',
            previousStroke: 'Previous Stroke', pvd: 'PVD', smoking: 'Smoking', alcohol: 'Alcohol',
          };
          const positives = Object.keys(labels).filter(k => cv[k] === true).map(k => labels[k]);
          para('Cardiac Risk & History', positives.length ? positives.join(', ') : NP,
            positives.length ? [{ t: `${positives.length} risk factor${positives.length > 1 ? 's' : ''}`, kind: 'navy' }] : []);
          kvGrid([
            ['Previous Admissions', cv.previousAdmissions],
            ['Previous ICU', cv.previousICU],
            ['Other Cardiac Notes', cv.other],
          ]);
        }
        sectionTitle(7, 'Past Surgical History');
        para('PSH', (s.psh || []).length ? (s.psh || []).join(', ') : NP);
        sectionTitle(8, 'Home Medications & Drug History');
        para('Drug History (Home Meds)', s.drugHistory);
        sectionTitle(9, 'Allergies');
        {
          const allergies = [...(s.allergies || []), ...(patient.allergies || [])].filter(Boolean);
          para('Allergies', allergies.length ? allergies.join(', ') : NP,
            allergies.length ? [{ t: 'ALLERGY', kind: 'rose' }] : []);
        }
        sectionTitle(10, 'Social History');
        para('Social', s.socialHistory);
        sectionTitle(11, 'Family History');
        para('Family', s.familyHistory);
      }

      // ============ §12–13 Vitals & Examination ============
      if (has('vitals-exam')) {
        sectionTitle(12, 'Vital Signs (Latest)');
        {
          const v: any = p.vitalsHistory?.[0] || {};
          const fever = num(v.temp) !== null && (num(v.temp) as number) >= 38;
          const lowSpo2 = num(v.spo2) !== null && (num(v.spo2) as number) < 90;
          const bpSys = num(v.sbp);
          const bpBad = bpSys !== null && ((bpSys as number) >= 180 || (bpSys as number) < 90);
          const hrBad = num(v.hr) !== null && (((num(v.hr) as number) >= 120) || ((num(v.hr) as number) < 50));
          const gcsBad = num(v.gcsTotal) !== null && (num(v.gcsTotal) as number) <= 8;
          kvGrid([
            ['Blood Pressure', v.sbp ? `${v.sbp}/${val(v.dbp)} mmHg` : NP, bpBad ? [{ t: 'CRITICAL', kind: 'rose' }] : []],
            ['Heart Rate', v.hr ? `${v.hr} bpm` : NP, hrBad ? [{ t: 'CRITICAL', kind: 'rose' }] : discrepancies.filter(d => d.t.startsWith('HR'))],
            ['Respiratory Rate', v.rr ? `${v.rr}/min` : NP],
            ['SpO₂', v.spo2 ? `${v.spo2}%` : NP, lowSpo2 ? [{ t: 'CRITICAL', kind: 'rose' }] : []],
            ['Temperature', v.temp ? `${v.temp} °C` : NP, fever ? [{ t: 'FEVER', kind: 'amber' }] : []],
            ['GCS', v.gcsTotal ? `${v.gcsTotal}/15 (E${val(v.gcsEye)} V${val(v.gcsVerbal)} M${val(v.gcsMotor)})` : NP, gcsBad ? [{ t: 'CRITICAL', kind: 'rose' }] : []],
            ['Pain Score', v.pain ?? NP],
            ['RASS', v.rass ?? NP],
            ['CVP', v.cvp ?? NP],
            ['Glucose (bedside)', v.glucose ?? NP],
            ['Lactate (bedside)', v.lactate ?? NP],
            ['Recorded At', v.timestamp || NP],
          ]);
        }
        sectionTitle(13, 'Systemic Examination');
        {
          const ex: any = p.examination || {};
          const g = ex.general || {}, c = ex.cardiovascular || {}, r = ex.respiratory || {},
            a = ex.abdomen || {}, n = ex.neurological || {}, e = ex.extremities || {};
          kvGrid([
            ['General', [g.appearance, g.consciousness, g.distress, g.hydration].filter(Boolean).join(' • ')],
            ['Skin / Pallor / Cyanosis / Jaundice',
              [g.skin, g.pallor ? 'Pallor' : '', g.cyanosis ? 'Cyanosis' : '', g.jaundice ? 'Jaundice' : '', g.edema, g.neck].filter(Boolean).join(' • ')],
            ['Cardiovascular', [c.jvp && `JVP ${c.jvp}`, c.heartSounds, c.murmurs, c.peripheralPulses, c.edema, c.perfusion, c.apexBeat, c.thrill, c.radiofemoralDelay].filter(Boolean).join(' • ')],
            ['Respiratory', [r.chestExam, r.airEntry, r.addedSounds, r.workOfBreathing, r.fremitus].filter(Boolean).join(' • ')],
            ['Abdomen', [a.inspection, a.palpation, a.tenderness, a.organomegaly, a.ascites, a.bowelSounds, a.hernia].filter(Boolean).join(' • ')],
            ['Neurological', [n.consciousness, n.gcs, n.pupils, n.motor, n.sensory, n.reflexes, n.cranialNerves, n.motorPower, n.plantarResponse, n.speech].filter(Boolean).join(' • ')],
            ['Extremities', [e.pulses, e.edema, e.temp, e.perfusion, e.calves, e.pressureAreas].filter(Boolean).join(' • ')],
            ['Custom Fields', (ex.customFields || []).map((f: any) => `${f.label}: ${f.value}`).join(' • ')],
          ]);
        }
      }

      // ============ §14 ECG ============
      if (has('ecg')) {
        sectionTitle(14, 'ECG');
        const ecgs: any[] = p.ecgRecords || [];
        const latest = ecgs[0];
        if (latest) {
          const acute = /stemi|acute|st elevation|new lbbb/i.test(
            `${(latest.interpretation || []).join(' ')} ${latest.finalImpression || ''} ${latest.stSegment || ''}`
          );
          kvGrid([
            ['Date / Time', `${val(latest.date)} ${val(latest.time)}`],
            ['Rate / Rhythm / Regularity', `${val(latest.heartRate)} bpm / ${val(latest.rhythm)} / ${val(latest.regularity)}`,
              acute ? [{ t: 'ACUTE', kind: 'rose' }] : discrepancies.filter(d => d.t.startsWith('HR'))],
            ['Axis / P Wave / PR', `${val(latest.axis)} / ${val(latest.pWave)} / ${val(latest.pr)} ms`],
            ['QRS / QT / QTc', `${val(latest.qrsFindings)} (${val(latest.qrs)} ms) / ${val(latest.qt)} / ${val(latest.qtc)} ms`],
            ['ST Segment / T Wave', `${val(latest.stSegment)} / ${val(latest.tWave)}`],
            ['Other Findings', latest.otherFindings],
          ]);
          para('Final Impression', latest.finalImpression, acute ? [{ t: 'ACUTE', kind: 'rose' }] : []);
        } else {
          para('ECG', NP);
        }
        if (ecgs.length > 1) {
          cleanTable(['Date', 'Rhythm', 'Rate', 'Impression'],
            [30, 50, 26, 88],
            ecgs.slice(1, 11).map(e => [
              `${val(e.date)} ${val(e.time)}`, val(e.rhythm),
              e.heartRate ? `${e.heartRate}` : NP, compact(e.finalImpression || (e.interpretation || []).join(', '), 60),
            ]),
            'ECG records', 'ECG');
        }
      }

      // ============ §15–16 Labs ============
      if (has('labs')) {
        sectionTitle(15, 'Laboratory Investigations (Latest)');
        {
          const lab: any = (p.labs || [])[0] || {};
          const labResults: any[] = p.labResults || [];
          const cell = (k: string) => (lab[k] === undefined || lab[k] === null || lab[k] === '' ? NP : String(lab[k]));
          const f = (k: string, lo: number, hi: number, cL?: number, cH?: number, pos?: boolean) =>
            flagNum(lab[k], lo, hi, cL, cH, pos);
          const rows: string[][] = [];
          const tints: number[][] = [];
          const push = (test: string, value: string, fl: Flag | null) => {
            // Recorded labs only — unrecorded tests never reach the PDF.
            if (isBlankRendered(value)) return;
            rows.push([test, value, fl ? fl.t : '—']);
            tints.push(fl?.critical ? rowRose : white);
          };
          push('Hb', cell('hb'), f('hb', 12, 16, 7, undefined));
          push('WBC', cell('wbc'), f('wbc', 4, 11, 2, 20));
          push('Platelets', cell('platelets'), f('platelets', 150, 400, 50, undefined));
          push('HCT', cell('hct'), f('hct', 36, 46));
          push('Urea', cell('urea'), f('urea', 15, 45));
          push('Creatinine', cell('creatinine'), f('creatinine', 0.6, 1.2, undefined, 3));
          push('eGFR', cell('egfr'), f('egfr', 90, 200, 30, undefined));
          push('Na', cell('na'), f('na', 135, 145, 125, 155));
          push('K', cell('k'), f('k', 3.5, 5.0, 3.0, 5.5));
          push('Cl', cell('cl'), f('cl', 98, 107));
          push('Ca', cell('ca'), f('ca', 8.5, 10.5));
          push('Mg', cell('mg'), f('mg', 1.7, 2.2));
          push('AST / ALT', `${cell('ast')} / ${cell('alt')}`, f('ast', 10, 40, undefined, 400) || f('alt', 10, 40, undefined, 400));
          push('Bilirubin', cell('bilirubin'), f('bilirubin', 0.3, 1.2));
          push('Albumin', cell('albumin'), f('albumin', 3.5, 5.5));
          push('PT / INR', `${cell('pt')} / ${cell('inr')}`, f('inr', 0.9, 1.2, undefined, 2.5));
          push('Troponin', cell('troponin'), f('troponin', 0, 0.04, undefined, undefined, true));
          push('CK-MB', cell('ckmb'), f('ckmb', 0, 25));
          push('BNP / NT-proBNP', `${cell('bnp')} / ${cell('ntProBnp')}`, null);
          push('CRP', cell('crp'), f('crp', 0, 10, undefined, 100));
          push('Lactate', cell('lactate'), f('lactate', 0.5, 2.0, undefined, 4));
          push('Glucose', cell('glucose'), f('glucose', 70, 140, 50, 300));
          push('D-Dimer', cell('dDimer'), f('dDimer', 0, 0.5));
          const custom: any[] = lab.customLabs || [];
          custom.forEach(c => push(val(c.name), `${val(c.value)} ${val(c.unit)}`.trim(), null));
          labResults.forEach(r => push(val(r.name || r.testName), `${val(r.value)} ${val(r.unit)}`.trim(), null));
          cleanTable(['Test', 'Result', 'Flag'], [70, 70, 54], rows, 'lab results', 'Laboratory', tints);
          if (lab.date) para('Sample Date', lab.date);
        }
        sectionTitle(16, 'Serial Laboratory Trends');
        {
          const serial: any[] = (p.labs || []).slice(0, 4);
          if (serial.length > 1) {
            const keys = ['hb', 'wbc', 'platelets', 'creatinine', 'urea', 'na', 'k', 'troponin', 'crp', 'glucose', 'inr', 'lactate'];
            const labels: Record<string, string> = {
              hb: 'Hb', wbc: 'WBC', platelets: 'Platelets', creatinine: 'Creatinine', urea: 'Urea',
              na: 'Na', k: 'K', troponin: 'Troponin', crp: 'CRP', glucose: 'Glucose', inr: 'INR', lactate: 'Lactate',
            };
            const dateW = Math.min(34, (CONTENT_W - 40) / serial.length);
            const widths = [40, ...serial.map(() => (CONTENT_W - 40) / serial.length)];
            void dateW;
            const rows = keys
              .filter(k => serial.some(s => nonEmpty(s[k])))
              .map(k => [labels[k], ...serial.map(s => (nonEmpty(s[k]) ? String(s[k]) : '—'))]);
            cleanTable(['Test', ...serial.map(s => val(s.date, 'Latest'))], widths, rows, 'serial results', 'Serial Labs');
            // Single panel: no trend to display, so §16 stays out of the PDF.
          }
        }
      }

      // ============ §17–19 Imaging & Cardiology ============
      if (has('imaging-cardiology')) {
        sectionTitle(17, 'Radiology & Imaging');
        {
          const studies: any[] = p.imaging || [];
          cleanTable(['Date', 'Modality', 'Region', 'Impression'],
            [28, 36, 45, 85],
            studies.map(s => [
              val(s.date), val(s.modality || s.type), val(s.bodyRegion || s.region),
              compact(s.impression || s.findings, 80),
            ]),
            'imaging studies', 'Radiology');
        }
        sectionTitle(18, 'Echocardiography');
        {
          const c: any = p.cardiology || {};
          const e: any = c.echo || {};
          if (c.echoBriefSummary) para('Echo Summary', c.echoBriefSummary);
          const echoRows: string[][] = [
            ['EF', e.ef !== undefined && e.ef !== null && e.ef !== '' ? `${e.ef}%` : NP],
            ['LV Dimensions', val(e.lvDimensions)],
            ['LV Function', val(e.lvFunction)],
            ['RWMA', val(e.rwma)],
            ['RV Function', val(e.rvFunction)],
            ['LA / RA', `${val(e.la)} / ${val(e.ra)}`],
            ['MR / AR', `${val(e.mr)} / ${val(e.ar)}`],
            ['AS / MS', `${val(e.as)} / ${val(e.ms)}`],
            ['TR / PR', `${val(e.tr)} / ${val(e.pr)}`],
            ['PASP', e.pasp ? `${e.pasp} mmHg` : NP],
            ['IVC', val(e.ivc)],
            ['Pericardium', val(e.pericardium)],
            ['Other Findings', val(e.otherFindings)],
          ];
          const efBad = num(e.ef) !== null && (num(e.ef) as number) < 40;
          // Recorded echo parameters only — unrecorded rows never reach the PDF.
          const echoRowsShown = echoRows.filter(r => !isBlankRendered(val(r[1])));
          cleanTable(['Parameter', 'Finding'], [62, 132], echoRowsShown.map(r => r),
            'echo findings', 'Echocardiography',
            echoRowsShown.map(r => (r[0] === 'EF' && efBad ? rowRose : white)));
          kvGrid([
            ['Rhythm / HR / BP', `${val(c.rhythm)} / ${c.heartRate ? `${c.heartRate} bpm` : NP} / ${val(c.bp)}`, discrepancies.filter(d => d.t.startsWith('HR'))],
            ['HF Status / NYHA / Killip', `${val(c.heartFailureStatus)} / ${val(c.nyha || c.nyhaClass)} / ${val(c.killip || c.killipClass)}`],
            ['Congestion / Perfusion', `${val(c.congestion)} / ${val(c.perfusion)}`],
            ['Devices / Support', [val((c.devicesList || []).map((d: any) => `${val(d.type)} (${val(d.status)})`).join(', ')), val(c.pacemaker), val(c.mechanicalSupport)].filter(x => x !== NP).join(' • ') || NP],
          ]);
          if ((c.biomarkerRecords || []).length) {
            cleanTable(['Date', 'Marker', 'Value', 'Ref Range'],
              [30, 50, 50, 64],
              (c.biomarkerRecords || []).map((b: any) => [val(b.date), val(b.name), `${val(b.value)} ${val(b.unit)}`.trim(), val(b.referenceRange)]),
              'biomarkers', 'Echocardiography');
          }
        }
        sectionTitle(19, 'Catheterization & Coronary Interventions');
        {
          const c: any = p.cardiology || {};
          const cor: any = c.coronary || {};
          const caths: any[] = c.cathRecords || [];
          kvGrid([
            ['Cath', cor.cath],
            ['Coronary Findings', cor.coronaryFindings],
            ['PCI', cor.pci, /stent|pci|angioplasty/i.test(val(cor.pci, '')) ? [{ t: 'PCI', kind: 'navy' }] : []],
            ['Stent', cor.stent],
            ['CABG', cor.cabg],
            ['Antithrombotic', [
              c.antithrombotic?.antiplatelet && `Antiplatelet: ${c.antithrombotic.antiplatelet}`,
              c.antithrombotic?.anticoagulation && `Anticoagulation: ${c.antithrombotic.anticoagulation}`,
              c.antithrombotic?.thrombolysis && `Thrombolysis: ${c.antithrombotic.thrombolysis}`,
            ].filter(Boolean).join(' • ') || NP],
          ]);
          if (caths.length) {
            cleanTable(['Date', 'Indication', 'Access', 'Intervention', 'Result'],
              [24, 44, 28, 50, 48],
              caths.map(k => [
                val(k.date), compact(k.indication, 40), val(k.accessSite),
                compact(k.intervention || (k.stentsPlaced ? `Stents: ${k.stentsPlaced}` : ''), 44),
                compact(k.finalResult || k.complications, 44),
              ]),
              'cath records', 'Catheterization');
          }
        }
      }

      // ============ §8/§20 Medications ============
      if (has('medications')) {
        sectionTitle(20, 'In-Hospital Medications & Infusions');
        {
          const meds: any[] = (p.medications || []).filter((m: any) => m.status !== 'Discontinued');
          const stopped: any[] = (p.medications || []).filter((m: any) => m.status === 'Discontinued');
          cleanTable(['Drug', 'Dose', 'Route', 'Frequency', 'Status'],
            [58, 38, 32, 38, 28],
            meds.map(m => [val(m.name || m.drug), val(m.dose), val(m.route), val(m.frequency), val(m.status, 'Active')]),
            'medications', 'Medications');
          if (stopped.length) para('Discontinued', stopped.map(m => val(m.name || m.drug)).join(', '));
          const infusions: any[] = p.infusions || [];
          if (infusions.length) {
            cleanTable(['Drug', 'Dose', 'Rate', 'Details'],
              [52, 40, 40, 62],
              infusions.map(i => [
                val(i.drugName), `${val(i.dose)} ${val(i.unit)}`.trim(),
                i.rateMlHr ? `${i.rateMlHr} mL/hr` : NP,
                compact(i.carrierFluid || i.concentration || i.lineSite, 50),
              ]),
              'infusions', 'Medications');
          }
          const admin: any[] = (p.medicationAdministrations || []).slice(0, 10);
          if (admin.length) {
            cleanTable(['Time', 'Drug', 'Status', 'Given By'],
              [44, 62, 32, 56],
              admin.map(a => [val(a.time), val(a.medicationName), val(a.status), compact(a.user, 26)]),
              'administrations', 'Medications');
          }
        }
      }

      // ============ §21–22 ICU & Procedures ============
      if (has('icu-procedures')) {
        sectionTitle(21, 'ICU Care — Ventilatory, Hemodynamic & Fluid Support');
        {
          const v: any = p.ventilator || {};
          const support: string = val(v.supportType, v.mode ? 'Mechanical Ventilation' : 'Room Air');
          kvGrid([
            ['Support Type', support],
            ['Oxygen Device / Flow', v.oxygenDevice ? `${v.oxygenDevice}${v.oxygenFlow ? ` ${v.oxygenFlow} L/min` : ''}` : NP],
            ['Mode / FiO₂ / PEEP', (nonEmpty(v.mode) || v.fio2 != null || v.peep != null) ? `${val(v.mode)} / ${v.fio2 ?? NP}% / ${v.peep ?? NP} cmH₂O` : NP],
            ['Tidal Volume / RR', (v.tidalVolume != null || v.respiratoryRate != null || v.rr != null) ? `${v.tidalVolume ?? NP} mL / ${v.respiratoryRate ?? v.rr ?? NP}/min` : NP],
            ['Pressures (Peak/Plat/MAP)', (v.peakPressure != null || v.plateauPressure != null || v.meanAirwayPressure != null) ? `${v.peakPressure ?? NP} / ${v.plateauPressure ?? NP} / ${v.meanAirwayPressure ?? NP} cmH₂O` : NP],
            ['SpO₂ / EtCO₂', (v.spo2 != null || v.etco2 != null) ? `${v.spo2 ?? NP}% / ${v.etco2 ?? NP} mmHg` : NP],
          ]);
          const abgs: any[] = (v.abgHistory || []).slice(0, 6);
          if (abgs.length) {
            cleanTable(['Time', 'pH', 'PaCO₂', 'PaO₂', 'HCO₃', 'Lactate', 'Interpretation'],
              [34, 22, 26, 26, 26, 26, 34],
              abgs.map(a => [
                val(a.timestamp), val(a.ph), val(a.paco2), val(a.pao2), val(a.hco3), val(a.lactate),
                compact(a.interpretation, 30),
              ]),
              'ABGs', 'ICU Care');
          }
          const hemo: any[] = (p.hemodynamicHistory || []).slice(0, 8);
          if (hemo.length) {
            cleanTable(['Date / Time', 'Parameter', 'Value', 'Notes'],
              [40, 54, 44, 56],
              hemo.map(h => [`${val(h.date)} ${val(h.time)}`, val(h.parameter), `${val(h.value)} ${val(h.unit)}`.trim(), compact(h.notes, 40)]),
              'hemodynamics', 'ICU Care');
          }
          const fluids: any[] = (p.fluidRecords || []).slice(0, 5);
          if (fluids.length) {
            cleanTable(['Date', 'Intake', 'Output', 'Net Balance'],
              [40, 52, 52, 50],
              fluids.map(f => [
                val(f.date || f.timestamp),
                f.totalIntake != null ? `${f.totalIntake} mL` : NP,
                f.totalOutput != null ? `${f.totalOutput} mL` : NP,
                f.netBalance != null ? `${f.netBalance} mL` : NP,
              ]),
              'fluid records', 'ICU Care');
          }
          if (!abgs.length && !hemo.length && !fluids.length && !v.mode && !v.supportType) {
            para('ICU Support', NP);
          }
        }
        sectionTitle(22, 'Procedures & Interventions');
        {
          const procs: any[] = p.procedures || [];
          cleanTable(['Date / Time', 'Procedure', 'Operator', 'Outcome / Plan'],
            [32, 56, 36, 70],
            procs.map(pr => [
              `${val(pr.date)} ${val(pr.time)}`, val(pr.procedure || pr.name || pr.surgeryName),
              val(pr.operator), compact(pr.outcome || pr.findings || pr.postProcedurePlan || pr.indication, 70),
            ]),
            'procedures', 'Procedures');
        }
      }

      // ============ §23–25 Orders, Course, Timeline, Problems & Plan ============
      if (has('course-plan')) {
        sectionTitle(23, 'Orders & Consultations');
        {
          const inv: any[] = p.investigations || [];
          cleanTable(['Investigation', 'Status', 'Flag', 'Results'],
            [52, 42, 30, 70],
            inv.map(x => [
              val(x.title || x.type), val(x.status),
              x.flag && x.flag !== 'normal' ? String(x.flag).toUpperCase() : '—',
              compact(x.resultsSummary || x.notes, 60),
            ]),
            'investigations', 'Orders');
          const cons: any[] = p.consultations || [];
          cleanTable(['Specialty', 'Question', 'Status', 'Response'],
            [40, 64, 36, 54],
            cons.map(c => [
              val(c.specialty), compact(c.clinicalQuestion, 56), val(c.status), compact(c.responseNotes, 48),
            ]),
            'consultations', 'Orders');
          const tasks: any[] = (p.tasks || []).filter((t: any) => !t.patientId || t.patientId === patient.id).slice(0, 10);
          if (tasks.length) {
            cleanTable(['Task', 'Priority', 'Status'],
              [96, 40, 58],
              tasks.map(t => [compact(t.title, 80), val(t.priority), val(t.status)]),
              'tasks', 'Orders');
          }
        }
        sectionTitle(24, 'Hospital Course & Events Timeline');
        {
          const notes: any[] = [...(p.progressNotes || [])].reverse().slice(0, 15);
          if (notes.length) {
            notes.forEach(n => {
              para(`${val(n.date)} ${val(n.time)} — ${val(n.author)}${n.type ? ` (${n.type})` : ''}`,
                [n.subjective && `S: ${n.subjective}`, n.objective && `O: ${n.objective}`,
                  n.assessment && `A: ${n.assessment}`, n.events && `Events: ${n.events}`,
                  n.investigations && `Ix: ${n.investigations}`, n.treatment && `Rx: ${n.treatment}`,
                  n.response && `Response: ${n.response}`, n.plan && `P: ${n.plan}`,
                ].filter(Boolean).join('\n') || n.plan || NP);
            });
          } else {
            para('Hospital Course', NP);
          }
          const events: any[] = [...(p.timelineEvents || [])]
            .sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)))
            .slice(-25);
          if (events.length) {
            cleanTable(['Timestamp', 'Event', 'Details'],
              [44, 56, 94],
              events.map(e => [val(e.timestamp), compact(e.title || e.eventType, 44), compact(e.summary, 80)]),
              'timeline events', 'Hospital Course');
          }
        }
        sectionTitle(25, 'Active Problem List, Plan & Summary');
        {
          const probs: any[] = p.problems || [];
          const probRows = [
            ...probs.map(x => [val(x.problem), val(x.status), val(x.priority), val(x.dateIdentified)] as string[]),
            ...(patient.secondaryDiagnoses || []).map(d => [val(d), 'active', 'routine', NP] as string[]),
          ];
          cleanTable(['Problem', 'Status', 'Priority', 'Identified'],
            [82, 40, 34, 38], probRows, 'problems', 'Problem List');
          const latestNote: any = (p.progressNotes || [])[0];
          para('Current Plan', latestNote?.plan || NP);
          if (p.dischargeSummary) para('Discharge Summary', p.dischargeSummary);
        }
      }

      footer();

      // Page numbers with real total (two-pass over finished pages).
      const totalPages = doc.getNumberOfPages();
      for (let pageNumber = 1; pageNumber <= totalPages; pageNumber += 1) {
        doc.setPage(pageNumber);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7);
        text(navy);
        doc.text(`Page ${pageNumber} of ${totalPages}`, 201, 288, { align: 'right' });
      }

      // Single Blob output path (reliable in Android WebView).
      const blob = doc.output('blob') as Blob;
      const pdfData = await blob.arrayBuffer();
      if (!pdfData.byteLength) throw new Error('Generated PDF is empty.');
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      const objectUrl = URL.createObjectURL(blob);
      setPreviewUrl(objectUrl);
      setPreview(true);
      setPreviewPages([]);
      void renderPdfPreview(pdfData).catch(error => {
        console.error('CardioVault PDF preview rendering failed:', error);
        showToast('Preview could not be rendered. The PDF is still valid and can be saved.', 'error');
      });

      const filename = `CardioVault-CCU-${patient.mrn || patient.id}.pdf`;

      if (saveToDevice) {
        if (Capacitor.isNativePlatform()) {
          const base64 = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
              const value = String(reader.result || '');
              resolve(value.includes(',') ? value.split(',')[1] : value);
            };
            reader.onerror = () => reject(reader.error || new Error('Unable to read generated PDF.'));
            reader.readAsDataURL(blob);
          });
          await Filesystem.writeFile({
            path: `CardioVault/${filename}`,
            data: base64,
            directory: Directory.Documents,
            recursive: true,
          });
          showToast('PDF saved to the device Documents folder.', 'success');
        } else {
          const link = document.createElement('a');
          link.href = objectUrl;
          link.download = filename;
          document.body.appendChild(link);
          link.click();
          link.remove();
          showToast('Clinical PDF saved to the device.', 'success');
        }
      }
    } catch (error) {
      console.error('CardioVault PDF export failed:', error);
      showToast('PDF generation failed. Check the PDF data and try again.', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-5 max-w-5xl mx-auto">
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold">CCU Case Presentation — PDF Export</h2>
            <p className="text-xs text-slate-500 mt-1">
              25-section CCU template • CardioVault header • recorded values only • A4 report • Arabic patient names supported.
            </p>
          </div>
          <div className="flex gap-2">
            <button onClick={() => void exportPdf(false)} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">
              <Eye className="w-4 h-4" /> Review
            </button>
            <button onClick={() => void exportPdf(true)} disabled={busy} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold disabled:opacity-50">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
              {busy ? 'Generating…' : 'Save PDF'}
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 mt-5">
          {sections.map(([id, label]) => (
            <button
              key={id}
              onClick={() => toggle(id)}
              className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-left text-xs font-semibold ${has(id)
                ? 'border-cyan-500/50 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300'
                : 'border-slate-200 dark:border-slate-800 text-slate-500'}`}
            >
              <span className="flex-1">{label}</span>
              <span className={has(id) ? "w-2 h-2 rounded-full bg-emerald-500 shrink-0" : "w-2 h-2 rounded-full bg-slate-300 dark:bg-slate-700 shrink-0"} />
            </button>
          ))}
        </div>
      </div>

      {preview && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-[#111C2E] p-5 pb-[calc(1.25rem+var(--safe-area-inset-bottom,env(safe-area-inset-bottom,0px)))]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="font-bold">PDF Preview</h3>
              <p className="text-xs text-slate-500">Real generated PDF • A4 CCU case presentation.</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => void exportPdf(true)} disabled={busy} className="px-3 py-2 rounded-xl bg-cyan-500 text-slate-950 text-xs font-bold">Save PDF</button>
              <button onClick={closePreview} className="px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-bold">Close</button>
            </div>
          </div>
          {previewPages.length ? (
            <div className="mt-4 space-y-4 max-h-[75vh] overflow-auto rounded-2xl bg-slate-100 dark:bg-slate-950 p-2">
              {previewPages.map((pageImage, index) => (
                <div key={index} className="bg-white rounded-xl shadow-sm overflow-hidden">
                  <img src={pageImage} alt={`PDF page ${index + 1}`} className="block w-full h-auto" />
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-4 h-40 flex items-center justify-center text-xs text-slate-400">
              Rendering the actual PDF pages…
            </div>
          )}
        </div>
      )}
    </div>
  );
};
