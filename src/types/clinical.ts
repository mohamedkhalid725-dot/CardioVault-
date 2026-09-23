export type PatientStatus = 'Stable' | 'Unstable' | 'Critical' | 'Empty';

export interface Bed { id:string; unitId:string; bedNumber:string; status:PatientStatus; patientId?:string; }
export interface Unit { id:string; name:string; type:string; totalBeds:number; }
export interface ClinicalSummary { chiefComplaint:string; hpi:string; pmh:string[]; psh:string[]; drugHistory:string; allergies:string[]; familyHistory:string; socialHistory:string; }
export interface HandoverData { situation:string; background:string; assessment:string; recommendation:string; updatedAt?:string; }
export interface CardiovascularHistory { hypertension:boolean; diabetes:boolean; dyslipidemia:boolean; cad:boolean; previousMI:boolean; heartFailure:boolean; arrhythmias:boolean; valvularDisease:boolean; previousPCI:boolean; previousCABG:boolean; previousStroke:boolean; pvd:boolean; smoking:boolean; alcohol:boolean; previousAdmissions:string; previousICU:string; other:string; }
export interface VitalRecord { id:string; timestamp:string; sbp:number; dbp:number; hr:number; rr:number; spo2:number; temp:number; pain?:number; gcsEye:number; gcsVerbal:number; gcsMotor:number; gcsTotal:number; rass:number; cvp?:number; co?:number; cardiacOutput?:number; ci?:number; cardiacIndex?:number; sv?:number; svr?:number; lactate?:number; glucose?:number; arterialLine?:boolean|string; notes?:string; }
export interface FluidRecord { id:string; timestamp?:string; date?:string; oral?:number; oralEnteral?:number; medFlushes?:number; totalIntake?:number; totalOutput?:number; netBalance?:number; cumulativeBalance?:number; overloadPercentage?:number; urineOutput?:number; hourlyUrineRate?:number; ivFluids?:number; bloodProducts?:number; enteralFeeding?:number; otherInput?:number; urine?:number; ngOutput?:number; ngSuction?:number; drains?:number; chestTube?:number; stool?:number; otherOutput?:number; notes?:string; }
export interface ExaminationData { general:{appearance:string;consciousness:string;distress:string;hydration:string;pallor:boolean;cyanosis:boolean;jaundice:boolean;edema:string}; cardiovascular:{jvp:string;heartSounds:string;murmurs:string;peripheralPulses:string;edema:string;perfusion:string}; respiratory:{chestExam:string;airEntry:string;addedSounds:string;workOfBreathing:string}; abdomen:{inspection:string;palpation:string;tenderness:string;organomegaly:string;ascites:string}; neurological:{consciousness:string;gcs:string;pupils:string;motor:string;sensory:string;reflexes:string}; extremities:{pulses:string;edema:string;temp:string;perfusion:string}; customFields:Array<{label:string;value:string}>; }
export interface ECGRecord { id:string; date:string; time:string; heartRate:number; rhythm:string; regularity:string; axis:string; pr:number; qrs:number; qt:number; qtc:number; pWave:string; qrsFindings:string; stSegment:string; tWave:string; otherFindings:string; interpretation:string[]; finalImpression:string; imageUrls:string[]; imageStoragePaths?:string[]; }
export interface HemodynamicRecord { id:string; date:string; time:string; parameter:string; value:number; unit:string; notes?:string; }
export interface FluidIntakeRecord { id:string; date:string; time:string; amount:number; unit:string; type:string; notes?:string; }
export interface BiomarkerRecord { id:string; name:string; value:number|string; unit:string; date:string; time:string; referenceRange?:string; notes?:string; }
export interface CardiacDevice { id:string; type:string; date:string; status:string; notes?:string; }
export interface CathRecord { id:string; date:string; indication:string; accessSite:string; findings:string; intervention:string; stentsPlaced?:string; finalResult:string; complications?:string; notes?:string; }
export interface CardiologyData { rhythm:string; heartRate:number; bp:string; heartFailureStatus:string; nyha:string; killip:string; congestion:string; perfusion:string; echoBriefSummary?:string; echo:{ef:number;lvDimensions:string;lvFunction:string;rvFunction:string;rwma:string;la:string;ra:string;mr:string;ar:string;as:string;ms:string;tr:string;pr:string;pasp:number;ivc:string;pericardium:string;otherFindings:string}; biomarkers:{troponin:string;ckmb:string;bnp:string;ntProBnp:string}; coronary:{cath:string;coronaryFindings:string;pci:string;stent:string;cabg:string}; antithrombotic:{antiplatelet:string;anticoagulation:string;thrombolysis:string}; cathRecords?:CathRecord[]; biomarkerRecords?:BiomarkerRecord[]; devicesList?:CardiacDevice[]; hemodynamicsList?:HemodynamicRecord[]; killipClass?:string; nyhaClass?:string; pacemaker?:string; mechanicalSupport?:string; }
export interface Medication { id:string; drug?:string; name?:string; type?:string; dose:string; route:string; frequency:string; startDate?:string; stopDate?:string; indication?:string; notes?:string; status?:'Active'|'Held'|'Discontinued'|'Completed'; category?:string; isInfusion?:boolean; infusionRate?:string; doseUnit?:string; }
export interface ABGRecord { id:string; timestamp:string; ph:number; paco2:number; pao2:number; hco3:number; baseExcess?:number; be?:number; fio2?:number; sao2?:number; lactate?:number; na?:number; k?:number; cl?:number; glucose?:number; interpretation?:string; anionGap?:number; pfRatio?:number; deltaGap?:number; deltaRatio?:number; wintersCompensation?:string; }
export type RespiratorySupportType = 'Room Air' | 'Oxygen Therapy' | 'Mechanical Ventilation';
export interface VentilatorRecord { id:string; timestamp:string; supportType:RespiratorySupportType; oxygenDevice?:string; oxygenFlow?:number; mode?:string; fio2?:number; peep?:number; tidalVolume?:number; respiratoryRate?:number; pressureSupport?:number; inspiratoryPressure?:number; ieRatio?:string; peakPressure?:number; plateauPressure?:number; meanAirwayPressure?:number; spo2?:number; etco2?:number; compliance?:number; resistance?:number; }
export interface VentilatorData { mode:string; fio2:number; peep:number; tidalVolume:number; rr:number; respiratoryRate?:number; pressureSupport:number; inspiratoryPressure:number; ieRatio:string; peakPressure:number; plateauPressure:number; meanAirwayPressure:number; spo2:number; etco2:number; compliance:number; resistance:number; supportType?:RespiratorySupportType; oxygenDevice?:string; oxygenFlow?:number; history?:VentilatorRecord[]; abgHistory:ABGRecord[]; }
export interface ImagingStudy { id:string; date:string; type?:'X-Ray'|'CT'|'MRI'|'Ultrasound'|'Echo'|'Other'; modality?:string; bodyRegion?:string; region?:string; indication?:string; findings?:string; impression?:string; radiologist?:string; notes?:string; images?:string[]; imageUrls?:string[]; imageStoragePaths?:string[]; }
export interface LabPanel { date:string; hb:number;wbc:number;platelets:number;hct:number;rbc:number;mcv:number;mch:number;mchc:number;urea:number;creatinine:number;egfr:number;uricAcid:number;na:number;k:number;cl:number;ca:number;mg:number;phosphate:number;ast:number;alt:number;alp:number;bilirubin:number;albumin:number;totalProtein:number;pt:number;inr:number;aptt:number;fibrinogen:number;troponin:number;ckmb:number;bnp:number;ntProBnp:number;crp:number;esr:number;procalcitonin:number;glucose:number;hba1c:number;cholesterol:number;triglycerides:number;ldl:number;hdl:number;lactate:number;dDimer:number;tsh:number;customLabs:Array<{name:string;value:string;unit:string;referenceRange:string}>; }
export interface ProcedureRecord { id:string; date:string; time:string; procedure?:string; name?:string; surgeryName?:string; indication?:string; technique?:string; operator?:string; findings?:string; complications?:string; outcome?:string; postProcedurePlan?:string; site?:string; details?:string; notes?:string; }
export interface CalculatorResult { id:string; calculatorId:string; name:string; timestamp:string; score:number|string; riskLevel:'Low'|'Intermediate'|'High'|'Very High'|'Normal'|'Critical'; interpretation:string; summary:string; }
export interface ProgressNote { id:string; date:string; time:string; author:string; type?:string; subjective?:string; objective?:string; assessment?:string; plan:string; audioUrl?:string; audioStoragePath?:string; audioDurationSeconds?:number; clinicalStatus?:string; events?:string; examination?:string; investigations?:string; treatment?:string; response?:string; problems?:string; updatedAt?:string; }
export interface PastAdmission { id:string; admissionDate:string; dischargeDate:string; unitName:string; dischargeReason:'Discharged Home'|'Transferred'|'Deceased'|'Other'; dischargeSummary:string; primaryDiagnosis:string; }
export interface AuditEvent { id:string; timestamp:string; action:string; fields:string[]; actor?:string; }

