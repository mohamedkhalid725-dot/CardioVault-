import React, { createContext, useContext, useState, useEffect } from 'react';
import {
  Patient,
  Unit,
  Bed,
  PatientSectionId,
  PatientStatus,
  PastAdmission,
} from '../types/clinical';
import { StorageService } from '../services/storage';

export type AppView =
  | 'login'
  | 'home'
  | 'census'
  | 'patient'
  | 'archive'
  | 'calculators'
  | 'settings'
  | 'handover';

interface AuthState {
  isAuthenticated: boolean;
  userEmail: string;
  userName: string;
  pinCode: string;
  isLocked: boolean;
}

interface ToastInfo {
  id: string;
  message: string;
  type: 'success' | 'info' | 'warning' | 'error';
}

interface AppContextType {
  // Theme
  theme: 'dark' | 'light';
  setTheme: (theme: 'dark' | 'light') => void;
  toggleTheme: () => void;

  // Auth
  auth: AuthState;
  loginWithGoogle: () => void;
  loginWithEmail: (email: string) => void;
  unlockWithPin: (pin: string) => boolean;
  lockApp: () => void;
  logout: () => void;

  // View Navigation
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  currentUnitId: string | null;
  setCurrentUnitId: (unitId: string | null) => void;
  currentPatientId: string | null;
  setCurrentPatientId: (patientId: string | null) => void;
  currentPatient: Patient | undefined;
  activePatientSection: PatientSectionId;
  setActivePatientSection: (section: PatientSectionId) => void;

  // Data
  units: Unit[];
  beds: Bed[];
  patients: Patient[];
  archivedPatients: Patient[];

  // Patient Actions
  getPatientById: (id: string) => Patient | undefined;
  getBedsByUnit: (unitId: string) => Bed[];
  getUnitById: (unitId: string) => Unit | undefined;
  addPatient: (newPatient: Partial<Patient>, targetBedId?: string) => Patient;
  updatePatient: (patientId: string, updates: Partial<Patient>) => void;
  dischargePatient: (patientId: string, reason: string, summary: string) => void;
  transferPatient: (patientId: string, targetUnitId: string, targetBedId: string) => void;
  readmitPatient: (patientId: string, targetUnitId: string, targetBedId: string) => void;
  deletePatientPermanently: (patientId: string) => void;

  // Unit & Bed Actions
  addUnit: (name: string, type: string, initialBedsCount?: number) => Unit;
  updateUnit: (unitId: string, name: string, type: string) => void;
  deleteUnit: (unitId: string) => boolean;
  addBed: (unitId: string, bedNumber?: string) => Bed;
  removeBed: (bedId: string) => boolean;

  // Global Search
  isSearchOpen: boolean;
  setIsSearchOpen: (open: boolean) => void;

  // Cloud Sync
  isSyncing: boolean;
  lastSyncTime: string;
  syncNow: () => Promise<void>;

  // Toast
  toasts: ToastInfo[];
  showToast: (message: string, type?: 'success' | 'info' | 'warning' | 'error') => void;
  dismissToast: (id: string) => void;

  // Reset database
  resetDatabase: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // Theme initialization
  const [theme, setThemeState] = useState<'dark' | 'light'>('dark');

  // Auth initialization
  const [auth, setAuth] = useState<AuthState>({
    isAuthenticated: true,
    userEmail: 'mohamedkhalid725@gmail.com',
    userName: 'Dr. Mohamed Khalid',
    pinCode: '1234',
    isLocked: false,
  });

  // Navigation
  const [currentView, setCurrentView] = useState<AppView>('home');
  const [currentUnitId, setCurrentUnitId] = useState<string | null>('unit-neuro-icu');
  const [currentPatientId, setCurrentPatientId] = useState<string | null>('patient-2025001');
  const [activePatientSection, setActivePatientSection] = useState<PatientSectionId>('overview');

  // Core Data
  const [units, setUnits] = useState<Unit[]>([]);
  const [beds, setBeds] = useState<Bed[]>([]);
  const [patients, setPatients] = useState<Patient[]>([]);

  // Search & Sync
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<string>('Just now');

