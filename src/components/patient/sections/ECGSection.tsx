import React, { useState, useRef } from 'react';
import {
  Activity,
  Plus,
  Image as ImageIcon,
  ZoomIn,
  Trash2,
  Calendar,
  Clock,
  Heart,
  FileCheck,
  CheckCircle2,
  Maximize2,
  X,
} from 'lucide-react';
import { Patient, ECGRecord } from '../../../types/clinical';
import { useApp } from '../../../context/AppContext';

interface ECGSectionProps {
  patient: Patient;
}

export const ECGSection: React.FC<ECGSectionProps> = ({ patient }) => {
  const { updatePatient, showToast } = useApp();
  const [selectedTab, setSelectedTab] = useState<'latest' | 'previous'>('latest');
  const [selectedRecordIndex, setSelectedRecordIndex] = useState<number>(0);
  const [fullScreenImage, setFullScreenImage] = useState<string | null>(null);
  const [showAddModal, setShowAddModal] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // New ECG form state
  const [newHR, setNewHR] = useState(88);
  const [newRhythm, setNewRhythm] = useState('Sinus rhythm');
  const [newAxis, setNewAxis] = useState('Normal');
  const [newPR, setNewPR] = useState(160);
  const [newQRS, setNewQRS] = useState(88);
  const [newQTc, setNewQTc] = useState(420);
  const [newInterpretation, setNewInterpretation] = useState(
    'Sinus rhythm\nNormal axis\nNon-specific ST-T changes\nNo acute ischemic changes'
  );
  const [newImpression, setNewImpression] = useState('Normal Sinus Rhythm at 88 bpm.');

  const records = patient.ecgRecords || [];
  const currentRecord =
    selectedTab === 'latest' ? records[0] : records[selectedRecordIndex] || records[0];

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (currentRecord) {
        const updatedRecords = records.map((rec) =>
          rec.id === currentRecord.id
            ? { ...rec, imageUrls: [...(rec.imageUrls || []), dataUrl] }
            : rec
        );
        updatePatient(patient.id, { ecgRecords: updatedRecords });
        showToast('ECG Image attachment added successfully', 'success');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleAddECG = (e: React.FormEvent) => {
    e.preventDefault();
    const newRecord: ECGRecord = {
      id: `ecg-${Date.now()}`,
      date: new Date().toISOString().split('T')[0],
      time: new Date().toTimeString().slice(0, 5),
      heartRate: newHR,
      rhythm: newRhythm,
      regularity: 'Regular',
      axis: newAxis,
      pr: newPR,
      qrs: newQRS,
      qt: 380,
      qtc: newQTc,
      pWave: 'Normal',
      qrsFindings: 'Normal voltage',
      stSegment: 'Isoelectric',
      tWave: 'Normal',
      otherFindings: 'None',
      interpretation: newInterpretation.split('\n').filter((s) => s.trim().length > 0),
      finalImpression: newImpression,
      imageUrls: [],
    };

    updatePatient(patient.id, { ecgRecords: [newRecord, ...records] });
    setShowAddModal(false);
    showToast('New 12-lead ECG logged successfully', 'success');
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto animate-in fade-in duration-150">
      {/* Header matching Reference Image 2: ECG screen */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Activity className="w-5 h-5 text-cyan-500" /> 12-Lead Electrocardiogram (ECG)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            High-resolution waveform analysis, intervals & diagnostic interpretations
          </p>
        </div>

        <div className="flex items-center gap-2">
          {/* Add Image Button */}
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-semibold transition-colors"
          >
            <ImageIcon className="w-4 h-4 text-cyan-500" /> Add Image
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageUpload}
          />

          <button
            onClick={() => setShowAddModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-bold transition-colors shadow-sm"
          >
            <Plus className="w-4 h-4" /> New ECG Entry
          </button>
        </div>
      </div>

      {/* Toggle: Latest ECG vs Previous (Reference 2) */}
      <div className="flex items-center gap-2 border-b border-slate-200 dark:border-slate-800 pb-3">
        <button
          onClick={() => setSelectedTab('latest')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            selectedTab === 'latest'
              ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Latest ECG
        </button>

        <button
          onClick={() => setSelectedTab('previous')}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all ${
            selectedTab === 'previous'
              ? 'bg-cyan-500 text-slate-950 shadow-sm shadow-cyan-500/20'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
          }`}
        >
          Previous ({records.length > 1 ? records.length - 1 : 0})
        </button>

        {selectedTab === 'previous' && records.length > 1 && (
          <select
            value={selectedRecordIndex}
            onChange={(e) => setSelectedRecordIndex(parseInt(e.target.value))}
            className="ml-auto text-xs px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200"
          >
            {records.map((r, i) => (
              <option key={r.id} value={i}>
                {r.date} {r.time} ({r.heartRate} bpm)
              </option>
            ))}
          </select>
        )}
      </div>

      {currentRecord ? (
        <div className="space-y-6">
          {/* ECG Strip Title & Heart Rate (Reference Image 2 style) */}
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300">
              <Calendar className="w-4 h-4 text-cyan-500" />
              <span>
                {currentRecord.date}, {currentRecord.time}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-400">Heart Rate:</span>
              <span className="text-sm font-extrabold text-cyan-500 dark:text-cyan-400 font-mono">
                HR: {currentRecord.heartRate} bpm
              </span>
            </div>
          </div>

          {/* SVG Precision 3-Lead Medical Waveform Canvas matching Pink/Red medical grid */}
          <div className="relative rounded-2xl border border-rose-300 dark:border-rose-950/60 overflow-hidden shadow-inner ecg-grid-bg p-4 sm:p-6 select-none">
            {/* Lead I */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-rose-800 dark:text-rose-300 mb-1">
                <span>LEAD I (25 mm/s • 10 mm/mV)</span>
                <span>Normal Voltage</span>
              </div>
              <svg
                viewBox="0 0 900 70"
                className="w-full h-16 stroke-rose-900 dark:stroke-rose-400 fill-none stroke-[2]"
                preserveAspectRatio="none"
              >
                {/* Calibration pulse at left */}
                <path d="M 0 35 L 20 35 L 20 10 L 35 10 L 35 35 L 50 35" />
                {/* Repeated P-Q-R-S-T complexes */}
                <path d="M 50 35 L 80 35 Q 90 28 100 35 L 115 35 L 120 40 L 126 5 L 132 58 L 138 35 L 155 35 Q 170 24 185 35 L 230 35 Q 240 28 250 35 L 265 35 L 270 40 L 276 5 L 282 58 L 288 35 L 305 35 Q 320 24 335 35 L 380 35 Q 390 28 400 35 L 415 35 L 420 40 L 426 5 L 432 58 L 438 35 L 455 35 Q 470 24 485 35 L 530 35 Q 540 28 550 35 L 565 35 L 570 40 L 576 5 L 582 58 L 588 35 L 605 35 Q 620 24 635 35 L 680 35 Q 690 28 700 35 L 715 35 L 720 40 L 726 5 L 732 58 L 738 35 L 755 35 Q 770 24 785 35 L 830 35 Q 840 28 850 35 L 865 35 L 870 40 L 876 5 L 882 58 L 888 35 L 900 35" />
              </svg>
            </div>

            {/* Lead II (Rhythm Strip) */}
            <div className="mb-4">
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-rose-800 dark:text-rose-300 mb-1">
                <span>LEAD II (Rhythm Strip)</span>
                <span>P-R: {currentRecord.pr}ms • QRS: {currentRecord.qrs}ms</span>
              </div>
              <svg
                viewBox="0 0 900 70"
                className="w-full h-16 stroke-rose-950 dark:stroke-rose-300 fill-none stroke-[2.2]"
                preserveAspectRatio="none"
              >
                <path d="M 0 35 L 20 35 L 20 10 L 35 10 L 35 35 L 50 35" />
                <path d="M 50 35 L 80 35 Q 90 25 100 35 L 115 35 L 120 42 L 126 2 L 132 62 L 138 35 L 155 35 Q 170 22 185 35 L 230 35 Q 240 25 250 35 L 265 35 L 270 42 L 276 2 L 282 62 L 288 35 L 305 35 Q 320 22 335 35 L 380 35 Q 390 25 400 35 L 415 35 L 420 42 L 426 2 L 432 62 L 438 35 L 455 35 Q 470 22 485 35 L 530 35 Q 540 25 550 35 L 565 35 L 570 42 L 576 2 L 582 62 L 588 35 L 605 35 Q 620 22 635 35 L 680 35 Q 690 25 700 35 L 715 35 L 720 42 L 726 2 L 732 62 L 738 35 L 755 35 Q 770 22 785 35 L 830 35 Q 840 25 850 35 L 865 35 L 870 42 L 876 2 L 882 62 L 888 35 L 900 35" />
              </svg>
            </div>

            {/* Lead III */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-mono font-bold text-rose-800 dark:text-rose-300 mb-1">
                <span>LEAD III</span>
                <span>QTc: {currentRecord.qtc}ms</span>
              </div>
              <svg
                viewBox="0 0 900 70"
                className="w-full h-16 stroke-rose-900 dark:stroke-rose-400 fill-none stroke-[2]"
                preserveAspectRatio="none"
              >
                <path d="M 0 35 L 20 35 L 20 10 L 35 10 L 35 35 L 50 35" />
                <path d="M 50 35 L 80 35 Q 90 30 100 35 L 115 35 L 120 38 L 126 12 L 132 52 L 138 35 L 155 35 Q 170 26 185 35 L 230 35 Q 240 30 250 35 L 265 35 L 270 38 L 276 12 L 282 52 L 288 35 L 305 35 Q 320 26 335 35 L 380 35 Q 390 30 400 35 L 415 35 L 420 38 L 426 12 L 432 52 L 438 35 L 455 35 Q 470 26 485 35 L 530 35 Q 540 30 550 35 L 565 35 L 570 38 L 576 12 L 582 52 L 588 35 L 605 35 Q 620 26 635 35 L 680 35 Q 690 30 700 35 L 715 35 L 720 38 L 726 12 L 732 52 L 738 35 L 755 35 Q 770 26 785 35 L 830 35 Q 840 30 850 35 L 865 35 L 870 38 L 876 12 L 882 52 L 888 35 L 900 35" />
              </svg>
            </div>
          </div>

          {/* Interpretation Card (Exact matches Reference Image 2: ECG screen) */}
          <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-cyan-500" /> Interpretation
            </h3>

            <div className="space-y-2">
              {currentRecord.interpretation.map((point, index) => (
                <div
                  key={index}
                  className="flex items-center gap-2.5 text-xs font-semibold text-slate-800 dark:text-slate-200"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 flex-shrink-0" />
                  <span>{point}</span>
                </div>
              ))}
            </div>

            <div className="pt-3 border-t border-slate-100 dark:border-slate-800">
              <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                Final Clinical Impression
              </span>
              <p className="text-xs font-medium text-slate-700 dark:text-slate-300">
                {currentRecord.finalImpression}
              </p>
            </div>
          </div>

          {/* Measurements & Intervals Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-3 bg-slate-50 dark:bg-[#111C2E] rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-400 block text-[11px]">Axis</span>
              <span className="font-bold text-slate-900 dark:text-white">{currentRecord.axis}</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-[#111C2E] rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-400 block text-[11px]">PR Interval</span>
              <span className="font-bold text-slate-900 dark:text-white">{currentRecord.pr} ms</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-[#111C2E] rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-400 block text-[11px]">QRS Duration</span>
              <span className="font-bold text-slate-900 dark:text-white">{currentRecord.qrs} ms</span>
            </div>
            <div className="p-3 bg-slate-50 dark:bg-[#111C2E] rounded-xl border border-slate-200 dark:border-slate-800">
              <span className="text-slate-400 block text-[11px]">QTc (Bazett)</span>
              <span className="font-bold text-cyan-500">{currentRecord.qtc} ms</span>
            </div>
          </div>

          {/* Attached High-Res ECG Scans / Photos */}
          {currentRecord.imageUrls && currentRecord.imageUrls.length > 0 && (
            <div className="bg-white dark:bg-[#111C2E] border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-3">
              <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <ImageIcon className="w-4 h-4 text-cyan-500" /> Attached Scans & Photos (
                {currentRecord.imageUrls.length})
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {currentRecord.imageUrls.map((url, idx) => (
                  <div
                    key={idx}
                    className="relative group rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 aspect-video bg-slate-900"
                  >
                    <img
                      src={url}
                      alt="ECG Scan"
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform"
                    />
                    <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
                      <button
                        onClick={() => setFullScreenImage(url)}
                        className="p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-lg backdrop-blur-sm"
                        title="Full Screen"
                      >
                        <Maximize2 className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => {
                          const updated = currentRecord.imageUrls.filter((_, i) => i !== idx);
                          const updatedRecords = records.map((r) =>
                            r.id === currentRecord.id ? { ...r, imageUrls: updated } : r
                          );
                          updatePatient(patient.id, { ecgRecords: updatedRecords });
                          showToast('Scan deleted', 'info');
                        }}
                        className="p-1.5 bg-rose-500/80 hover:bg-rose-500 text-white rounded-lg backdrop-blur-sm"
                        title="Delete Scan"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="p-8 text-center text-slate-400 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
          No ECG records found for this patient.
        </div>
      )}

      {/* Full-screen Image Modal */}
      {fullScreenImage && (
        <div
          className="fixed inset-0 z-50 bg-black/95 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in"
          onClick={() => setFullScreenImage(null)}
        >
          <button
            onClick={() => setFullScreenImage(null)}
            className="absolute top-4 right-4 p-2.5 rounded-full bg-slate-800 text-white hover:bg-slate-700"
          >
            <X className="w-6 h-6" />
          </button>
          <img
            src={fullScreenImage}
            alt="ECG Full Screen"
            className="max-h-[90vh] max-w-[90vw] object-contain rounded-lg shadow-2xl"
          />
        </div>
      )}

      {/* Add ECG Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in">
          <div className="w-full max-w-lg bg-white dark:bg-[#111C2E] rounded-2xl border border-slate-200 dark:border-slate-800 p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 dark:text-white">
              Log New 12-Lead ECG
            </h3>

            <form onSubmit={handleAddECG} className="space-y-4 pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Heart Rate (bpm)
                  </label>
                  <input
                    type="number"
                    value={newHR}
                    onChange={(e) => setNewHR(parseInt(e.target.value) || 75)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    Axis
                  </label>
                  <input
                    type="text"
                    value={newAxis}
                    onChange={(e) => setNewAxis(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    PR Interval (ms)
                  </label>
                  <input
                    type="number"
                    value={newPR}
                    onChange={(e) => setNewPR(parseInt(e.target.value) || 160)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                    QTc (ms)
                  </label>
                  <input
                    type="number"
                    value={newQTc}
                    onChange={(e) => setNewQTc(parseInt(e.target.value) || 420)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Bullet Points (1 per line)
                </label>
                <textarea
                  rows={3}
                  value={newInterpretation}
                  onChange={(e) => setNewInterpretation(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                  Final Impression
                </label>
                <input
                  type="text"
                  value={newImpression}
                  onChange={(e) => setNewImpression(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-500 hover:text-slate-900 dark:hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-bold rounded-xl text-xs transition-colors"
                >
                  Save ECG
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