export type ClinicalRole =
  | 'pending'
  | 'department_admin'
  | 'consultant'
  | 'specialist'
  | 'resident'
  | 'nurse'
  | 'viewer'
  | 'pharmacist'
  | 'lab_user'
  | 'radiology_user'
  | 'coordinator';

export interface Department {
  id: string;
  name: string;
  code?: string;
  organizationId?: string;
  unitIds?: string[];
  createdAt?: string;
}

export interface UserProfile {
  userId: string;
  name: string;
  email: string;
  username?: string;
  role: ClinicalRole;
  departmentId: string;
  assignedUnitIds: string[];
  status: 'active' | 'pending' | 'inactive';
  permissions?: string[];
  authorizedDevices?: string[];
  createdAt?: string;
  updatedAt?: string;
  lastLoginAt?: string;
  temporaryAssignment?: {
    unitId: string;
    startDate: string;
    endDate: string;
  };
}

export interface ClinicalProblem {
  id: string;
  patientId: string;
  problem: string;
  status: 'active' | 'resolved' | 'monitoring';
  priority: 'routine' | 'important' | 'urgent';
  dateIdentified: string;
  responsibleClinician: string;
  notes?: string;
  resolutionStatus?: string;
  resolvedDate?: string;
}

export interface ClinicalTask {
  id: string;
  patientId?: string;
  patientName?: string;
  unitId: string;
  departmentId?: string;
  title: string;
  description?: string;
  priority: 'routine' | 'urgent' | 'stat';
  dueDateTime?: string;
  assignedTo?: string;
  assignedRole?: ClinicalRole;
  createdBy: string;
  status: 'pending' | 'in_progress' | 'completed' | 'cancelled';
  createdAt: string;
  completedAt?: string;
  completedBy?: string;
  sourceType?: 'investigation' | 'consultation' | 'clinical';
  sourceId?: string;
}