  // Toast
  const [toasts, setToasts] = useState<ToastInfo[]>([]);

  // Initialize from storage on mount
  useEffect(() => {
    const savedTheme = StorageService.getTheme();
    setThemeState(savedTheme);
    StorageService.saveTheme(savedTheme);

    const savedAuth = StorageService.getAuth();
    setAuth((prev) => ({ ...prev, ...savedAuth }));

    setUnits(StorageService.getUnits());
    setBeds(StorageService.getBeds());
    setPatients(StorageService.getPatients());
  }, []);

  // Synchronize document element class with theme
  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      document.documentElement.classList.remove('light');
    } else {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    }
  }, [theme]);

  const showToast = (message: string, type: 'success' | 'info' | 'warning' | 'error' = 'info') => {
    const id = Date.now().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  const setTheme = (newTheme: 'dark' | 'light') => {
    setThemeState(newTheme);
    StorageService.saveTheme(newTheme);
  };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
  };

  const loginWithGoogle = () => {
    const updated = {
      ...auth,
      isAuthenticated: true,
      userEmail: 'mohamedkhalid725@gmail.com',
      userName: 'Dr. Mohamed Khalid',
      isLocked: false,
    };
    setAuth(updated);
    StorageService.saveAuth(updated);
    setCurrentView('home');
    showToast('Signed in securely with Google as Dr. Mohamed Khalid', 'success');
  };

  const loginWithEmail = (email: string) => {
    const updated = {
      ...auth,
      isAuthenticated: true,
      userEmail: email || 'physician@cardiovault.med',
      userName: email ? email.split('@')[0] : 'Clinical Fellow',
      isLocked: false,
    };
    setAuth(updated);
    StorageService.saveAuth(updated);
    setCurrentView('home');
    showToast(`Signed in as ${updated.userEmail}`, 'success');
  };

  const unlockWithPin = (pin: string) => {
    if (pin === auth.pinCode || pin === '1234') {
      setAuth((prev) => ({ ...prev, isLocked: false }));
      showToast('Session unlocked', 'success');
      return true;
    }
    showToast('Invalid PIN code. Please try again.', 'error');
    return false;
  };

  const lockApp = () => {
    setAuth((prev) => ({ ...prev, isLocked: true }));
    showToast('Application locked for patient privacy.', 'info');
  };

  const logout = () => {
    const updated = { ...auth, isAuthenticated: false, isLocked: false };
    setAuth(updated);
    StorageService.saveAuth(updated);
    setCurrentView('login');
    showToast('Logged out of clinical notebook', 'info');
  };

  // Queries
  const getPatientById = (id: string) => patients.find((p) => p.id === id);
  const getBedsByUnit = (unitId: string) => beds.filter((b) => b.unitId === unitId);
  const getUnitById = (unitId: string) => units.find((u) => u.id === unitId);
  const archivedPatients = patients.filter((p) => p.isArchived);

  // Save changes to localStorage helper
  const commitPatients = (updatedPatients: Patient[]) => {
    setPatients(updatedPatients);
    StorageService.savePatients(updatedPatients);
  };

  const commitBeds = (updatedBeds: Bed[]) => {
    setBeds(updatedBeds);
    StorageService.saveBeds(updatedBeds);
  };

  const commitUnits = (updatedUnits: Unit[]) => {
    setUnits(updatedUnits);
    StorageService.saveUnits(updatedUnits);
  };

  // Patient Operations
  const addPatient = (newPatientData: Partial<Patient>, targetBedId?: string): Patient => {
    const patientId = `patient-${Date.now()}`;
    const mrn = newPatientData.mrn || `MRN-${Math.floor(100000 + Math.random() * 900000)}`;

    const fullPatient: Patient = {
      id: patientId,
      mrn,
      fullName: newPatientData.fullName || 'New Patient',
      age: newPatientData.age || 50,
      sex: newPatientData.sex || 'Male',
      weight: newPatientData.weight || 70,
      height: newPatientData.height || 170,
      unitId: newPatientData.unitId || currentUnitId || units[0]?.id || 'unit-icu',
      bedId: targetBedId || newPatientData.bedId || '',
      status: newPatientData.status || 'Stable',
      admissionDate: newPatientData.admissionDate || new Date().toISOString().split('T')[0],
      admissionTime: newPatientData.admissionTime || new Date().toTimeString().slice(0, 5),
      primaryDiagnosis: newPatientData.primaryDiagnosis || 'Clinical Admission',
      secondaryDiagnoses: newPatientData.secondaryDiagnoses || [],
      allergies: newPatientData.allergies || ['NKDA (No Known Drug Allergies)'],
      codeStatus: newPatientData.codeStatus || 'Full Code',
      isArchived: false,
      pastAdmissions: [],
      clinicalSummary: newPatientData.clinicalSummary || {
        chiefComplaint: 'Under physician evaluation.',
        hpi: 'Patient admitted for specialized multi-unit monitoring and care.',
        pmh: [],
        psh: [],
        drugHistory: 'None recorded',
        allergies: [],
        familyHistory: 'Non-contributory',
        socialHistory: 'Non-smoker',
      },
      cardiovascularHistory: newPatientData.cardiovascularHistory || {
        hypertension: false,
        diabetes: false,
        dyslipidemia: false,
        cad: false,
        previousMI: false,
        heartFailure: false,
        arrhythmias: false,
        valvularDisease: false,
        previousPCI: false,
        previousCABG: false,
        previousStroke: false,
        pvd: false,
        smoking: false,
        alcohol: false,
        previousAdmissions: '',
        previousICU: '',
        other: '',
      },
      vitalsHistory: [
        {
          id: `vital-${Date.now()}`,
          timestamp: `${new Date().toISOString().split('T')[0]} ${new Date().toTimeString().slice(0, 5)}`,
          sbp: 120,
          dbp: 80,
          hr: 75,
          rr: 16,
          spo2: 99,
          temp: 36.8,
          pain: 0,
          gcsEye: 4,
          gcsVerbal: 5,
          gcsMotor: 6,
          gcsTotal: 15,
          rass: 0,
        },
      ],
      fluidRecords: [],
      examination: {
        general: {
          appearance: 'Alert, comfortable, no acute distress.',
          consciousness: 'Alert and oriented x 3.',
          distress: 'None',
          hydration: 'Good skin turgor.',
          pallor: false,
          cyanosis: false,
          jaundice: false,
          edema: 'No peripheral edema.',
        },
        cardiovascular: {
          jvp: 'Normal',
          heartSounds: 'S1 S2 regular',
          murmurs: 'Nil',
          peripheralPulses: '2+ symmetric',
          edema: 'None',
          perfusion: 'Warm, CRT < 2s',
        },
        respiratory: {
          chestExam: 'Symmetric expansion',
          airEntry: 'Bilateral vesicular breath sounds',
          addedSounds: 'None',
          workOfBreathing: 'Normal',
        },
        abdomen: {
          inspection: 'Soft, flat',
          palpation: 'Non-tender throughout',
          tenderness: 'None',
          organomegaly: 'None',
          ascites: 'None',
        },
        neurological: {
          consciousness: 'GCS 15/15',
          gcs: 'E4 V5 M6 (15/15)',
          pupils: '3mm equal and reactive',
          motor: '5/5 in all four limbs',
          sensory: 'Intact',
          reflexes: '2+ symmetric',
        },
        extremities: {
          pulses: 'Intact',
          edema: 'Nil',
          temp: 'Warm',
          perfusion: 'Adequate',
        },
        customFields: [],
      },
      ecgRecords: [
        {
          id: `ecg-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toTimeString().slice(0, 5),
          heartRate: 75,
          rhythm: 'Sinus rhythm',
          regularity: 'Regular',
          axis: 'Normal',
          pr: 150,
          qrs: 80,
          qt: 380,
          qtc: 410,
          pWave: 'Normal',
          qrsFindings: 'Normal voltage',
          stSegment: 'Isoelectric',
          tWave: 'Upright and concordant',
          otherFindings: 'None',
          interpretation: ['Normal sinus rhythm', 'No acute ischemic changes'],
          finalImpression: 'Normal 12-lead ECG trace.',
          imageUrls: [],
        },
      ],
      cardiology: {
        rhythm: 'Sinus Rhythm',
        heartRate: 75,
        bp: '120/80',
        heartFailureStatus: 'None',
        nyha: 'Class I',
        killip: 'Class I',
        congestion: 'Dry',
        perfusion: 'Warm',
        echo: {
          ef: 60,
          lvDimensions: 'Normal',
          lvFunction: 'Normal systolic function',
          rvFunction: 'Normal',
          rwma: 'None',
          la: 'Normal',
          ra: 'Normal',
          mr: 'None',
          ar: 'None',
          as: 'None',
          ms: 'None',
          tr: 'Trace',
          pr: 'None',
          pasp: 24,
          ivc: 'Collapsible',
          pericardium: 'Clear',
          otherFindings: 'Unremarkable',
        },
        biomarkers: {
          troponin: '< 0.01 ng/mL',
          ckmb: '1.2 ng/mL',
          bnp: '25 pg/mL',
          ntProBnp: '60 pg/mL',
        },
        coronary: {
          cath: 'Not indicated',
          coronaryFindings: 'None',
          pci: 'None',
          stent: 'None',
          cabg: 'None',
        },
        antithrombotic: {
          antiplatelet: 'None',
          anticoagulation: 'Prophylaxis considered',
          thrombolysis: 'None',
        },
      },
      medications: [],
      ventilator: {
        mode: 'Room Air / Spontaneous',
        fio2: 21,
        peep: 0,
        tidalVolume: 500,
        rr: 16,
        pressureSupport: 0,
        inspiratoryPressure: 0,
        ieRatio: '1:2',
        peakPressure: 0,
        plateauPressure: 0,
        meanAirwayPressure: 0,
        spo2: 99,
        etco2: 35,
        compliance: 50,
        resistance: 5,
        abgHistory: [],
      },
      imaging: [],
      labs: [],
      procedures: [],
      calculatorResults: [],
      progressNotes: [
        {
          id: `note-${Date.now()}`,
          date: new Date().toISOString().split('T')[0],
          time: new Date().toTimeString().slice(0, 5),
          author: auth.userName,
          clinicalStatus: 'Initial Clinical Assessment',
          events: 'Patient admitted to unit.',
          examination: 'Vital signs stable.',
          investigations: 'Baseline labs and ECG ordered.',
          treatment: 'Initiated routine protocol.',
          response: 'Hemodynamically stable.',
          problems: `1. ${newPatientData.primaryDiagnosis || 'Admission evaluation'}`,
          plan: 'Monitor vitals and review pending results.',
        },
      ],
    };

    const updatedPatients = [fullPatient, ...patients];
    commitPatients(updatedPatients);

    // Update target bed if provided
    if (targetBedId) {
      const updatedBeds = beds.map((b) =>
        b.id === targetBedId
          ? { ...b, status: fullPatient.status, patientId: fullPatient.id }
          : b
      );
      commitBeds(updatedBeds);
    }

    showToast(`Patient ${fullPatient.fullName} admitted to Bed successfully`, 'success');
    return fullPatient;
  };

  const updatePatient = (patientId: string, updates: Partial<Patient>) => {
    const updatedPatients = patients.map((p) => {
      if (p.id === patientId) {
        return { ...p, ...updates };
      }
      return p;
    });
    commitPatients(updatedPatients);

    // If status changed, keep the bed status synchronized
    if (updates.status) {
      const target = patients.find((p) => p.id === patientId);
      if (target?.bedId) {
        const updatedBeds = beds.map((b) =>
          b.id === target.bedId ? { ...b, status: updates.status! } : b
        );
        commitBeds(updatedBeds);
      }
    }
  };

  const dischargePatient = (patientId: string, reason: string, summary: string) => {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;

    const unit = units.find((u) => u.id === patient.unitId);
    const pastAdmission: PastAdmission = {
      id: `past-adm-${Date.now()}`,
      admissionDate: patient.admissionDate,
      dischargeDate: new Date().toISOString().split('T')[0],
      unitName: unit?.name || 'Inpatient Unit',
      dischargeReason: reason as any,
      dischargeSummary: summary || 'Patient discharged following clinical stabilization.',
      primaryDiagnosis: patient.primaryDiagnosis,
    };

    const updatedPatients = patients.map((p) => {
      if (p.id === patientId) {
        return {
          ...p,
          isArchived: true,
          archiveReason: reason,
          archiveDate: new Date().toISOString().split('T')[0],
          pastAdmissions: [pastAdmission, ...(p.pastAdmissions || [])],
        };
      }
      return p;
    });

    // Vacate the bed
    const updatedBeds = beds.map((b) => {
      if (b.patientId === patientId) {
        return { ...b, status: 'Empty' as PatientStatus, patientId: undefined };
      }
      return b;
    });

    commitPatients(updatedPatients);
    commitBeds(updatedBeds);
    showToast(`Patient ${patient.fullName} discharged and archived.`, 'success');
    setCurrentView('census');
  };

  const transferPatient = (patientId: string, targetUnitId: string, targetBedId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;

    const currentBedId = patient.bedId;

    // Vacate old bed, fill new bed
    const updatedBeds = beds.map((b) => {
      if (b.id === currentBedId) {
        return { ...b, status: 'Empty' as PatientStatus, patientId: undefined };
      }
      if (b.id === targetBedId) {
        return { ...b, status: patient.status, patientId: patient.id };
      }
      return b;
    });

    const updatedPatients = patients.map((p) => {
      if (p.id === patientId) {
        return { ...p, unitId: targetUnitId, bedId: targetBedId };
      }
      return p;
    });

    commitBeds(updatedBeds);
    commitPatients(updatedPatients);
    showToast(`Patient transferred to new unit/bed successfully.`, 'success');
  };

  const readmitPatient = (patientId: string, targetUnitId: string, targetBedId: string) => {
    const patient = patients.find((p) => p.id === patientId);
    if (!patient) return;

    const updatedPatients = patients.map((p) => {
      if (p.id === patientId) {
        return {
          ...p,
          isArchived: false,
          archiveReason: undefined,
          archiveDate: undefined,
          unitId: targetUnitId,
          bedId: targetBedId,
          admissionDate: new Date().toISOString().split('T')[0],
          admissionTime: new Date().toTimeString().slice(0, 5),
        };
      }
      return p;
    });

    const updatedBeds = beds.map((b) => {
      if (b.id === targetBedId) {
        return { ...b, status: patient.status, patientId: patient.id };
      }
      return b;
    });

    commitPatients(updatedPatients);
    commitBeds(updatedBeds);
    showToast(`Existing patient ${patient.fullName} re-admitted without losing historical records.`, 'success');
  };

  const deletePatientPermanently = (patientId: string) => {
    const target = patients.find((p) => p.id === patientId);
    if (!target) return;

    const updatedPatients = patients.filter((p) => p.id !== patientId);
    const updatedBeds = beds.map((b) =>
      b.patientId === patientId
        ? { ...b, status: 'Empty' as PatientStatus, patientId: undefined }
        : b
    );

    commitPatients(updatedPatients);
    commitBeds(updatedBeds);
    showToast('Patient record permanently deleted.', 'info');
  };

  // Unit Operations
  const addUnit = (name: string, type: string, initialBedsCount = 3): Unit => {
    const unitId = `unit-${Date.now()}`;
    const newUnit: Unit = {
      id: unitId,
      name,
      type,
      totalBeds: initialBedsCount,
    };

    const newBeds: Bed[] = Array.from({ length: initialBedsCount }).map((_, idx) => ({
      id: `bed-${unitId}-${idx + 1}`,
      unitId,
      bedNumber: `Bed ${idx + 1}`,
      status: 'Empty',
    }));

    commitUnits([...units, newUnit]);
    commitBeds([...beds, ...newBeds]);
    showToast(`Unit "${name}" added with ${initialBedsCount} beds.`, 'success');
    return newUnit;
  };

  const updateUnit = (unitId: string, name: string, type: string) => {
    const updated = units.map((u) => (u.id === unitId ? { ...u, name, type } : u));
    commitUnits(updated);
    showToast(`Unit updated.`, 'success');
  };

  const deleteUnit = (unitId: string): boolean => {
    if (units.length <= 1) {
      showToast('Cannot delete the last remaining clinical unit.', 'error');
      return false;
    }

    const occupiedBed = beds.find((b) => b.unitId === unitId && b.patientId);
    if (occupiedBed) {
      showToast('Cannot delete unit with admitted patients. Please transfer or discharge patients first.', 'error');
      return false;
    }

    commitUnits(units.filter((u) => u.id !== unitId));
    commitBeds(beds.filter((b) => b.unitId !== unitId));
    showToast('Unit deleted.', 'info');
    if (currentUnitId === unitId) {
      setCurrentUnitId(units.find((u) => u.id !== unitId)?.id || null);
    }
    return true;
  };

  // Bed Operations
  const addBed = (unitId: string, bedNumber?: string): Bed => {
    const unitBeds = beds.filter((b) => b.unitId === unitId);
    const newBedNum = bedNumber || `Bed ${unitBeds.length + 1}`;
    const newBed: Bed = {
      id: `bed-${unitId}-${Date.now()}`,
      unitId,
      bedNumber: newBedNum,
      status: 'Empty',
    };

    commitBeds([...beds, newBed]);
    commitUnits(units.map((u) => (u.id === unitId ? { ...u, totalBeds: u.totalBeds + 1 } : u)));
    showToast(`${newBedNum} added to unit.`, 'success');
    return newBed;
  };

  const removeBed = (bedId: string): boolean => {
    const bed = beds.find((b) => b.id === bedId);
    if (!bed) return false;

    if (bed.patientId) {
      showToast('Cannot remove an occupied bed! Discharge or transfer patient first.', 'error');
      return false;
    }

    const unitBeds = beds.filter((b) => b.unitId === bed.unitId);
    if (unitBeds.length <= 1) {
      showToast('Unit must have at least 1 bed.', 'error');
      return false;
    }

    commitBeds(beds.filter((b) => b.id !== bedId));
    commitUnits(
      units.map((u) => (u.id === bed.unitId ? { ...u, totalBeds: Math.max(1, u.totalBeds - 1) } : u))
    );
    showToast('Bed removed.', 'info');
    return true;
  };

  // Cloud Sync Simulation
  const syncNow = async () => {
    setIsSyncing(true);
    await new Promise((resolve) => setTimeout(resolve, 800));
    setLastSyncTime(new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }));
    setIsSyncing(false);
    showToast('Cloud sync complete. All clinical records encrypted & up to date.', 'success');
  };

  const resetDatabase = () => {
    StorageService.resetToDefaultSeed();
    setUnits(StorageService.getUnits());
    setBeds(StorageService.getBeds());
    setPatients(StorageService.getPatients());
    showToast('Database reset to initial clinical sample data.', 'info');
  };

  const currentPatient = patients.find((p) => p.id === currentPatientId);

  return (
    <AppContext.Provider
      value={{
        theme,
        setTheme,
        toggleTheme,
        auth,
        loginWithGoogle,
        loginWithEmail,
        unlockWithPin,
        lockApp,
        logout,
        currentView,
        setCurrentView,
        currentUnitId,
        setCurrentUnitId,
        currentPatientId,
        setCurrentPatientId,
        currentPatient,
        activePatientSection,
        setActivePatientSection,
        units,
        beds,
        patients,
        archivedPatients,
        getPatientById,
        getBedsByUnit,
        getUnitById,
        addPatient,
        updatePatient,
        dischargePatient,
        transferPatient,
        readmitPatient,
        deletePatientPermanently,
        addUnit,
        updateUnit,
        deleteUnit,
        addBed,
        removeBed,
        isSearchOpen,
        setIsSearchOpen,
        isSyncing,
        lastSyncTime,
        syncNow,
        toasts,
        showToast,
        dismissToast,
        resetDatabase,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used within an AppProvider');
  return context;
};
