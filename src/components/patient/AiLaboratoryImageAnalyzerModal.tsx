import React, { useEffect, useRef, useState } from 'react';
import {
  FlaskConical,
  Sparkles,
  Upload,
  Camera,
  RotateCw,
  ZoomIn,
  ZoomOut,
  Maximize2,
  Trash2,
  Plus,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  X,
  Loader2,
  Calendar,
  Clock,
  Layers,
  FileImage,
  ArrowRight,
  ClipboardCheck,
  Check,
} from 'lucide-react';
import { Patient, LabResult, ImagingStudy } from '../../types/clinical';
import { useApp } from '../../context/AppContext';
import {
  analyzeLabReportImage,
  LabAnalysisResult,
  LabAnalysisTestItem,
} from '../../services/aiMedicalService';
import { uploadClinicalMedia, optimizeClinicalImage } from '../../services/mediaStorage';

interface Props {
  patient: Patient;
  isOpen: boolean;
  onClose: () => void;
  onSaved?: (panelName: string) => void;
}

type Stage = 'input' | 'analyzing' | 'review';

const PANEL_OPTIONS = [
  'CBC',
  'Chemistry',
  'Cardiac Markers',
  'Coagulation',
  'Lipid Profile',
  'Diabetes',
  'Liver',
  'Thyroid',
  'ABG',
  'Electrolytes',
  'Inflammatory / Infection',
  'Iron / Vitamins',
  'Custom Lab',
  'General Laboratory',
];

