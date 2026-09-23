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

const sections = [
  ['overview', 'Overview'],
  ['history', 'History'],
  ['vitals', 'Vitals & Balance'],
  ['ecg', 'ECG'],
  ['examination', 'Examination'],
  ['cardiology', 'Cardiology'],
  ['medications', 'Medications'],
  ['icu', 'ICU / Ventilator'],
  ['imaging', 'Imaging'],
  ['labs', 'Laboratory'],
  ['procedures', 'Procedures'],
  ['calculators', 'Calculators'],
  ['progress', 'Progress Notes'],
  ['timeline', 'Timeline (Chronological)'],
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

const imageData = async (url: string): Promise<string | null> => {
  try {
    const source = url.startsWith('data:image/')
      ? url
      : await new Promise<string | null>(resolve => {
          const controller = new AbortController();
          const timer = window.setTimeout(() => controller.abort(), 5000);
          fetch(url, { signal: controller.signal })
            .then(response => {
              window.clearTimeout(timer);
              if (!response.ok) {
                resolve(null);
                return null;
              }
              return response.blob();
            })
            .then(blob => {
              if (!blob) return;
              const reader = new FileReader();
              reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
              reader.onerror = () => resolve(null);
              reader.readAsDataURL(blob);
            })
            .catch(() => {
              window.clearTimeout(timer);
              resolve(null);
            });
        });

    if (!source) return null;

    // jsPDF is much more reliable on Android when attached clinical images are
    // normalized to JPEG instead of passing through PNG/WebP/SVG formats.
    return await new Promise<string | null>(resolve => {
      const image = new Image();
      image.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = Math.max(1, image.naturalWidth || image.width);
          canvas.height = Math.max(1, image.naturalHeight || image.height);
          const context = canvas.getContext('2d');
          if (!context) {
            resolve(source);
            return;
          }
          context.fillStyle = '#ffffff';
          context.fillRect(0, 0, canvas.width, canvas.height);
          context.drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL('image/jpeg', 0.88));
        } catch {
          resolve(source);
        }
      };
      image.onerror = () => resolve(source);
      image.src = source;
    });
  } catch {
    return null;
  }
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

      const navy = [7, 42, 67];
      const teal = [0, 164, 180];
      const cyan = [18, 184, 196];
      const ink = [28, 48, 65];
      const muted = [91, 110, 126];
      const line = [205, 222, 230];
      const pale = [232, 245, 248];
      const white = [255, 255, 255];
      let page = 1;

      const fill = (c: number[]) => doc.setFillColor(c[0], c[1], c[2]);
      const draw = (c: number[]) => doc.setDrawColor(c[0], c[1], c[2]);
      const text = (c: number[]) => doc.setTextColor(c[0], c[1], c[2]);

      const logo = () => {
        fill(teal);
        doc.roundedRect(8, 7, 18, 18, 4, 4, 'F');
        draw(white);
        doc.setLineWidth(0.8);
        doc.line(11, 16, 14, 16);
        doc.line(14, 16, 15.8, 12);
        doc.line(15.8, 12, 18, 20);
        doc.line(18, 20, 20.2, 14);
        doc.line(20.2, 14, 22, 16);
        doc.line(22, 16, 24, 16);
      };

      const header = () => {
        fill(navy);
        doc.rect(0, 0, 210, 31, 'F');
        logo();

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(21);
        text(white);
        doc.text('Cardio', 31, 15);
        text(cyan);
        doc.text('Vault', 58, 15);

        doc.setFontSize(8.2);
        text(white);
        doc.text('ICU & CCU Clinical Record', 31, 21);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.8);
        text([175, 218, 225]);
        doc.text('Your Patients. Your Data. Always With You.', 31, 26);

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(8);
        text(cyan);
        doc.text('CLINICAL REPORT', 166, 11);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(6.6);
        text([205, 230, 235]);
        doc.text('Confidential Medical Record', 166, 17);
      };

      const footer = () => {
        fill([248, 251, 252]);
        doc.rect(0, 281, 210, 16, 'F');
        draw(line);
        doc.setLineWidth(0.3);
        doc.line(8, 281, 202, 281);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        text(muted);
        doc.text('CardioVault  •  ICU & CCU Clinical Record', 9, 288);
        doc.text('Confidential Medical Record', 9, 292);
        doc.setFont('helvetica', 'bold');
        text(navy);
        doc.text(`Page ${page} of 4`, 178, 292);
      };

      const patientBanner = () => {
        fill([246, 251, 252]);
        draw(line);
        doc.roundedRect(8, 35, 194, 25, 2.5, 2.5, 'FD');

        fill([218, 239, 243]);
        doc.circle(21, 47.5, 7.5, 'F');
        fill(navy);
        doc.circle(21, 45.2, 2.2, 'F');
        doc.roundedRect(17.5, 48, 7, 4.5, 1.5, 1.5, 'F');

        doc.setFont('helvetica', 'bold');
        doc.setFontSize(13);
        text(navy);
        doc.text(compact(patient.fullName, 34) || 'Unnamed Patient', 33, 45);

        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        text(ink);
        doc.text(
          `MRN: ${val(patient.mrn)}   •   Age/Sex: ${val(patient.age)} / ${val(patient.sex)}   •   Unit: ${val(unit?.name)}   •   Bed: ${val(bed?.bedNumber)}`,
          33,
          51
        );
        doc.text(
          `Admission: ${val(patient.admissionDate)} ${val(patient.admissionTime)}   •   Status: ${val(patient.status, 'Active')}`,
          33,
          56
        );

        fill(teal);
        doc.roundedRect(174, 39, 23, 7, 2, 2, 'F');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(7.5);
        text(white);
        doc.text(val(patient.status, 'ACTIVE').toUpperCase(), 177, 44);
      };

      const sectionTitle = (label: string, x: number, y: number, w: number, icon = '') => {
        fill(pale);
        draw(line);
        doc.roundedRect(x, y, w, 8, 1.8, 1.8, 'FD');
        fill(teal);
        doc.roundedRect(x, y, 2.2, 8, 1.2, 1.2, 'F');
        fill(navy);
        doc.circle(x + 9, y + 4, 2.2, 'F');
        fill(white);
        if (icon === 'patient') {
          doc.circle(x + 9, y + 3.1, 0.7, 'F');
          doc.roundedRect(x + 7.5, y + 4.1, 3, 2.2, 0.8, 0.8, 'F');
        } else if (icon === 'ecg') {
          doc.setLineWidth(0.5);
          doc.line(x + 6.8, y + 4.2, x + 8, y + 4.2);
          doc.line(x + 8, y + 4.2, x + 8.7, y + 2.4);
          doc.line(x + 8.7, y + 2.4, x + 9.4, y + 5.7);
          doc.line(x + 9.4, y + 5.7, x + 10.2, y + 3.6);
          doc.line(x + 10.2, y + 3.6, x + 11.2, y + 3.6);
        } else if (icon === 'meds' || icon === 'infusions') {
          doc.roundedRect(x + 7.2, y + 3.2, 3.6, 1.6, 0.8, 0.8, 'F');
          doc.line(x + 9, y + 3.2, x + 9, y + 4.8);
        } else if (icon === 'labs') {
          doc.rect(x + 7.8, y + 2.4, 2.4, 3.2, 'F');
          doc.line(x + 7.5, y + 2.4, x + 10.5, y + 2.4);
        } else if (icon === 'procedures' || icon === 'plan') {
          doc.rect(x + 8.1, y + 2.4, 1.8, 3.4, 'F');
          doc.rect(x + 7.3, y + 3.2, 3.4, 1.8, 'F');
        } else if (icon === 'progress' || icon === 'notes') {
          doc.rect(x + 7.5, y + 2.7, 3, 3, 'F');
          doc.line(x + 8, y + 3.5, x + 10, y + 3.5);
          doc.line(x + 8, y + 4.4, x + 10, y + 4.4);
        } else {
          doc.rect(x + 7.5, y + 2.8, 3, 2.8, 'F');
        }
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        text(navy);
        doc.text(label, x + 14, y + 5.3);
      };

      const field = (x: number, y: number, label: string, value: any, w: number) => {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        text(teal);
        doc.text(label, x, y);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(10);
        text(ink);
        const lines = doc.splitTextToSize(compact(value, 55) || '—', w) as string[];
        doc.text(lines.slice(0, 2), x, y + 4);
      };

      const twoColumnFields = (
        x: number,
        y: number,
        w: number,
        rows: Array<[string, any]>
      ) => {
        const half = (w - 4) / 2;
        rows.slice(0, 6).forEach((row, i) => {
          const col = i % 2;
          const r = Math.floor(i / 2);
          const xx = x + col * (half + 4);
          const yy = y + r * 11;
          fill(white);
          draw(line);
          doc.roundedRect(xx, yy, half, 9, 1.2, 1.2, 'FD');
          field(xx + 3, yy + 3.2, row[0], row[1], half - 6);
        });
        return y + Math.ceil(Math.min(rows.length, 6) / 2) * 11;
      };

      const paragraphBox = (
        x: number,
        y: number,
        w: number,
        h: number,
        label: string,
        value: any,
        max = 180
      ) => {
        fill(white);
        draw(line);
        doc.roundedRect(x, y, w, h, 1.4, 1.4, 'FD');
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(5.7);
        text(teal);
        doc.text(label, x + 3, y + 4);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(14);
        text(ink);
        const lines = doc.splitTextToSize(compact(value, max) || '—', w - 6) as string[];
        doc.text(lines.slice(0, Math.max(1, Math.floor((h - 6) / 3.2))), x + 3, y + 8);
      };

      const table = (
        x: number,
        y: number,
        widths: number[],
        headers: string[],
        rows: string[][],
        rowH = 6.2,
        maxRows = 6
      ) => {
        let xx = x;
        fill([224, 239, 244]);
        draw(line);
        headers.forEach((h, i) => {
          doc.rect(xx, y, widths[i], rowH, 'FD');
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(6.6);
          text(navy);
          doc.text(compact(h, 18), xx + 1.7, y + 4.1);
          xx += widths[i];
        });
        let yy = y + rowH;
        rows.slice(0, maxRows).forEach(row => {
          xx = x;
          row.forEach((cell, i) => {
            fill(white);
            draw(line);
            doc.rect(xx, yy, widths[i], rowH, 'FD');
            doc.setFont('helvetica', 'normal');
            doc.setFontSize(10);
            text(ink);
            doc.text(compact(cell, Math.max(10, Math.floor(widths[i] / 1.8))), xx + 1.7, yy + 4.1);
            xx += widths[i];
          });
          yy += rowH;
        });
        return yy;
      };

      const drawFirstPage = async () => {
        header();
        patientBanner();

        let y = 65;

        if (has('overview')) {
          sectionTitle('Patient Information', 8, y, 194, 'patient');
          y += 10;
          y = twoColumnFields(8, y, 194, [
            ['Primary Diagnosis', patient.primaryDiagnosis],
            ['Secondary Diagnoses', patient.secondaryDiagnoses],
            ['Allergies', (patient as any).allergies],
            ['Weight', patient.weight ? `${patient.weight} kg` : ''],
            ['Height', patient.height ? `${patient.height} cm` : ''],
            ['Code Status', patient.codeStatus],
          ]);
        }

        if (has('overview') || has('history')) {
          y += 2;
          sectionTitle('Clinical Summary & History', 8, y, 104, 'history');
          sectionTitle('History / Examination', 108, y, 94, 'exam');
          y += 10;
          const summary: any = (patient as any).clinicalSummary || {};
          paragraphBox(8, y, 104, 27, 'Clinical Summary', summary.summary || summary.hpi || patient.primaryDiagnosis, 170);
          paragraphBox(108, y, 94, 27, 'Chief Complaint', summary.chiefComplaint, 130);
          y += 30;
          paragraphBox(8, y, 104, 27, 'History of Present Illness', summary.hpi, 170);
          const ex: any = (patient as any).examination || {};
          paragraphBox(108, y, 94, 27, 'Examination', ex.general?.appearance || ex.neurological?.gcs || ex.cardiovascular?.heartSounds, 130);
          y += 30;
        }

        if (has('vitals')) {
          sectionTitle('Vitals & Balance (Latest)', 8, y, 96, 'vitals');
          sectionTitle('Investigations (Latest)', 106, y, 96, 'labs');
          y += 10;

          const v: any = (patient as any).vitalsHistory?.[0] || {};
          twoColumnFields(8, y, 96, [
            ['BP', v.sbp ? `${v.sbp}/${val(v.dbp)} mmHg` : ''],
            ['HR', v.hr ? `${v.hr} bpm` : ''],
            ['RR', v.rr ? `${v.rr}/min` : ''],
            ['SpO₂', v.spo2 ? `${v.spo2}%` : ''],
            ['Temp', v.temp ? `${v.temp} °C` : ''],
            ['GCS', v.gcsTotal ? `${v.gcsTotal}/15` : ''],
          ]);

          const lab: any = (patient as any).labs?.[0] || {};
          table(106, y, [26, 24, 24, 22], ['Test', 'Result', 'Test', 'Result'], [
            ['Hb', val(lab.hb), 'WBC', val(lab.wbc)],
            ['Platelets', val(lab.platelets), 'Cr', val(lab.creatinine)],
            ['Na', val(lab.na), 'K', val(lab.k)],
            ['Troponin', val(lab.troponin), 'INR', val(lab.inr)],
          ], 6.2, 4);

          y += 36;
        }

        if (has('ecg')) {
          sectionTitle('ECG (Latest)', 8, y, 96, 'ecg');
          const e: any = (patient as any).ecgRecords?.[0] || {};
          y += 10;
          paragraphBox(8, y, 96, 38, 'Interpretation', e.finalImpression || e.interpretation?.join(' • '), 160);

          const ecgUrl = (e.imageUrls || [])[0];
          if (ecgUrl) {
            const data = await imageData(ecgUrl);
            if (data) {
              try {
                doc.addImage(data, 'JPEG', 108, y, 94, 38, undefined, 'FAST');
              } catch {
                paragraphBox(108, y, 94, 38, 'ECG Image', 'Attached ECG image available in the patient record.', 130);
              }
            } else {
              paragraphBox(108, y, 94, 38, 'ECG Image', 'Attached ECG image available in the patient record.', 130);
            }
          } else {
            paragraphBox(108, y, 94, 38, 'ECG Details', `HR ${val(e.heartRate)} • Rhythm ${val(e.rhythm)} • Axis ${val(e.axis)} • QTc ${val(e.qtc)}`, 130);
          }
          y += 42;
        }

        if (has('cardiology')) {
          sectionTitle('Echocardiography (Latest)', 8, y, 194, 'echo');
          y += 10;
          const echo: any = (patient as any).cardiology?.echo || {};
          twoColumnFields(8, y, 194, [
            ['LVEF', echo.ef ? `${echo.ef}%` : ''],
            ['LV Function', echo.lvFunction],
            ['RWMA', echo.rwma],
            ['RV Function', echo.rvFunction],
            ['Valvular Disease', echo.otherFindings],
            ['Summary', (patient as any).cardiology?.echoBriefSummary],
          ]);
        }

        footer();
      };

      const drawSecondPage = () => {
        page = 2;
        doc.addPage();
        header();
        patientBanner();

        let y = 65;

        if (has('medications')) {
          sectionTitle('Medications (Current)', 8, y, 112, 'meds');
          sectionTitle('Infusions (Current)', 122, y, 80, 'infusions');
          y += 10;

          const meds: any[] = ((patient as any).medications || []).filter((m: any) => m.status !== 'Discontinued');
          table(8, y, [40, 23, 22, 27], ['Drug', 'Dose', 'Route', 'Frequency'], meds.map(m => [
            val(m.name || m.drug), val(m.dose), val(m.route), val(m.frequency),
          ]), 6.2, 6);

          const infusions: any[] = (patient as any).infusions || (patient as any).activeInfusions || [];
          table(122, y, [30, 25, 25], ['Drug', 'Rate', 'Indication'], infusions.map(i => [
            val(i.name || i.drug), val(i.rate || i.dose), compact(i.indication, 22),
          ]), 6.2, 6);

          y += 50;
        }

        if (has('procedures')) {
          sectionTitle('Procedures & Interventions', 8, y, 112, 'procedures');
          sectionTitle('Lines & Devices', 122, y, 80, 'devices');
          y += 10;

          const procedures: any[] = (patient as any).procedures || [];
          table(8, y, [25, 45, 42], ['Date', 'Procedure', 'Details'], procedures.map(p => [
            val(p.date), val(p.procedure || p.name || p.surgeryName), compact(p.outcome || p.findings || p.indication, 40),
          ]), 6.2, 5);

          const devices: any[] = (patient as any).devices || (patient as any).lines || [];
          table(122, y, [28, 25, 27], ['Device', 'Site', 'Date'], devices.map(d => [
            val(d.device || d.name || d.type), val(d.site), val(d.date),
          ]), 6.2, 5);

          y += 43;
        }

        if (has('cardiology')) {
          sectionTitle('Cardiology', 8, y, 96, 'cardiology');
          sectionTitle('ICU', 106, y, 96, 'icu');
          y += 10;

          const c: any = (patient as any).cardiology || {};
          twoColumnFields(8, y, 96, [
            ['Diagnosis', c.diagnosis || patient.primaryDiagnosis],
            ['LVEF', c.ef ? `${c.ef}%` : c.echo?.ef ? `${c.echo.ef}%` : ''],
            ['Coronary Angiography', c.coronaryAngiography],
            ['Stents / Devices', c.stentsDevices || c.stents],
            ['Antiplatelets', c.antiplatelets],
            ['Anticoagulation', c.anticoagulation],
          ]);

          const icu: any = (patient as any).icu || {};
          twoColumnFields(106, y, 96, [
            ['Ventilator', icu.ventilator || (patient as any).ventilator?.mode],
            ['Sedation', icu.sedation],
            ['Vasopressors', icu.vasopressors],
            ['Neurological Status', icu.neurologicalStatus || icu.gcs],
            ['SOFA', icu.sofa],
            ['APACHE II', icu.apacheII],
          ]);

          y += 42;
        }

        if (has('progress')) {
          sectionTitle('Progress Notes (Latest)', 8, y, 194, 'progress');
          y += 10;
          const notes: any[] = (patient as any).progressNotes || [];
          table(8, y, [31, 38, 125], ['Date & Time', 'Author', 'Note'], notes.map(n => [
            `${val(n.date)} ${val(n.time)}`,
            compact(n.author, 22),
            compact(n.assessment || n.plan || n.events || n.note, 105),
          ]), 6.2, 5);
          y += 40;
        }

        if (has('calculators') || has('timeline') || has('overview')) {
          sectionTitle('Plan & Follow Up', 8, y, 112, 'plan');
          sectionTitle('Additional Notes', 122, y, 80, 'notes');
          y += 10;

          const latest: any = (patient as any).progressNotes?.[0] || {};
          paragraphBox(8, y, 112, 34, 'Current Plan', latest.plan || 'Continue monitoring, investigations and treatment according to the active clinical plan.', 170);

          const timeline = ((patient as any).auditTrail || []).slice(0, 3).map((e: any) =>
            `${new Date(e.timestamp).toLocaleDateString()} — ${e.action}`
          ).join(' • ');
          paragraphBox(122, y, 80, 34, 'Record Note', timeline || 'This report contains selected clinical data from the patient file.', 100);
        }

        footer();
      };

      await drawFirstPage();
      drawSecondPage();

      // Generate the PDF exactly once as a Blob. This is more reliable in Android
      // WebView than mixing arraybuffer/data-uri output paths.
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
      const message = error instanceof Error ? error.message : String(error);
      console.error('CardioVault PDF export detail:', message);
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
              CardioVault premium clinical template • A4 clinical report • Arabic patient names supported.
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
              <span className="w-6 h-6 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center text-[9px] font-black shrink-0">
                {id === 'ecg' ? 'ECG' : id === 'labs' ? 'LAB' : id === 'imaging' ? 'IMG' : id === 'medications' ? 'RX' : id === 'procedures' ? 'PRO' : id === 'calculators' ? 'CAL' : id === 'progress' ? 'NOTE' : id === 'timeline' ? 'TL' : id === 'cardiology' ? '♥' : id === 'icu' ? 'ICU' : '•'}
              </span>
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
