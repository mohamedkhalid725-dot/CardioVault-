import {
  Patient,
  ClinicalProblem,
  ClinicalTask,
  InvestigationItem,
  MedicationAdministration,
  MedicationTemplate,
  Consultation,
  ShiftHandover,
  ClinicalProtocol,
  UserProfile,
  Bed,
} from '../types/clinical';
import { AuditTrailService } from './auditTrailService';

const TASKS_KEY = 'cardiovault_clinical_tasks_v2';
const PROTOCOLS_KEY = 'cardiovault_clinical_protocols_v2';
const TEMPLATES_KEY = 'cardiovault_med_templates_v2';

export const DEFAULT_PROTOCOLS: ClinicalProtocol[] = [
  {
    id: 'proto-stemi',
    title: 'Acute STEMI Clinical Pathway',
    category: 'Cardiology',
    content: '1. Immediate 12-lead ECG within 10 minutes of arrival.\n2. Dual antiplatelet therapy (Aspirin 300mg + Ticagrelor 180mg or Clopidogrel 600mg).\n3. Anticoagulation: Unfractionated Heparin (70-100 units/kg bolus IV).\n4. Primary PCI door-to-balloon target < 90 min.\n5. Post-PCI continuous telemetry monitoring for minimum 24 hours.',
    version: '2.4',
    author: 'Cardiology Clinical Governance Board',
    lastUpdated: '2026-08-15',
    departmentId: 'dept-cardiology',
  },
  {
    id: 'proto-hf',
    title: 'Acute Decompensated Heart Failure (ADHF) Protocol',
    category: 'Heart Failure',
    content: '1. Hemodynamic profiling: Warm/Cold, Wet/Dry.\n2. IV Loop Diuretic titration (1-2.5x oral outpatient dose IV bolus or infusion).\n3. Strict hourly fluid intake & output measurement.\n4. Vasodilator therapy (IV Nitroglycerin) if SBP > 110 mmHg with marked congestion.\n5. Daily weights, electrolytes, and renal panel monitoring.',
    version: '1.8',
    author: 'Heart Failure Working Group',
    lastUpdated: '2026-09-01',
    departmentId: 'dept-cardiology',
  },
  {
    id: 'proto-af',
    title: 'Atrial Fibrillation with RVR Management',
    category: 'Arrhythmia',
    content: '1. Assess hemodynamic stability. If unstable (hypotension, angina, shock) -> Urgent synchronized DC cardioversion.\n2. Rate control if stable: Beta-blocker (Metoprolol IV) or Non-DHP CCB (Diltiazem IV).\n3. In heart failure with reduced EF: Amiodarone or Digoxin IV.\n4. CHA2DS2-VASc score calculation and anticoagulation initiation.',
    version: '2.1',
    author: 'Electrophysiology Service',
    lastUpdated: '2026-07-20',
    departmentId: 'dept-cardiology',
  },
];

export const DEFAULT_MED_TEMPLATES: MedicationTemplate[] = [
  {
    id: 'tmpl-acs-dapt',
    name: 'Standard ACS DAPT + Statin Bundle',
    departmentId: 'dept-cardiology',
    createdBy: 'Dr. Mohamed Khalid',
    createdAt: '2026-09-01T08:00:00.000Z',
    medications: [
      { name: 'Aspirin', dose: '100mg', route: 'Oral', frequency: 'Once daily', status: 'Active', category: 'Antiplatelet' },
      { name: 'Ticagrelor', dose: '90mg', route: 'Oral', frequency: 'Twice daily', status: 'Active', category: 'Antiplatelet' },
      { name: 'Atorvastatin', dose: '80mg', route: 'Oral', frequency: 'At bedtime', status: 'Active', category: 'Lipid Lowering' },
      { name: 'Pantoprazole', dose: '40mg', route: 'Oral', frequency: 'Once daily', status: 'Active', category: 'Gastroprotection' },
    ],
  },
  {
    id: 'tmpl-hf-gdmt',
    name: 'Heart Failure Quad-Pillar GDMT Starter',
    departmentId: 'dept-cardiology',
    createdBy: 'Dr. Mohamed Khalid',
    createdAt: '2026-09-01T08:00:00.000Z',
    medications: [
      { name: 'Sacubitril/Valsartan', dose: '24/26mg', route: 'Oral', frequency: 'Twice daily', status: 'Active', category: 'ARNI' },
      { name: 'Bisoprolol', dose: '1.25mg', route: 'Oral', frequency: 'Once daily', status: 'Active', category: 'Beta Blocker' },
      { name: 'Empagliflozin', dose: '10mg', route: 'Oral', frequency: 'Once daily', status: 'Active', category: 'SGLT2i' },
      { name: 'Spironolactone', dose: '25mg', route: 'Oral', frequency: 'Once daily', status: 'Active', category: 'MRA' },
    ],
  },
];

