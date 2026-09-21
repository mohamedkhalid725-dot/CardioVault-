import React, { useState } from 'react';
import {
  Sparkles,
  Bot,
  BrainCircuit,
  FileText,
  Activity,
  HeartPulse,
  FlaskConical,
  Wind,
  Stethoscope,
  ClipboardList,
  Pill,
  BookOpen,
  Send,
  Upload,
  Copy,
  Check,
  Save,
  AlertTriangle,
  RefreshCw,
  User,
  Building2,
  ChevronDown,
} from 'lucide-react';
import { useApp } from '../../context/AppContext';
import {
  callAIAssistant,
  AIAssistantTask,
  AIDraftType,
  AIAssistantResponse,
} from '../../services/aiClinicalService';
import { AuditTrailService } from '../../services/auditTrailService';
import { Patient } from '../../types/clinical';

interface AIAssistantViewProps {
  initialPatient?: Patient;
}

export const AIAssistantView: React.FC<AIAssistantViewProps> = ({ initialPatient }) => {
  const { patients, currentPatient, currentUser, updatePatient, showToast, setCurrentView } = useApp();

  const [selectedPatientId, setSelectedPatientId] = useState<string>(
    initialPatient?.id || currentPatient?.id || patients[0]?.id || ''
  );
  const [activeTask, setActiveTask] = useState<AIAssistantTask>('summary');
  const [draftType, setDraftType] = useState<AIDraftType>('progress');
  const [userQuery, setUserQuery] = useState('');
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [imageFileName, setImageFileName] = useState<string>('');

  const [isLoading, setIsLoading] = useState(false);
  const [result, setResult] = useState<AIAssistantResponse | null>(null);
  const [copied, setCopied] = useState(false);
  const [savedToNotes, setSavedToNotes] = useState(false);

  const selectedPatient = patients.find(p => p.id === selectedPatientId) || null;

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      showToast('Image size exceeds 5MB limit.', 'warning');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setSelectedImage(reader.result as string);
      setImageFileName(file.name);
      showToast(`Attached ${file.name} for AI multimodal analysis.`, 'info');
    };
    reader.readAsDataURL(file);
  };

  const handleExecute = async () => {
    setIsLoading(true);
    setSavedToNotes(false);
    try {
      const resp = await callAIAssistant({
        task: activeTask,
        draftType: activeTask === 'draft_note' ? draftType : undefined,
        userPrompt: userQuery.trim() || undefined,
        patient: selectedPatient,
        imageBase64: selectedImage || undefined,
        clinician: {
          name: currentUser.name,
          role: currentUser.role,
        },
      });

      setResult(resp);

      AuditTrailService.logAction({
        userId: currentUser.userId,
        userName: currentUser.name,
        role: currentUser.role,
        action: `AI Clinical Assistant queried: task=${activeTask}${activeTask === 'draft_note' ? ` (${draftType})` : ''}`,
        patientId: selectedPatient?.id,
        patientName: selectedPatient?.name,
        departmentId: currentUser.departmentId,
        metadata: { task: activeTask, query: userQuery.slice(0, 100) },
      });
    } catch (err: any) {
      showToast(err?.message || 'AI request failed.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopy = () => {
    if (!result?.text) return;
    navigator.clipboard.writeText(result.text);
    setCopied(true);
    showToast('Copied AI response to clipboard.', 'success');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleSaveToProgressNotes = () => {
    if (!selectedPatient || !result?.text) return;
    const now = new Date().toISOString();
    const newNote = {
      id: `note-ai-${Date.now()}`,
      author: `${currentUser.name} (${currentUser.role.toUpperCase()}) [AI Assisted]`,
      authorId: currentUser.userId,
      role: currentUser.role,
      date: now,
      type: 'Progress Note',
      category: 'General',
      text: result.text,
      title: `${activeTask === 'draft_note' ? draftType.toUpperCase() : activeTask.toUpperCase()} Note`,
      verified: true,
      verifiedBy: currentUser.name,
      verifiedAt: now,
    };

    const existingNotes = (selectedPatient as any).progressNotes || [];
    updatePatient(selectedPatient.id, {
      progressNotes: [newNote, ...existingNotes],
    } as any);

    setSavedToNotes(true);
    showToast('AI Clinical Draft saved into Patient Progress Notes.', 'success');

    AuditTrailService.logAction({
      userId: currentUser.userId,
      userName: currentUser.name,
      role: currentUser.role,
      action: `Saved AI draft note into Patient Progress Notes: ${selectedPatient.name}`,
      patientId: selectedPatient.id,
      patientName: selectedPatient.name,
      departmentId: currentUser.departmentId,
    });
  };

  const capabilities: Array<{
    id: AIAssistantTask;
    label: string;
    description: string;
    icon: React.FC<{ className?: string }>;
  }> = [
    { id: 'summary', label: 'Patient Summary', description: 'Acute status, active diagnoses & course', icon: BrainCircuit },
    { id: 'timeline', label: 'Clinical Timeline', description: 'Chronological events & lab milestones', icon: Activity },
    { id: 'problems', label: 'Active Problems', description: 'Differential diagnoses & prioritized issues', icon: Stethoscope },
    { id: 'trends', label: 'Trend Analysis', description: 'Vitals, hemodynamics & biomarker trajectory', icon: HeartPulse },
    { id: 'labs', label: 'Laboratory Assistance', description: 'Explain panels, acute kidney & electrolyte shifts', icon: FlaskConical },
    { id: 'abg', label: 'ABG & Ventilation', description: 'Acid-base balance, compensation & PaO2/FiO2', icon: Wind },
    { id: 'ecg', label: 'ECG Assistance', description: 'Rhythm, intervals, ischemia & image upload', icon: HeartPulse },
    { id: 'draft_note', label: 'Documentation Drafts', description: 'SOAP progress, admission, discharge & consults', icon: FileText },
    { id: 'handover', label: 'Handover Assistant', description: 'I-PASS structured clinical handover', icon: ClipboardList },
    { id: 'medication', label: 'Medication Review', description: 'ICU monitoring, precautions & interactions', icon: Pill },
    { id: 'protocol', label: 'Protocol Matcher', description: 'Map patient condition to clinical pathways', icon: BookOpen },
    { id: 'general', label: 'Clinical Dialogue', description: 'Guideline citations & bedside clinical Q&A', icon: Bot },
  ];

  return (
    <div className="max-w-6xl mx-auto w-full px-3 sm:px-6 py-5 space-y-5">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <div className="text-[10px] font-black uppercase tracking-wider text-cyan-500 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5" />
            Decision Support & Clinical Documentation
          </div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white mt-0.5">
            CardioVault AI Clinical Assistant
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Evidence-based synthesis, clinical draft notes, and diagnostic reasoning
          </p>
        </div>

        {/* Clinician badge */}
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-cyan-500/10 border border-cyan-500/30 text-xs font-semibold text-cyan-600 dark:text-cyan-400">
          <User className="w-4 h-4" />
          <span>{currentUser.name} ({currentUser.role.replace('_', ' ').toUpperCase()})</span>
        </div>
      </div>

      {/* Mandatory Safety Notice */}
      <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3 text-amber-800 dark:text-amber-300">
        <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-500" />
        <div className="text-xs">
          <span className="font-bold">Clinical Safety Notice: </span>
          AI-generated clinical assistance. Verify against the patient's record, current guidelines, and clinical judgment before acting. The AI does not autonomously prescribe, order, or modify records.
        </div>
      </div>

      {/* Patient Context & Selector */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-cyan-500" />
            Active Clinical Context (Select Patient):
          </label>

          <select
            value={selectedPatientId}
            onChange={e => setSelectedPatientId(e.target.value)}
            className="px-3 py-1.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-900 dark:text-white outline-none focus:border-cyan-500"
          >
            <option value="">No specific patient (General Clinical Q&A)</option>
            {patients.filter(p => !p.isArchived).map(p => (
              <option key={p.id} value={p.id}>
                {p.name} • Bed: {p.bedNumber || 'Unassigned'} ({p.diagnosis || 'Cardiology'})
              </option>
            ))}
          </select>
        </div>

        {selectedPatient && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80 grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold">Patient</div>
              <div className="font-bold text-slate-900 dark:text-white truncate">{selectedPatient.name}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold">MRN / ID</div>
              <div className="font-mono text-slate-700 dark:text-slate-300">{selectedPatient.mrn || selectedPatient.id}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold">Age / Sex</div>
              <div className="text-slate-700 dark:text-slate-300">{selectedPatient.age}y • {selectedPatient.gender}</div>
            </div>
            <div>
              <div className="text-[10px] text-slate-400 uppercase font-bold">Primary Diagnosis</div>
              <div className="text-cyan-500 font-semibold truncate">{selectedPatient.diagnosis || 'Cardiovascular'}</div>
            </div>
          </div>
        )}
      </div>

      {/* Capabilities Selector */}
      <div className="space-y-2">
        <div className="text-xs font-bold text-slate-700 dark:text-slate-300">
          Select Clinical Capability (12 Integrated Modules):
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
          {capabilities.map(cap => {
            const Icon = cap.icon;
            const isSelected = activeTask === cap.id;
            return (
              <button
                key={cap.id}
                onClick={() => setActiveTask(cap.id)}
                className={`p-3 rounded-2xl border text-left transition ${
                  isSelected
                    ? 'border-cyan-500 bg-cyan-500/10 text-cyan-600 dark:text-cyan-400 shadow-sm'
                    : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg ${isSelected ? 'bg-cyan-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div className="text-xs font-bold truncate">{cap.label}</div>
                </div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                  {cap.description}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Task Specific Controls */}
      <div className="p-4 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-3">
        {activeTask === 'draft_note' && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Note Type:</span>
            {[
              { id: 'progress', label: 'SOAP Progress Note' },
              { id: 'daily_review', label: '24h Daily Review' },
              { id: 'admission', label: 'Admission Summary' },
              { id: 'discharge', label: 'Discharge Summary' },
              { id: 'consultation', label: 'Consultation Request' },
              { id: 'handover', label: 'Shift Handover' },
            ].map(type => (
              <button
                key={type.id}
                onClick={() => setDraftType(type.id as AIDraftType)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition ${
                  draftType === type.id
                    ? 'bg-cyan-500 text-white'
                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
                }`}
              >
                {type.label}
              </button>
            ))}
          </div>
        )}

        {/* Optional Multimodal Image Attachment (e.g. ECG strip or CXR) */}
        {(activeTask === 'ecg' || activeTask === 'general') && (
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer hover:bg-slate-200">
              <Upload className="w-3.5 h-3.5 text-cyan-500" />
              <span>{imageFileName ? `Attached: ${imageFileName}` : 'Attach ECG Strip / Image (Optional)'}</span>
              <input type="file" accept="image/*" onChange={handleImageUpload} className="hidden" />
            </label>
            {selectedImage && (
              <button
                onClick={() => {
                  setSelectedImage(null);
                  setImageFileName('');
                }}
                className="text-xs text-rose-500 hover:underline"
              >
                Remove
              </button>
            )}
          </div>
        )}

        {/* Clinician Query or Instructions input */}
        <div>
          <label className="text-xs font-bold text-slate-700 dark:text-slate-300 mb-1 block">
            Clinician Prompt / Specific Focus (Optional):
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={userQuery}
              onChange={e => setUserQuery(e.target.value)}
              placeholder={
                activeTask === 'summary'
                  ? 'e.g. Focus on hemodynamic stability and renal trend'
                  : activeTask === 'abg'
                  ? 'e.g. Evaluate acid-base compensation for PaCO2 55, pH 7.28, HCO3 26'
                  : activeTask === 'medication'
                  ? 'e.g. Check compatibility of Amiodarone with beta-blockers'
                  : 'Enter specific clinical question or documentation requirements...'
              }
              className="flex-1 px-3.5 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white outline-none focus:border-cyan-500"
              onKeyDown={e => {
                if (e.key === 'Enter' && !isLoading) handleExecute();
              }}
            />
            <button
              onClick={handleExecute}
              disabled={isLoading}
              className="px-4 py-2 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 transition"
            >
              {isLoading ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Run AI Assistant</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Output / Results Card */}
      {result && (
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-md space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-cyan-500/10 text-cyan-500 flex items-center justify-center font-bold text-xs">
                AI
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                  {activeTask === 'draft_note'
                    ? `Generated Clinical Draft (${draftType.toUpperCase()})`
                    : `Clinical Assistance: ${activeTask.toUpperCase()}`}
                </h3>
                <p className="text-[10px] text-slate-400">
                  Synthesized at {new Date(result.timestamp).toLocaleTimeString()}
                </p>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2">
              <button
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 text-xs font-semibold flex items-center gap-1.5"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>

              {selectedPatient && (
                <button
                  onClick={handleSaveToProgressNotes}
                  disabled={savedToNotes}
                  className="px-3 py-1.5 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white text-xs font-bold flex items-center gap-1.5 disabled:opacity-50"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{savedToNotes ? 'Saved in Notes' : 'Save to Progress Notes'}</span>
                </button>
              )}
            </div>
          </div>

          {/* Formatted Output */}
          <div className="text-xs text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed font-sans bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-slate-100 dark:border-slate-800">
            {result.text}
          </div>

          <div className="text-[11px] text-slate-400 italic">
            * {result.disclaimer}
          </div>
        </div>
      )}
    </div>
  );
};
