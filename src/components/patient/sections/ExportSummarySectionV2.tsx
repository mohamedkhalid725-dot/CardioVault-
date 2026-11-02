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
import { aggregateLabResults, buildPdfTimeline } from './labExportData';

// CCU case-presentation template: selected groups feed a single chronological report timeline.
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

      // ---- report body: fixed identity followed by one global clinical timeline ----
      header();
      y = 37;
      const titleBlock = (label: string) => { sectionTitle(0, label); flushTitle(); };
      titleBlock('Patient Identification & Current Status');
      kvGrid([
        ['Full Name', patient.fullName || patient.name], ['MRN', patient.mrn],
        ['Age / Sex', `${val(patient.age)} / ${val(patient.sex)}`],
        ['Current Diagnosis', patient.primaryDiagnosis || patient.diagnosis],
        ['Allergies', [...(p.clinicalSummary?.allergies || []), ...(patient.allergies || [])].filter(Boolean).join(', ')],
        ['Current Status / Code Status', `${val(patient.status)} / ${val(patient.codeStatus)}`],
        ['Unit / Bed', `${val(unit?.name)} / ${val(bed?.bedNumber)}`],
      ]);
      newPage();
      const timeline = buildPdfTimeline(p, selected);
      const datedEvents = timeline.filter(event => event.timestamp);
      const undatedEvents = timeline.filter(event => !event.timestamp);
      titleBlock('Global Clinical Timeline — Oldest to Newest');
      if (!datedEvents.length) para('Timeline', 'No selected clinical events have a reliable recorded date.');
      datedEvents.forEach(event => para(`${event.timestamp}  •  ${event.type}  •  ${event.title}`, event.details));
      titleBlock('Undated — No Reliable Date Recorded');
      if (undatedEvents.length) undatedEvents.forEach(event => para(`${event.type}  •  ${event.title}`, event.details));
      else para('Undated events', 'None.');
      // Lab observations are events above; analyte charts and numeric tables exist only here.
      if (has('labs')) {
        titleBlock('Appendix — Laboratory Trends & Results');
        for (const analyte of aggregateLabResults(p)) {
          const numeric = analyte.results.flatMap(r => {
            const n=Number(r.value), t=r.timestamp?Date.parse(r.timestamp):NaN;
            return Number.isFinite(n)&&Number.isFinite(t)?[{n,t,unit:String(r.unit||'')}]:[];
          });
          const units=[...new Set(numeric.map(point=>point.unit))];
          para(analyte.name, analyte.panel);
          if(numeric.length&&units.length===1){
            const points=numeric.sort((a,b)=>a.t-b.t),min=Math.min(...points.map(point=>point.n)),max=Math.max(...points.map(point=>point.n));
            const span=max-min||Math.max(Math.abs(max)*.1,1),low=min-span*.1,high=max+span*.1,x0=points[0].t,x1=points[points.length-1].t||x0+1;
            ensureSpace(34,'Laboratory Appendix');doc.setFont('helvetica','bold');doc.setFontSize(7.5);text(navy);doc.text(`${analyte.name} trend (${units[0]||'unit not recorded'})`,MARGIN+3,y+4);
            const xAt=(t:number)=>MARGIN+12+(t-x0)/(x1-x0)*(CONTENT_W-24),yAt=(n:number)=>y+24-(n-low)/(high-low)*16;
            draw(line);doc.line(MARGIN+10,y+25,MARGIN+CONTENT_W-6,y+25);draw(blueBar);doc.setLineWidth(.7);
            points.forEach((point,index)=>{const xx=xAt(point.t),yy=yAt(point.n);doc.circle(xx,yy,1,'F');if(index)doc.line(xAt(points[index-1].t),yAt(points[index-1].n),xx,yy);});
            doc.setFont('helvetica','normal');doc.setFontSize(6.5);text(muted);doc.text(String(low.toPrecision(4)),MARGIN+2,y+24);doc.text(String(high.toPrecision(4)),MARGIN+2,y+10);y+=31;
          } else if(numeric.length&&units.length>1) para('Trend chart','Not plotted: recorded values use different units.');
          cleanTable(['Date','Value','Unit','Reference','Flag'],[38,35,32,52,37],analyte.results.map(r=>[
            r.timestamp&&Number.isFinite(Date.parse(r.timestamp))?r.timestamp:'Undated',String(r.value??''),String(r.unit||''),String(r.referenceRange||''),String(r.flag||r.status||''),
          ]),'laboratory results','Laboratory Appendix');
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
