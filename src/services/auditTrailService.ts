import { DetailedAuditLog, ClinicalCorrection } from '../types/clinical';

export type AuditEntry = DetailedAuditLog;

const AUDIT_STORAGE_KEY = 'cardiovault_immutable_audit_logs_v2';
const CORRECTIONS_STORAGE_KEY = 'cardiovault_clinical_corrections_v2';

export const AuditTrailService = {
  getLogs(): DetailedAuditLog[] {
    try {
      const raw = localStorage.getItem(AUDIT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  },

  logAction(entry: Omit<DetailedAuditLog, 'id' | 'timestamp' | 'deviceSession'> & { id?: string; timestamp?: string }): DetailedAuditLog {
    const logs = this.getLogs();
    const newLog: DetailedAuditLog = {
      id: entry.id || `audit-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: entry.timestamp || new Date().toISOString(),
      deviceSession: `session-${Date.now().toString(36)}`,
      ...entry,
    };

    const updated = [newLog, ...logs].slice(0, 500); // Keep last 500 events
    try {
      localStorage.setItem(AUDIT_STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error('Audit trail persistence failed:', e);
    }
    return newLog;
  },

  getCorrections(patientId?: string): ClinicalCorrection[] {
    try {
      const raw = localStorage.getItem(CORRECTIONS_STORAGE_KEY);
      if (raw) {
        const parsed: ClinicalCorrection[] = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          return patientId ? parsed.filter(c => c.patientId === patientId) : parsed;
        }
      }
    } catch {}
    return [];
  },

  logCorrection(correction: Omit<ClinicalCorrection, 'id' | 'timestamp'>): ClinicalCorrection {
    const corrections = this.getCorrections();
    const newCorrection: ClinicalCorrection = {
      id: `corr-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timestamp: new Date().toISOString(),
      ...correction,
    };

    const updated = [newCorrection, ...corrections];
    try {
      localStorage.setItem(CORRECTIONS_STORAGE_KEY, JSON.stringify(updated));
    } catch {}

    // Also log in primary immutable audit trail
    this.logAction({
      userId: correction.user,
      userName: correction.user,
      role: correction.userRole,
      action: `Clinical Correction: ${correction.recordType} - ${correction.fieldName}`,
      patientId: correction.patientId,
      previousValue: correction.originalValue,
      newValue: correction.correctedValue,
      reason: correction.reason,
    });

    return newCorrection;
  },
};