export interface InvestigationItem {
  id: string;
  patientId: string;
  unitId: string;
  departmentId?: string;
  type: 'CBC' | 'ABG' | 'ECG' | 'Troponin' | 'CK-MB' | 'BNP' | 'Echo' | 'Imaging' | 'Other';
  title: string;
  status: 'ordered' | 'pending' | 'available' | 'reviewed' | 'acknowledged' | 'cancelled';
  collectionStatus?: 'not_collected' | 'collected';
  collectionUpdatedAt?: string;
  orderedAt: string;
  orderedBy: string;
  availableAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resultsSummary?: string;
  flag?: 'normal' | 'abnormal' | 'critical';
  cbcData?: {
    hb?: number;
    wbc?: number;
    platelets?: number;
    hct?: number;
    rbc?: number;
    mcv?: number;
    mch?: number;
    mchc?: number;
    rdw?: number;
  };
  notes?: string;
}

export interface MedicationOrder extends Medication {
  orderedBy?: string;
  orderDate?: string;
  departmentId?: string;
}

export interface MedicationAdministration {
  id: string;
  patientId: string;
  medicationId: string;
  medicationName: string;
  status: 'Given' | 'Held' | 'Refused' | 'Not Given';
  time: string;
  reason?: string;
  user: string;
  userRole?: ClinicalRole;
  dosageGiven?: string;
  route?: string;
  notes?: string;
}

export interface MedicationTemplate {
  id: string;
  name: string;
  departmentId?: string;
  medications: Partial<Medication>[];
  createdBy: string;
  createdAt: string;
}

export interface Consultation {
  id: string;
  patientId: string;
  unitId: string;
  departmentId?: string;
  specialty: string;
  assignedClinician?: string;
  priority: 'routine' | 'urgent' | 'stat';
  clinicalQuestion: string;
  status: 'Requested' | 'Accepted' | 'In Progress' | 'Completed' | 'Cancelled';
  requestedBy: string;
  requestedAt: string;
  acceptedAt?: string;
  responseNotes?: string;
  completedAt?: string;
}

export interface ShiftHandover {
  id: string;
  patientId: string;
  unitId: string;
  departmentId?: string;
  author: string;
  authorRole: string;
  timestamp: string;
  currentStatus: PatientStatus;
  activeProblems: string[];
  importantEvents: string;
  pendingInvestigations: string;
  pendingTasks: string;
  currentTreatment: string;
  devices: string;
  thingsRequiringAttention: string;
  nextShiftActions: string;
}

export interface ClinicalProtocol {
  id: string;
  title: string;
  category: string;
  content: string;
  version: string;
  author: string;
  lastUpdated: string;
  departmentId?: string;
}

