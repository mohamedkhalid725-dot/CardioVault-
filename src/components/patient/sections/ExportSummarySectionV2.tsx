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

// Clean section list in required report order.
const sections = [
  ['history', 'History'],
  ['examination', 'Examination'],
  ['vitals', 'Vitals Summary'],
  ['labs', 'Laboratory'],
  ['imaging', 'Imaging'],
  ['medications', 'Medications'],
  ['procedures', 'Procedures'],
  ['progress', 'Progress Notes'],
] as const;

const val = (v: any, fallback = '—') => {
  if (v === undefined || v === null || v === '') return fallback;
  if (Array.isArray(v)) return v.length ? v.join(', ') : fallback;
  return String(v);
};

const compact = (v: any, max = 90) => {
  const s = val(v, '');
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
};

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

      // ---- palette ----
      const navy = [7, 42, 67];
      const teal = [0, 164, 180];
      const cyan = [18, 184, 196];
      const ink = [28, 48, 65];
      const muted = [91, 110, 126];
      const line = [205, 222, 230];
      const pale = [232, 245, 248];
      const white = [255, 255, 255];

      const PAGE_W = 210;
      const MARGIN = 8;
      const CONTENT_W = PAGE_W - MARGIN * 2; // 194
      const FOOTER_TOP = 270; // content must stay above this
      const generatedAt = new Date().toLocaleString();

      const fill = (c: number[]) => doc.setFillColor(c[0], c[1], c[2]);
      const draw = (c: number[]) => doc.setDrawColor(c[0], c[1], c[2]);
      const text = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);

      let y = 0;

      const header = () => {
        fill(navy);
        doc.rect(0, 0, PAGE_W, 26, 'F');
        // logo
        fill(teal);
        doc.roundedRect(8, 6, 16, 16, 3.5, 3.5, 'F');
        draw(white);
        doc.setLineWidth(0.8);
        doc.line(10.5, 14, 13, 14);
        doc.line(13, 14, 14.5, 10.5);
        doc.line(14.5, 10.5, 16.5, 17.5);
        doc.line(16.5, 17.5, 18, 12.5);
        doc.line(18, 12.5, 21.5, 14);
        // title
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(19);
        text(white);
        doc.text('Cardio', 28, 13.5);
        text(cyan);
        doc.text('Vault', 28 + doc.getTextWidth('Cardio') + 1.5, 13.5);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        text([175, 218, 225]);
        doc.text('ICU & CCU Clinical Record', 28, 19);
        // patient identity on the right of the header
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8.5);
        text(white);
        doc.text(compact(patient.fullName, 40) || 'Unnamed Patient', 202, 10, { align: 'right' });
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        text([205, 230, 235]);
        doc.text(`MRN: ${val(patient.mrn)}   •   Bed: ${val(bed?.bedNumber)}`, 202, 15.5, { align: 'right' });
        doc.text(`Generated: ${generatedAt}`, 202, 20.5, { align: 'right' });
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
        doc.text(`CardioVault  •  Confidential Medical Record  •  Generated ${generatedAt}`, 9, 288);
      };

      // Simplified measured page-break guard: estimate block height with the
      // same splitTextToSize wrap math used for drawing, then roll to a fresh
      // headered page before content can collide with the footer.
      const newPage = (continuationLabel?: string) => {
        footer();
        doc.addPage();
        header();
        y = 32;
        if (continuationLabel) {
          sectionTitle(`${continuationLabel} (continued)`);
        }
      };
      const ensureSpace = (needed: number, continuationLabel?: string) => {
        if (y + needed > FOOTER_TOP) newPage(continuationLabel);
      };

      const sectionTitle = (label: string) => {
        ensureSpace(12);
        fill(pale);
        draw(line);
        doc.roundedRect(MARGIN, y, CONTENT_W, 8, 1.8, 1.8, 'FD');
        fill(teal);
        doc.roundedRect(MARGIN, y, 2.2, 8, 1.2, 1.2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        text(navy);
        doc.text(label, MARGIN + 5, y + 5.4);
        y += 10.5;
      };

      const measureLines = (s: string, w: number): string[] =>
        doc.splitTextToSize(s, w) as string[];

      // Label + wrapped value stacked block.
      const para = (label: string, value: any) => {
        const lines = measureLines(val(value, '—'), CONTENT_W - 6);
        const h = 9 + lines.length * 3.8;
        ensureSpace(h);
        fill(white);
        draw(line);
        doc.roundedRect(MARGIN, y, CONTENT_W, h, 1.4, 1.4, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        text(teal);
        doc.text(label, MARGIN + 3, y + 4);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9.5);
        text(ink);
        doc.text(lines, MARGIN + 3, y + 8);
        y += h + 2.5;
      };

      // Two-column key/value grid.
      const kvGrid = (rows: Array<[string, any]>) => {
        const half = (CONTENT_W - 3) / 2;
        for (let i = 0; i < rows.length; i += 2) {
          const pair = rows.slice(i, i + 2);
          const heights = pair.map(([label, value]) => {
            const vLines = measureLines(val(value, '—'), half - 6);
            const lLines = measureLines(label, half - 6);
            return 8 + (lLines.length + vLines.length) * 3.6;
          });
          const boxH = Math.max(13, ...heights);
          ensureSpace(boxH + 2);
          pair.forEach(([label, value], col) => {
            const xx = MARGIN + col * (half + 3);
            fill(white);
            draw(line);
            doc.roundedRect(xx, y, half, boxH, 1.2, 1.2, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.5);
            text(teal);
            doc.text(label, xx + 3, y + 4);
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(9.5);
            text(ink);
            doc.text(measureLines(val(value, '—'), half - 6), xx + 3, y + 8);
          });
          y += boxH + 2;
        }
        y += 1;
      };

      // Clean table with per-row page-break guard and repeated header.
      const cleanTable = (headers: string[], widths: number[], rows: string[][], emptyLabel: string, sectionLabel: string) => {
        const rowH = 6.2;
        if (!rows.length) {
          ensureSpace(9);
          doc.setFont('helvetica', 'italic');
          doc.setFontSize(8.5);
          text(muted);
          doc.text(`No ${emptyLabel} recorded.`, MARGIN + 1, y + 5);
          y += 9;
          return;
        }
        const drawHeaderRow = () => {
          let xx = MARGIN;
          fill([225, 241, 245]);
          draw([184, 208, 218]);
          headers.forEach((h, i) => {
            doc.rect(xx, y, widths[i], rowH, 'FD');
            doc.setFont('helvetica', 'bold');
            doc.setFontSize(7.8);
            text(navy);
            doc.text(h, xx + 1.7, y + 4.4);
            xx += widths[i];
          });
          y += rowH;
        };
        ensureSpace(rowH * 2);
        drawHeaderRow();
        rows.forEach(row => {
          const cellLines = widths.map((w, i) => measureLines(val(row[i], '—'), w - 3.4));
          const rh = Math.max(rowH, 3 + Math.max(...cellLines.map(l => l.length)) * 3.7);
          if (y + rh > FOOTER_TOP) {
            newPage(sectionLabel);
            drawHeaderRow();
          }
          let xx = MARGIN;
          doc.setFont('helvetica', 'normal');
          doc.setFontSize(8.8);
          widths.forEach((w, i) => {
            fill(white);
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

      // ---- document ----
      header();
      y = 30;

      // Patient banner
      {
        const bannerH = 22;
        ensureSpace(bannerH + 3);
        fill([246, 251, 252]);
        draw(line);
        doc.roundedRect(MARGIN, y, CONTENT_W, bannerH, 2.5, 2.5, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(12);
        text(navy);
        doc.text(compact(patient.fullName, 34) || 'Unnamed Patient', MARGIN + 5, y + 7);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        text(ink);
        doc.text(
          `Age/Sex: ${val(patient.age)} / ${val(patient.sex)}   •   Unit: ${val(unit?.name)}   •   Bed: ${val(bed?.bedNumber)}   •   Status: ${val(patient.status, 'Active')}`,
          MARGIN + 5, y + 13
        );
        doc.text(
          `Diagnosis: ${compact(patient.primaryDiagnosis, 70)}   •   Admission: ${val(patient.admissionDate)} ${val(patient.admissionTime)}`,
          MARGIN + 5, y + 18.5
        );
        y += bannerH + 4;
      }

      const p: any = patient as any;

      if (has('history')) {
        sectionTitle('History');
        const s: any = p.clinicalSummary || {};
        para('Chief Complaint', s.chiefComplaint);
        para('History of Present Illness', s.hpi || s.summary);
        kvGrid([
          ['Past Medical History', (s.pmh || []).join(', ')],
          ['Past Surgical History', (s.psh || []).join(', ')],
          ['Drug History', s.drugHistory],
          ['Allergies', (s.allergies || p.allergies || []).join(', ')],
          ['Family History', s.familyHistory],
          ['Social History', s.socialHistory],
        ]);
      }

      if (has('examination')) {
        sectionTitle('Examination');
        const ex: any = p.examination || {};
        kvGrid([
          ['General', [ex.general?.appearance, ex.general?.consciousness, ex.general?.distress].filter(Boolean).join(' • ')],
          ['Cardiovascular', [ex.cardiovascular?.heartSounds, ex.cardiovascular?.murmurs, ex.cardiovascular?.jvp].filter(Boolean).join(' • ')],
          ['Respiratory', [ex.respiratory?.chestExam, ex.respiratory?.airEntry, ex.respiratory?.addedSounds].filter(Boolean).join(' • ')],
          ['Abdomen', [ex.abdomen?.inspection, ex.abdomen?.palpation, ex.abdomen?.tenderness].filter(Boolean).join(' • ')],
          ['Neurological', [ex.neurological?.consciousness, ex.neurological?.gcs, ex.neurological?.pupils].filter(Boolean).join(' • ')],
          ['Extremities', [ex.extremities?.pulses, ex.extremities?.edema, ex.extremities?.perfusion].filter(Boolean).join(' • ')],
        ]);
      }

      if (has('vitals')) {
        sectionTitle('Vitals Summary (Latest)');
        const v: any = p.vitalsHistory?.[0] || {};
        kvGrid([
          ['Blood Pressure', v.sbp ? `${v.sbp}/${val(v.dbp)} mmHg` : ''],
          ['Heart Rate', v.hr ? `${v.hr} bpm` : ''],
          ['Respiratory Rate', v.rr ? `${v.rr}/min` : ''],
          ['SpO₂', v.spo2 ? `${v.spo2}%` : ''],
          ['Temperature', v.temp ? `${v.temp} °C` : ''],
          ['GCS', v.gcsTotal ? `${v.gcsTotal}/15` : ''],
        ]);
      }

      if (has('labs')) {
        sectionTitle('Laboratory (Latest, Grouped Panels)');
        const lab: any = p.labs?.[0] || {};
        const num = (k: string) => {
          const raw = lab[k];
          return raw === undefined || raw === null || raw === '' ? '—' : String(raw);
        };
        cleanTable(['CBC', 'Result', 'Test', 'Result'], [48, 48, 48, 50], [
          ['Hb', num('hb'), 'WBC', num('wbc')],
          ['Platelets', num('platelets'), 'HCT', num('hct')],
        ], 'CBC results', 'Laboratory');
        cleanTable(['Renal', 'Result', 'Test', 'Result'], [48, 48, 48, 50], [
          ['Urea', num('urea'), 'Creatinine', num('creatinine')],
          ['eGFR', num('egfr'), 'Uric Acid', num('uricAcid')],
        ], 'renal results', 'Laboratory');
        cleanTable(['Electrolytes', 'Result', 'Test', 'Result'], [48, 48, 48, 50], [
          ['Na', num('na'), 'K', num('k')],
          ['Cl', num('cl'), 'Ca', num('ca')],
        ], 'electrolyte results', 'Laboratory');
        cleanTable(['Cardiac / Inflammatory', 'Result', 'Test', 'Result'], [48, 48, 48, 50], [
          ['Troponin', num('troponin'), 'CK-MB', num('ckmb')],
          ['CRP', num('crp'), 'Lactate', num('lactate')],
          ['INR', num('inr'), 'Glucose', num('glucose')],
        ], 'cardiac results', 'Laboratory');
      }

      if (has('imaging')) {
        sectionTitle('Imaging');
        const studies: any[] = p.imaging || [];
        cleanTable(
          ['Date', 'Modality', 'Region', 'Impression'],
          [28, 36, 45, 85],
          studies.map(s => [
            val(s.date),
            val(s.modality || s.type),
            val(s.bodyRegion || s.region),
            compact(s.impression || s.findings, 80),
          ]),
          'imaging studies',
          'Imaging'
        );
      }

      if (has('medications')) {
        sectionTitle('Medications (Current)');
        const meds: any[] = (p.medications || []).filter((m: any) => m.status !== 'Discontinued');
        cleanTable(
          ['Drug', 'Dose', 'Route', 'Frequency'],
          [62, 42, 36, 54],
          meds.map(m => [val(m.name || m.drug), val(m.dose), val(m.route), val(m.frequency)]),
          'medications',
          'Medications'
        );
        const infusions: any[] = p.infusions || p.activeInfusions || [];
        if (infusions.length) {
          sectionTitle('Infusions (Current)');
          cleanTable(
            ['Drug', 'Rate', 'Details'],
            [62, 52, 80],
            infusions.map(i => [
              val(i.drugName || (i as any).name || (i as any).drug),
              val((i as any).rateMlHr ? `${(i as any).rateMlHr} mL/hr` : (i as any).rate || (i as any).dose),
              compact((i as any).carrierFluid || (i as any).indication || (i as any).concentration, 50),
            ]),
            'infusions',
            'Infusions'
          );
        }
      }

      if (has('procedures')) {
        sectionTitle('Procedures & Interventions');
        const procs: any[] = p.procedures || [];
        cleanTable(
          ['Date', 'Procedure', 'Details'],
          [28, 62, 104],
          procs.map(pr => [
            val(pr.date),
            val(pr.procedure || pr.name || pr.surgeryName),
            compact(pr.outcome || pr.findings || pr.indication, 80),
          ]),
          'procedures',
          'Procedures'
        );
      }

      if (has('progress')) {
        sectionTitle('Progress Notes (Latest)');
        const notes: any[] = (p.progressNotes || []).slice(0, 12);
        cleanTable(
          ['Date & Time', 'Author', 'Note'],
          [32, 38, 124],
          notes.map(n => [
            `${val(n.date)} ${val(n.time)}`,
            compact(n.author, 22),
            compact(n.assessment || n.plan || n.events || n.note, 120),
          ]),
          'progress notes',
          'Progress Notes'
        );
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

      const filename = `CardioVault-${patient.mrn || patient.id}.pdf`;

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
            <h2 className="text-xl font-bold">Clinical PDF Export</h2>
            <p className="text-xs text-slate-500 mt-1">
              CardioVault clinical template • A4 report • Arabic patient names supported.
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
              <p className="text-xs text-slate-500">Real generated PDF • A4 clinical report.</p>
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