export const AiLaboratoryImageAnalyzerModal: React.FC<Props> = ({
  patient,
  isOpen,
  onClose,
  onSaved,
}) => {
  const { updatePatient, showToast, auth } = useApp();

  const [stage, setStage] = useState<Stage>('input');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [imagePreviewUrl, setImagePreviewUrl] = useState<string>('');
  const [imageRotation, setImageRotation] = useState<number>(0);
  const [imageZoom, setImageZoom] = useState<number>(1);
  const [isDragOver, setIsDragOver] = useState(false);
  const [analysisError, setAnalysisError] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [archiveOriginalImage, setArchiveOriginalImage] = useState(true);

  // Extracted data for review
  const [labResultData, setLabResultData] = useState<LabAnalysisResult | null>(null);
  const [selectedPanel, setSelectedPanel] = useState<string>('CBC');
  const [reportDate, setReportDate] = useState<string>('');
  const [reportTime, setReportTime] = useState<string>('');
  const [editableTests, setEditableTests] = useState<Array<LabAnalysisTestItem & { selected: boolean; id: string }>>([]);
  const [interpretation, setInterpretation] = useState<string>('');
  const [viewTab, setViewTab] = useState<'both' | 'results' | 'image'>('both');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Clean up object URLs on unmount/close
  useEffect(() => {
    return () => {
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      abortControllerRef.current?.abort();
    };
  }, [imagePreviewUrl]);

  const handleSelectedFile = async (rawFile: File) => {
    setAnalysisError('');
    try {
      const optimized = await optimizeClinicalImage(rawFile);
      setImageFile(optimized);
      if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
      const url = URL.createObjectURL(optimized);
      setImagePreviewUrl(url);
      setImageRotation(0);
      setImageZoom(1);
    } catch (err: any) {
      console.error('File optimization error:', err);
      showToast(String(err?.message || 'Failed to process selected image file.'), 'error');
    }
  };

  // Support paste from clipboard
  useEffect(() => {
    if (!isOpen || stage !== 'input') return;

    const handlePaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (let i = 0; i < items.length; i++) {
        if (items[i].type.startsWith('image/')) {
          const file = items[i].getAsFile();
          if (file) {
            handleSelectedFile(file);
            showToast('Pasted laboratory image from clipboard.', 'info');
            break;
          }
        }
      }
    };

    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [isOpen, stage]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleSelectedFile(file);
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file && file.type.startsWith('image/')) {
      handleSelectedFile(file);
    } else {
      showToast('Please drop an image file (JPG, PNG, WEBP).', 'error');
    }
  };

  const clearImage = () => {
    if (imagePreviewUrl) URL.revokeObjectURL(imagePreviewUrl);
    setImageFile(null);
    setImagePreviewUrl('');
    setImageRotation(0);
    setImageZoom(1);
    setLabResultData(null);
    setEditableTests([]);
    setStage('input');
    setAnalysisError('');
  };

  const runAnalysis = async () => {
    if (!imageFile) {
      showToast('Please select or upload a laboratory report image first.', 'error');
      return;
    }

    setStage('analyzing');
    setAnalysisError('');
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const data = await analyzeLabReportImage(
        imageFile,
        patient.fullName,
        { name: auth.userName || 'Physician', role: 'Clinician' },
        controller.signal
      );

      setLabResultData(data);

      // Match extracted panel with known panels or default
      const matchedPanel = PANEL_OPTIONS.find(
        (p) => p.toLowerCase() === (data.panelName || '').toLowerCase()
      ) || data.panelName || 'General Laboratory';
      setSelectedPanel(matchedPanel);

      const now = new Date();
      setReportDate(data.reportDate || now.toISOString().split('T')[0]);
      setReportTime(data.reportTime || now.toTimeString().slice(0, 5));
      setInterpretation(data.interpretationSummary || '');

      // Initialize tests with selection & unique IDs
      const mappedTests = (data.tests || []).map((t, idx) => ({
        ...t,
        id: `test-${idx}-${Date.now()}`,
        selected: true,
      }));

      setEditableTests(mappedTests);
      setStage('review');
      showToast(
        `Successfully extracted ${mappedTests.length} laboratory tests. Please review before saving.`,
        'success'
      );
    } catch (err: any) {
      console.error('Laboratory analysis error:', err);
      const msg = String(err?.message || err || 'Failed to analyze laboratory report image.');
      setAnalysisError(msg);
      setStage('input');
      showToast(msg, 'error');
    }
  };

  const toggleTestSelection = (id: string) => {
    setEditableTests((prev) =>
      prev.map((t) => (t.id === id ? { ...t, selected: !t.selected } : t))
    );
  };

  const toggleSelectAll = (select: boolean) => {
    setEditableTests((prev) => prev.map((t) => ({ ...t, selected: select })));
  };

  const updateTestField = (id: string, field: keyof LabAnalysisTestItem, value: any) => {
    setEditableTests((prev) =>
      prev.map((t) => (t.id === id ? { ...t, [field]: value } : t))
    );
  };

  const removeTest = (id: string) => {
    setEditableTests((prev) => prev.filter((t) => t.id !== id));
  };

  const addNewTest = () => {
    const newTest: LabAnalysisTestItem & { selected: boolean; id: string } = {
      id: `manual-test-${Date.now()}`,
      testName: '',
      value: '',
      unit: '',
      referenceRange: '',
      status: 'Normal',
      confidence: 100,
      selected: true,
    };
    setEditableTests((prev) => [...prev, newTest]);
  };

  const handleSaveToPatient = async () => {
    const selectedTests = editableTests.filter((t) => t.selected && t.testName.trim() && t.value.trim());

    if (selectedTests.length === 0) {
      showToast('Select at least one valid laboratory test to save.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      const now = new Date();
      const timestamp = `${reportDate || now.toISOString().split('T')[0]} ${
        reportTime || now.toTimeString().slice(0, 5)
      }`;

      let originalImageUrl: string | undefined;
      let originalImageStoragePath: string | undefined;

      // Upload original report image if requested
      if (imageFile && archiveOriginalImage) {
        try {
          const extension = imageFile.type.includes('png')
            ? 'png'
            : imageFile.type.includes('webp')
            ? 'webp'
            : 'jpg';
          const path = `patients/${patient.id}/labs/report-${Date.now()}.${extension}`;
          const uploaded = await uploadClinicalMedia(imageFile, path);
          originalImageUrl = uploaded.url;
          if (uploaded.cloud) originalImageStoragePath = path;
        } catch (uploadErr) {
          console.warn('Original lab image upload failed, proceeding with results:', uploadErr);
        }
      }

      // Convert selected tests to CardioVault LabResult items
      const newLabResults: LabResult[] = selectedTests.map((t, idx) => ({
        id: `lab-${Date.now()}-${idx}`,
        panel: selectedPanel,
        testName: t.testName.trim(),
        value: Number.isFinite(Number(t.value)) ? Number(t.value) : t.value.trim(),
        unit: t.unit.trim(),
        referenceRange: t.referenceRange.trim() || undefined,
        flag: t.status,
        timestamp,
      }));

      const existingLabs = Array.isArray(patient.labResults) ? patient.labResults : [];
      const updatedLabs = [...newLabResults, ...existingLabs];

      const patientUpdates: Partial<Patient> = {
        labResults: updatedLabs,
      };

      // Also archive into imaging study records so physician can inspect the original scanned report anytime
      if (originalImageUrl) {
        const imagingRecord: ImagingStudy = {
          id: `lab-scan-${Date.now()}`,
          date: reportDate || now.toISOString().split('T')[0],
          type: 'Other',
          modality: 'Laboratory Report',
          bodyRegion: selectedPanel,
          indication: `AI Scanned Lab Sheet: ${selectedPanel}`,
          findings: interpretation || `Extracted ${selectedTests.length} tests from document.`,
          impression: `${selectedPanel} report scanned via CardioVault AI.`,
          imageUrls: [originalImageUrl],
          imageStoragePaths: originalImageStoragePath ? [originalImageStoragePath] : undefined,
          notes: `Verified by ${auth.userName || 'Physician'} on ${now.toISOString().slice(0, 16)}`,
        };

        const existingImaging = Array.isArray(patient.imaging) ? patient.imaging : [];
        patientUpdates.imaging = [imagingRecord, ...existingImaging];
      }

      updatePatient(patient.id, patientUpdates);

      showToast(
        `Successfully saved ${newLabResults.length} laboratory result${
          newLabResults.length === 1 ? '' : 's'
        } to ${selectedPanel}.`,
        'success'
      );

      if (onSaved) onSaved(selectedPanel);
      onClose();
    } catch (err: any) {
      console.error('Failed to save laboratory results:', err);
      showToast(String(err?.message || 'Could not save laboratory results to chart.'), 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const badgeColor = (status: string) => {
    switch (status) {
      case 'Critical':
        return 'bg-rose-500 text-white animate-pulse font-black';
      case 'High':
        return 'bg-rose-100 text-rose-700 dark:bg-rose-500/20 dark:text-rose-300 font-bold';
      case 'Low':
        return 'bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-300 font-bold';
      case 'Abnormal':
        return 'bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-300 font-bold';
      case 'Unknown':
        return 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
      default:
        return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 font-bold';
    }
  };

  // Check if extracted patient name differs significantly from current patient
  const nameMismatch = Boolean(
    labResultData?.patientName &&
      patient.fullName &&
      !patient.fullName.toLowerCase().includes(labResultData.patientName.toLowerCase()) &&
      !labResultData.patientName.toLowerCase().includes(patient.fullName.toLowerCase())
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[120] bg-slate-950/80 backdrop-blur-md flex items-center justify-center p-2 sm:p-4 overflow-y-auto">
      <div className="w-full max-w-6xl max-h-[96vh] rounded-3xl bg-white dark:bg-[#0E1626] border border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0 bg-slate-50/70 dark:bg-slate-900/50">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-tr from-cyan-500 to-sky-400 text-white flex items-center justify-center shadow-md shadow-cyan-500/20">
              <FlaskConical className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                  AI Laboratory Image Analyzer
                </h2>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-black bg-cyan-500/15 text-cyan-600 dark:text-cyan-300 uppercase tracking-wider flex items-center gap-1">
                  <Sparkles className="w-3 h-3" /> Gemini OCR
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Patient: <span className="font-bold text-slate-700 dark:text-slate-200">{patient.fullName}</span> (MRN: {patient.mrn})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={stage === 'analyzing' || isSaving}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 min-h-0">
          {/* STAGE 1: Image Selection / Upload */}
          {stage === 'input' && (
            <div className="space-y-6 max-w-4xl mx-auto">
              {!imagePreviewUrl ? (
                <div>
                  <div
                    onDragOver={(e) => {
                      e.preventDefault();
                      setIsDragOver(true);
                    }}
                    onDragLeave={() => setIsDragOver(false)}
                    onDrop={handleDrop}
                    className={`border-2 border-dashed rounded-3xl p-8 sm:p-12 text-center transition-all ${
                      isDragOver
                        ? 'border-cyan-500 bg-cyan-500/5'
                        : 'border-slate-300 dark:border-slate-700 hover:border-cyan-500/60 bg-slate-50/50 dark:bg-slate-900/30'
                    }`}
                  >
                    <div className="w-16 h-16 rounded-3xl bg-cyan-500/10 text-cyan-500 flex items-center justify-center mx-auto mb-4">
                      <FileImage className="w-8 h-8" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white">
                      Upload or Photograph Laboratory Report
                    </h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto mt-2">
                      Upload a photo, scan, or screenshot of a blood test, chemistry panel, or ABG sheet. You can also paste directly with <kbd className="px-1.5 py-0.5 bg-slate-200 dark:bg-slate-800 rounded text-[11px] font-mono">Ctrl+V</kbd>.
                    </p>

                    <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="px-5 py-3 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-transform active:scale-95"
                      >
                        <Upload className="w-4 h-4" /> Browse Image File
                      </button>

                      <button
                        type="button"
                        onClick={() => cameraInputRef.current?.click()}
                        className="px-5 py-3 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-750 font-bold text-xs flex items-center gap-2 text-slate-700 dark:text-slate-200 transition-colors"
                      >
                        <Camera className="w-4 h-4 text-cyan-500" /> Use Camera
                      </button>
                    </div>

                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                    <input
                      ref={cameraInputRef}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>

                  {analysisError && (
                    <div className="mt-4 p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-800 flex items-start gap-3 text-xs text-rose-600 dark:text-rose-300">
                      <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-rose-500" />
                      <div>
                        <div className="font-bold">Analysis Failed</div>
                        <div>{analysisError}</div>
                      </div>
                    </div>
                  )}

                  {/* Feature Highlights */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-6">
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-cyan-500 font-bold text-xs flex items-center gap-1.5 mb-1">
                        <CheckCircle2 className="w-4 h-4" /> Exact Numerical Preservation
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Preserves all decimal places (e.g. 2.9 stays 2.9; never rounded to 3), scientific units, and operators.
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-cyan-500 font-bold text-xs flex items-center gap-1.5 mb-1">
                        <CheckCircle2 className="w-4 h-4" /> Specific Reference Ranges
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Reads the reference standards printed directly by the performing lab and flags High, Low, or Critical values.
                      </div>
                    </div>

                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800">
                      <div className="text-cyan-500 font-bold text-xs flex items-center gap-1.5 mb-1">
                        <CheckCircle2 className="w-4 h-4" /> Clinician Review First
                      </div>
                      <div className="text-[11px] text-slate-500 dark:text-slate-400">
                        Full human-in-the-loop review. You inspect, edit, or deselect any row before anything is committed to the patient chart.
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Image loaded, preview and ready to analyze */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-extrabold text-slate-900 dark:text-white">
                        Review Laboratory Document Image
                      </h3>
                      <p className="text-xs text-slate-400">
                        Make sure text and numbers are oriented upright and clearly legible.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setImageRotation((r) => (r + 90) % 360)}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold flex items-center gap-1"
                        title="Rotate 90 degrees"
                      >
                        <RotateCw className="w-4 h-4" /> Rotate
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageZoom((z) => Math.min(3, z + 0.25))}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold"
                        title="Zoom in"
                      >
                        <ZoomIn className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => setImageZoom((z) => Math.max(0.5, z - 0.25))}
                        className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 text-xs font-bold"
                        title="Zoom out"
                      >
                        <ZoomOut className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={clearImage}
                        className="p-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-500 hover:bg-rose-100 text-xs font-bold flex items-center gap-1"
                        title="Remove image"
                      >
                        <Trash2 className="w-4 h-4" /> Clear
                      </button>
                    </div>
                  </div>

                  {/* Interactive preview box */}
                  <div className="w-full h-[52vh] rounded-3xl bg-slate-900 flex items-center justify-center overflow-hidden border border-slate-700 relative p-4">
                    <img
                      src={imagePreviewUrl}
                      alt="Laboratory Sheet Preview"
                      style={{
                        transform: `rotate(${imageRotation}deg) scale(${imageZoom})`,
                        transition: 'transform 0.2s ease-out',
                        maxHeight: '100%',
                        maxWidth: '100%',
                        objectFit: 'contain',
                      }}
                      className="rounded-lg shadow-2xl"
                    />
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      onClick={clearImage}
                      className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300"
                    >
                      Choose Different Image
                    </button>

                    <button
                      type="button"
                      onClick={runAnalysis}
                      className="px-6 py-3 rounded-2xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-sm flex items-center gap-2 shadow-xl shadow-cyan-500/25 transition-transform active:scale-95"
                    >
                      <Sparkles className="w-4 h-4" /> Analyze Document with AI
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STAGE 2: Analyzing */}
          {stage === 'analyzing' && (
            <div className="py-16 text-center max-w-md mx-auto space-y-5">
              <div className="relative w-20 h-20 mx-auto">
                <div className="absolute inset-0 rounded-3xl bg-cyan-500/20 animate-ping" />
                <div className="relative w-20 h-20 rounded-3xl bg-gradient-to-tr from-cyan-500 to-sky-400 text-white flex items-center justify-center shadow-xl shadow-cyan-500/30">
                  <Loader2 className="w-10 h-10 animate-spin" />
                </div>
              </div>

              <div>
                <h3 className="text-lg font-black text-slate-900 dark:text-white">
                  Analyzing Laboratory Document
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Optical character recognition and clinical value parsing in progress…
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-left space-y-2 text-xs text-slate-600 dark:text-slate-300">
                <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                  Reading test parameters & exact values
                </div>
                <div className="flex items-center gap-2 text-cyan-600 dark:text-cyan-400 font-bold">
                  <span className="w-2 h-2 rounded-full bg-cyan-500 animate-pulse" />
                  Extracting laboratory reference ranges
                </div>
                <div className="flex items-center gap-2 text-slate-400 font-medium">
                  <span className="w-2 h-2 rounded-full bg-slate-400" />
                  Classifying abnormal and critical flags
                </div>
              </div>
            </div>
          )}

          {/* STAGE 3: Clinical Review & Verification */}
          {stage === 'review' && labResultData && (
            <div className="space-y-4">
              {/* Patient Name Mismatch Alert */}
              {nameMismatch && (
                <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-700 flex items-start gap-3 text-xs text-amber-800 dark:text-amber-200">
                  <AlertTriangle className="w-5 h-5 shrink-0 text-amber-500 mt-0.5" />
                  <div>
                    <div className="font-extrabold text-sm">Patient Name Verification Warning</div>
                    <div className="mt-0.5">
                      The document mentions patient name:{' '}
                      <b className="underline">{labResultData.patientName}</b>, whereas the current patient in CardioVault is{' '}
                      <b>{patient.fullName}</b>. Please double check that this laboratory report belongs to this patient before saving!
                    </div>
                  </div>
                </div>
              )}

              {/* Document Metadata Bar */}
              <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400">Target Panel</label>
                  <select
                    value={selectedPanel}
                    onChange={(e) => setSelectedPanel(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-cyan-500"
                  >
                    {PANEL_OPTIONS.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400">Sample Date</label>
                  <div className="relative mt-1">
                    <input
                      type="date"
                      value={reportDate}
                      onChange={(e) => setReportDate(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400">Sample Time</label>
                  <div className="relative mt-1">
                    <input
                      type="time"
                      value={reportTime}
                      onChange={(e) => setReportTime(e.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs font-bold text-slate-800 dark:text-slate-100 outline-none focus:border-cyan-500"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-bold text-slate-400">Document Source</label>
                  <div className="mt-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs truncate">
                    <span className="font-bold text-slate-700 dark:text-slate-300">
                      {labResultData.laboratoryName || 'Clinical Laboratory'}
                    </span>
                    <span className="text-[10px] text-slate-400 ml-1">
                      ({labResultData.imageQuality} quality)
                    </span>
                  </div>
                </div>
              </div>

              {/* View layout toggle */}
              <div className="flex items-center justify-between pt-1">
                <div className="text-xs font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                  <span>Extracted Tests ({editableTests.filter((t) => t.selected).length}/{editableTests.length} selected)</span>
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(true)}
                    className="text-[11px] text-cyan-500 hover:underline font-bold"
                  >
                    Select All
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => toggleSelectAll(false)}
                    className="text-[11px] text-slate-400 hover:underline"
                  >
                    Deselect All
                  </button>
                </div>

                {/* View switcher */}
                <div className="flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => setViewTab('both')}
                    className={`px-3 py-1 rounded-lg transition-colors ${
                      viewTab === 'both' ? 'bg-white dark:bg-slate-900 text-cyan-500 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Split View
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewTab('results')}
                    className={`px-3 py-1 rounded-lg transition-colors ${
                      viewTab === 'results' ? 'bg-white dark:bg-slate-900 text-cyan-500 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Results Only
                  </button>
                  <button
                    type="button"
                    onClick={() => setViewTab('image')}
                    className={`px-3 py-1 rounded-lg transition-colors ${
                      viewTab === 'image' ? 'bg-white dark:bg-slate-900 text-cyan-500 shadow-sm' : 'text-slate-500'
                    }`}
                  >
                    Image Only
                  </button>
                </div>
              </div>

              {/* Main content grid */}
              <div
                className={`grid gap-4 ${
                  viewTab === 'both'
                    ? 'grid-cols-1 lg:grid-cols-12'
                    : 'grid-cols-1'
                }`}
              >
                {/* Left column: Original Image (if Split or Image view) */}
                {(viewTab === 'both' || viewTab === 'image') && imagePreviewUrl && (
                  <div
                    className={`${
                      viewTab === 'both' ? 'lg:col-span-5' : 'w-full'
                    } rounded-2xl bg-slate-900 border border-slate-700 p-3 flex flex-col`}
                  >
                    <div className="flex items-center justify-between text-xs text-slate-300 pb-2 mb-2 border-b border-slate-800">
                      <span className="font-bold flex items-center gap-1.5">
                        <FileImage className="w-3.5 h-3.5 text-cyan-400" /> Original Report Document
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => setImageRotation((r) => (r + 90) % 360)}
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                          title="Rotate"
                        >
                          <RotateCw className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setImageZoom((z) => Math.min(3, z + 0.25))}
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                          title="Zoom In"
                        >
                          <ZoomIn className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setImageZoom((z) => Math.max(0.5, z - 0.25))}
                          className="p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white"
                          title="Zoom Out"
                        >
                          <ZoomOut className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex-1 min-h-[300px] max-h-[500px] overflow-auto flex items-center justify-center bg-black/40 rounded-xl p-2">
                      <img
                        src={imagePreviewUrl}
                        alt="Original Report"
                        style={{
                          transform: `rotate(${imageRotation}deg) scale(${imageZoom})`,
                          transition: 'transform 0.15s ease-out',
                          maxWidth: '100%',
                          maxHeight: '100%',
                          objectFit: 'contain',
                        }}
                        className="rounded"
                      />
                    </div>
                  </div>
                )}

                {/* Right column: Results Table (if Split or Results view) */}
                {(viewTab === 'both' || viewTab === 'results') && (
                  <div
                    className={`${
                      viewTab === 'both' ? 'lg:col-span-7' : 'w-full'
                    } space-y-3`}
                  >
                    <div className="max-h-[460px] overflow-y-auto space-y-2 pr-1">
                      {editableTests.map((t) => (
                        <div
                          key={t.id}
                          className={`p-3 rounded-2xl border transition-all ${
                            t.selected
                              ? 'bg-white dark:bg-[#111C2E] border-slate-200 dark:border-slate-700 shadow-sm'
                              : 'bg-slate-50 dark:bg-slate-900/40 border-slate-200 dark:border-slate-800 opacity-60'
                          }`}
                        >
                          <div className="grid grid-cols-12 gap-2 items-center">
                            {/* Checkbox */}
                            <div className="col-span-1 flex items-center justify-center">
                              <input
                                type="checkbox"
                                checked={t.selected}
                                onChange={() => toggleTestSelection(t.id)}
                                className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                              />
                            </div>

                            {/* Test Name */}
                            <div className="col-span-4 sm:col-span-4">
                              <input
                                type="text"
                                value={t.testName}
                                onChange={(e) => updateTestField(t.id, 'testName', e.target.value)}
                                placeholder="Test name"
                                className="w-full text-xs font-bold px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-cyan-500"
                              />
                            </div>

                            {/* Value */}
                            <div className="col-span-3 sm:col-span-3">
                              <input
                                type="text"
                                value={t.value}
                                onChange={(e) => updateTestField(t.id, 'value', e.target.value)}
                                placeholder="Result value"
                                className="w-full text-xs font-mono font-black px-2.5 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white outline-none focus:border-cyan-500"
                              />
                            </div>

                            {/* Unit */}
                            <div className="col-span-2 sm:col-span-2">
                              <input
                                type="text"
                                value={t.unit}
                                onChange={(e) => updateTestField(t.id, 'unit', e.target.value)}
                                placeholder="Unit"
                                className="w-full text-[11px] px-2 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 outline-none focus:border-cyan-500"
                              />
                            </div>

                            {/* Status dropdown & delete */}
                            <div className="col-span-2 sm:col-span-2 flex items-center justify-end gap-1">
                              <select
                                value={t.status}
                                onChange={(e) => updateTestField(t.id, 'status', e.target.value)}
                                className={`text-[10px] px-2 py-1 rounded-lg border-0 cursor-pointer ${badgeColor(
                                  t.status
                                )}`}
                              >
                                <option value="Normal">Normal</option>
                                <option value="High">High (↑)</option>
                                <option value="Low">Low (↓)</option>
                                <option value="Critical">Critical (*)</option>
                                <option value="Abnormal">Abnormal</option>
                                <option value="Unknown">Unknown</option>
                              </select>

                              <button
                                type="button"
                                onClick={() => removeTest(t.id)}
                                className="p-1 rounded text-slate-400 hover:text-rose-500"
                                title="Remove test"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>

                            {/* Reference range row */}
                            <div className="col-span-12 flex items-center justify-between text-[10px] text-slate-400 pl-7 pr-1 pt-1">
                              <div className="flex items-center gap-1.5 flex-1">
                                <span>Ref:</span>
                                <input
                                  type="text"
                                  value={t.referenceRange}
                                  onChange={(e) => updateTestField(t.id, 'referenceRange', e.target.value)}
                                  placeholder="e.g. 0.5 - 1.2"
                                  className="text-[10px] px-2 py-0.5 rounded border border-transparent hover:border-slate-300 dark:hover:border-slate-700 bg-transparent text-slate-600 dark:text-slate-300 outline-none w-36"
                                />
                              </div>
                              {t.isUncertain && (
                                <span className="text-amber-500 font-bold flex items-center gap-1">
                                  <AlertTriangle className="w-3 h-3" /> Unclear in scan
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>

                    <button
                      type="button"
                      onClick={addNewTest}
                      className="w-full py-2.5 rounded-xl border border-dashed border-cyan-400/80 hover:bg-cyan-500/5 text-cyan-600 dark:text-cyan-400 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                    >
                      <Plus className="w-4 h-4" /> Add Missing Test Manually
                    </button>
                  </div>
                )}
              </div>

              {/* Interpretation Summary */}
              {interpretation && (
                <div className="p-3.5 rounded-2xl bg-cyan-50/60 dark:bg-cyan-950/20 border border-cyan-200 dark:border-cyan-800 text-xs">
                  <div className="font-extrabold text-cyan-800 dark:text-cyan-300 flex items-center gap-1.5 mb-1">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-500" /> Clinical Interpretation Summary
                  </div>
                  <textarea
                    rows={2}
                    value={interpretation}
                    onChange={(e) => setInterpretation(e.target.value)}
                    className="w-full text-xs text-slate-700 dark:text-slate-300 bg-transparent border-0 outline-none resize-none"
                  />
                </div>
              )}

              {/* Archive original image checkbox */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-xs text-slate-600 dark:text-slate-300 font-medium">
                  <input
                    type="checkbox"
                    checked={archiveOriginalImage}
                    onChange={(e) => setArchiveOriginalImage(e.target.checked)}
                    className="w-4 h-4 rounded text-cyan-500 focus:ring-cyan-500 cursor-pointer"
                  />
                  <span>Archive original scanned lab document in patient imaging records</span>
                </label>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStage('input')}
                    disabled={isSaving}
                    className="px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-600 dark:text-slate-300 disabled:opacity-40"
                  >
                    Back to Scan
                  </button>

                  <button
                    type="button"
                    onClick={handleSaveToPatient}
                    disabled={isSaving || editableTests.filter((t) => t.selected).length === 0}
                    className="px-6 py-2.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black text-xs flex items-center gap-2 shadow-lg shadow-cyan-500/25 transition-transform active:scale-95 disabled:opacity-40"
                  >
                    {isSaving ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" /> Saving to Chart…
                      </>
                    ) : (
                      <>
                        <ClipboardCheck className="w-4 h-4" /> Save {editableTests.filter((t) => t.selected).length} Results to Chart
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