export interface DetailedAuditLog {
  id: string;
  userId: string;
  userName: string;
  role: ClinicalRole;
  action: string;
  patientId?: string;
  patientName?: string;
  departmentId?: string;
  unitId?: string;
  timestamp: string;
  deviceSession?: string;
  previousValue?: any;
  newValue?: any;
  reason?: string;
  metadata?: any;
}

export interface ClinicalCorrection {
  id: string;
  patientId: string;
  recordType: string;
  recordId: string;
  fieldName: string;
  originalValue: any;
  correctedValue: any;
  user: string;
  userRole: ClinicalRole;
  timestamp: string;
  reason: string;
}

export interface BreakGlassLog {
  id: string;
  userId: string;
  userName: string;
  role: ClinicalRole;
  patientId: string;
  patientName: string;
  originalScope: { departmentId: string; unitIds: string[] };
  emergencyScope: { unitId: string };
  reason: string;
  timestamp: string;
  deviceSession: string;
}

export interface PatientTimelineEvent {
  id: string;
  patientId: string;
  timestamp: string;
  author: string;
  role: string;
  eventType:
    | 'Admission'
    | 'Clinical Assessment'
    | 'Vitals'
    | 'Investigation'
    | 'Medication'
    | 'Medication Administration'
    | 'Procedure'
    | 'Consultation'
    | 'Progress Note'
    | 'Transfer'
    | 'Discharge'
    | 'Clinical Correction';
  title: string;
  summary: string;
  details?: any;
}

export interface Patient {
  id: string;
  mrn: string;
  fullName: string;
  name?: string;
  age: number;
  sex: 'Male' | 'Female' | 'Other';
  gender?: string;
  weight: number;
  height: number;
  photoUrl?: string;
  unitId: string;
  bedId: string;
  bedNumber?: string;
  departmentId?: string;
  status: PatientStatus;
  admissionDate: string;
  admissionTime: string;
  primaryDiagnosis: string;
  diagnosis?: string;
  secondaryDiagnoses: string[];
  allergies: string[];
  codeStatus: 'Full Code' | 'DNR' | 'DNI' | 'Comfort Measures Only';
  isArchived?: boolean;
  archiveReason?: string;
  archiveDate?: string;
  dischargeSummary?: string;
  pastAdmissions: PastAdmission[];
  clinicalSummary: ClinicalSummary;
  cardiovascularHistory: CardiovascularHistory;
  handover?: HandoverData;
  vitalsHistory: VitalRecord[];
  fluidRecords: FluidRecord[];
  hemodynamicHistory?: HemodynamicRecord[];
  fluidIntakeHistory?: FluidIntakeRecord[];
  urineOutputHistory?: FluidIntakeRecord[];
  examination: ExaminationData;
  ecgRecords: ECGRecord[];
  cardiology: CardiologyData;
  medications: Medication[];
  infusions?: Infusion[];
  ventilator: VentilatorData;
  imaging: ImagingStudy[];
  labs: LabPanel[];
  labResults?: LabResult[];
  procedures: ProcedureRecord[];
  calculatorResults: CalculatorResult[];
  progressNotes: ProgressNote[];
  auditTrail?: AuditEvent[];
  // Extended clinical workflow collections
  problems?: ClinicalProblem[];
  tasks?: ClinicalTask[];
  investigations?: InvestigationItem[];
  medicationAdministrations?: MedicationAdministration[];
  consultations?: Consultation[];
  shiftHandovers?: ShiftHandover[];
  corrections?: ClinicalCorrection[];
  timelineEvents?: PatientTimelineEvent[];
  attendedClinician?: string;
  attendedNurse?: string;
}
export type PatientSectionId='overview'|'history'|'ecg'|'vitals'|'examination'|'cardiology'|'medication'|'icu'|'imaging'|'labs'|'procedure'|'orders'|'calculators'|'progress'|'clinical-tools'|'pdf';
export interface PatientSectionMeta { id:PatientSectionId; order:number; label:string; iconName:string; description:string; }
export type PhysicalExam=ExaminationData; export type CardiologyModule=CardiologyData; export type EchoReport=CardiologyData['echo']; export type CathReport=CardiologyData['coronary']; export type VentilatorSettings=VentilatorData; export type ClinicalProcedure=ProcedureRecord; export type VitalSigns=VitalRecord;
export interface LabResult { id?:string; name?:string; testName?:string; value:string|number; unit:string; referenceRange?:string; status?:'normal'|'low'|'high'|'critical'; flag?:string; panel?:string; timestamp?:string; }
export interface Infusion { id:string; drugName:string; dose:number; unit:string; rateMlHr:number; concentration?:string; carrierFluid?:string; lineSite?:string; }