export interface AttentionItem {
  patientId: string;
  patientName: string;
  unitId: string;
  bedNumber: string;
  type: 'pending_task' | 'pending_investigation' | 'unreviewed_result' | 'new_admission' | 'handover_pending' | 'critical_status';
  description: string;
  urgency: 'routine' | 'important' | 'critical';
}

export const ClinicalWorkflowService = {
  // Global Tasks
  getTasks(): ClinicalTask[] {
    try {
      const raw = localStorage.getItem(TASKS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    return [];
  },

  saveTasks(tasks: ClinicalTask[]): void {
    try {
      localStorage.setItem(TASKS_KEY, JSON.stringify(tasks));
    } catch {}
  },

  addTask(task: Omit<ClinicalTask, 'id' | 'createdAt'>): ClinicalTask {
    const tasks = this.getTasks();
    const newTask: ClinicalTask = {
      id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      createdAt: new Date().toISOString(),
      ...task,
    };
    this.saveTasks([newTask, ...tasks]);\n    window.dispatchEvent(new CustomEvent('cardiovault-task-updated'));
    return newTask;
  },

  updateTaskStatus(taskId: string, status: ClinicalTask['status'], user: UserProfile): void {
    const tasks = this.getTasks();
    const updated = tasks.map(t =>
      t.id === taskId
        ? {
            ...t,
            status,
            completedAt: status === 'completed' ? new Date().toISOString() : undefined,
            completedBy: status === 'completed' ? user.name : undefined,
          }
        : t
    );
    this.saveTasks(updated);\n    window.dispatchEvent(new CustomEvent('cardiovault-task-updated'));
  },

  // Protocols
  getProtocols(): ClinicalProtocol[] {
    try {
      const raw = localStorage.getItem(PROTOCOLS_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    this.saveProtocols(DEFAULT_PROTOCOLS);
    return DEFAULT_PROTOCOLS;
  },

  saveProtocols(protocols: ClinicalProtocol[]): void {
    try {
      localStorage.setItem(PROTOCOLS_KEY, JSON.stringify(protocols));
    } catch {}
  },

  // Medication Templates
  getMedTemplates(): MedicationTemplate[] {
    try {
      const raw = localStorage.getItem(TEMPLATES_KEY);
      if (raw) return JSON.parse(raw);
    } catch {}
    this.saveMedTemplates(DEFAULT_MED_TEMPLATES);
    return DEFAULT_MED_TEMPLATES;
  },

  saveMedTemplates(templates: MedicationTemplate[]): void {
    try {
      localStorage.setItem(TEMPLATES_KEY, JSON.stringify(templates));
    } catch {}
  },

  addMedTemplate(template: Omit<MedicationTemplate, 'id' | 'createdAt'>): MedicationTemplate {
    const templates = this.getMedTemplates();
    const newTmpl: MedicationTemplate = {
      id: `tmpl-${Date.now()}`,
      createdAt: new Date().toISOString(),
      ...template,
    };
    this.saveMedTemplates([...templates, newTmpl]);
    return newTmpl;
  },

  deleteMedTemplate(id: string): void {
    const templates = this.getMedTemplates();
    this.saveMedTemplates(templates.filter(t => t.id !== id));
  },

  // Attention Board Builder
  buildAttentionBoard(patients: Patient[], beds: Bed[], user: UserProfile): AttentionItem[] {
    const items: AttentionItem[] = [];
    const tasks = this.getTasks();
    const todayStr = new Date().toISOString().split('T')[0];

    patients.forEach(patient => {
      if (patient.isArchived) return;

      const bed = beds.find(b => b.id === patient.bedId);
      const bedNumber = bed?.bedNumber || 'Unassigned';

      // 1. Critical status
      if (patient.status === 'Critical') {
        items.push({
          patientId: patient.id,
          patientName: patient.fullName,
          unitId: patient.unitId,
          bedNumber,
          type: 'critical_status',
          description: `Patient is clinically Critical (${patient.primaryDiagnosis})`,
          urgency: 'critical',
        });
      }

      // 2. New admission today
      if (patient.admissionDate === todayStr) {
        items.push({
          patientId: patient.id,
          patientName: patient.fullName,
          unitId: patient.unitId,
          bedNumber,
          type: 'new_admission',
          description: `New Admission at ${patient.admissionTime || 'today'} - Initial workup`,
          urgency: 'important',
        });
      }

      // 3. Pending tasks for this patient
      const patientTasks = tasks.filter(t => t.patientId === patient.id && t.status === 'pending');
      patientTasks.forEach(task => {
        items.push({
          patientId: patient.id,
          patientName: patient.fullName,
          unitId: patient.unitId,
          bedNumber,
          type: 'pending_task',
          description: `Task pending: ${task.title} (${task.priority.toUpperCase()})`,
          urgency: task.priority === 'stat' ? 'critical' : task.priority === 'urgent' ? 'important' : 'routine',
        });
      });

      // 4. Pending investigations or unreviewed results
      const invs = patient.investigations || [];
      invs.forEach(inv => {
        if (inv.status === 'ordered' || inv.status === 'pending') {
          items.push({
            patientId: patient.id,
            patientName: patient.fullName,
            unitId: patient.unitId,
            bedNumber,
            type: 'pending_investigation',
            description: `${inv.type} investigation is pending laboratory / imaging completion`,
            urgency: 'routine',
          });
        } else if (inv.status === 'available') {
          items.push({
            patientId: patient.id,
            patientName: patient.fullName,
            unitId: patient.unitId,
            bedNumber,
            type: 'unreviewed_result',
            description: `${inv.type} results available — awaiting physician clinical review`,
            urgency: inv.flag === 'critical' ? 'critical' : 'important',
          });
        }
      });

      // 5. Handover pending (if no handover created today)
      const handovers = patient.shiftHandovers || [];
      const hasTodayHandover = handovers.some(h => h.timestamp.startsWith(todayStr));
      if (!hasTodayHandover && patient.status !== 'Stable') {
        items.push({
          patientId: patient.id,
          patientName: patient.fullName,
          unitId: patient.unitId,
          bedNumber,
          type: 'handover_pending',
          description: 'Shift clinical handover documentation pending update',
          urgency: 'routine',
        });
      }
    });

    return items;
  },

  // Department Statistics
  computeDepartmentStatistics(patients: Patient[], beds: Bed[]) {
    const active = patients.filter(p => !p.isArchived);
    const totalBeds = beds.length;
    const occupiedBeds = beds.filter(b => b.status !== 'Empty' && b.patientId).length;
    const availableBeds = Math.max(0, totalBeds - occupiedBeds);
    const occupancyRate = totalBeds > 0 ? Math.round((occupiedBeds / totalBeds) * 100) : 0;

    const todayStr = new Date().toISOString().split('T')[0];
    const newAdmissionsToday = patients.filter(p => p.admissionDate === todayStr).length;
    const dischargesToday = patients.filter(p => p.isArchived && p.archiveDate === todayStr).length;

    const criticalCount = active.filter(p => p.status === 'Critical').length;
    const unstableCount = active.filter(p => p.status === 'Unstable').length;
    const stableCount = active.filter(p => p.status === 'Stable').length;

    const tasks = this.getTasks();
    const pendingTasks = tasks.filter(t => t.status === 'pending').length;

    let pendingInvestigations = 0;
    let unreviewedResults = 0;
    active.forEach(p => {
      (p.investigations || []).forEach(inv => {
        if (inv.status === 'ordered' || inv.status === 'pending') pendingInvestigations++;
        if (inv.status === 'available') unreviewedResults++;
      });
    });

    return {
      totalBeds,
      occupiedBeds,
      availableBeds,
      occupancyRate,
      newAdmissionsToday,
      dischargesToday,
      activePatientsCount: active.length,
      criticalCount,
      unstableCount,
      stableCount,
      pendingTasks,
      pendingInvestigations,
      unreviewedResults,
    };
  },
};
