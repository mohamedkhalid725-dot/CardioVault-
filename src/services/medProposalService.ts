import { Medication, UserProfile } from '../types/clinical';
import { AuditTrailService } from './auditTrailService';

/**
 * Minimal viable nurse medication-proposal queue.
 *
 * Flow: nurse PROPOSES a medication order (no direct write to the patient
 * record). The proposal sits in a pending queue surfaced in TasksCenterView
 * ("Pending medication approvals") until a resident / specialist / consultant
 * / department_admin approves (applies the order + writes an audit entry
 * showing added-by nurse + approved-by doctor) or rejects it.
 *
 * Storage: localStorage (backward compatible, no schema migration).
 * TODO: cloud sync (Firestore collection under the workspace, mirroring
 * clinicalWorkflowService task sync) + push notification to approvers.
 */
export interface PendingMedProposal {
  id: string;
  patientId: string;
  patientName: string;
  unitId: string;
  medication: Medication;
  status: 'pending' | 'approved' | 'rejected';
  proposedByUid: string;
  proposedByName: string;
  proposedAt: string;
  reviewedByUid?: string;
  reviewedByName?: string;
  reviewedAt?: string;
  reviewNote?: string;
}

const PROPOSAL_KEY = 'cardiovault_pending_med_proposals_v1';

const readAll = (): PendingMedProposal[] => {
  try {
    const raw = localStorage.getItem(PROPOSAL_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const writeAll = (list: PendingMedProposal[]): void => {
  try {
    localStorage.setItem(PROPOSAL_KEY, JSON.stringify(list));
  } catch (e) {
    console.error('Med proposal persistence failed:', e);
  }
};

const notify = (): void => {
  window.dispatchEvent(new CustomEvent('cardiovault-med-proposal-updated'));
  window.dispatchEvent(new CustomEvent('cardiovault-task-updated'));
};

export const MedProposalService = {
  getProposals(patientId?: string): PendingMedProposal[] {
    const all = readAll();
    return patientId ? all.filter(p => p.patientId === patientId) : all;
  },

  getPending(patientId?: string): PendingMedProposal[] {
    return this.getProposals(patientId).filter(p => p.status === 'pending');
  },

  propose(params: {
    patientId: string;
    patientName: string;
    unitId: string;
    medication: Medication;
    nurse: UserProfile;
  }): PendingMedProposal {
    const proposal: PendingMedProposal = {
      id: `medprop-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      patientId: params.patientId,
      patientName: params.patientName,
      unitId: params.unitId,
      medication: params.medication,
      status: 'pending',
      proposedByUid: params.nurse.userId,
      proposedByName: params.nurse.name,
      proposedAt: new Date().toISOString(),
    };
    writeAll([proposal, ...readAll()]);
    AuditTrailService.logAction({
      userId: params.nurse.userId,
      userName: params.nurse.name,
      role: params.nurse.role,
      action: `Proposed medication: ${params.medication.name || (params.medication as any).drug || 'Medication'} ${params.medication.dose} (pending doctor approval)`,
      patientId: params.patientId,
      patientName: params.patientName,
      unitId: params.unitId,
    });
    notify();
    return proposal;
  },

  approve(proposalId: string, doctor: UserProfile, note?: string): PendingMedProposal | null {
    const all = readAll();
    const target = all.find(p => p.id === proposalId);
    if (!target || target.status !== 'pending') return null;
    const updated: PendingMedProposal = {
      ...target,
      status: 'approved',
      reviewedByUid: doctor.userId,
      reviewedByName: doctor.name,
      reviewedAt: new Date().toISOString(),
      ...(note ? { reviewNote: note } : {}),
    };
    writeAll(all.map(p => (p.id === proposalId ? updated : p)));
    AuditTrailService.logAction({
      userId: doctor.userId,
      userName: doctor.name,
      role: doctor.role,
      action: `Approved medication proposed by ${target.proposedByName}: ${target.medication.name || (target.medication as any).drug || 'Medication'} ${target.medication.dose}`,
      patientId: target.patientId,
      patientName: target.patientName,
      unitId: target.unitId,
      reason: note,
    });
    notify();
    return updated;
  },

  reject(proposalId: string, doctor: UserProfile, note?: string): PendingMedProposal | null {
    const all = readAll();
    const target = all.find(p => p.id === proposalId);
    if (!target || target.status !== 'pending') return null;
    const updated: PendingMedProposal = {
      ...target,
      status: 'rejected',
      reviewedByUid: doctor.userId,
      reviewedByName: doctor.name,
      reviewedAt: new Date().toISOString(),
      ...(note ? { reviewNote: note } : {}),
    };
    writeAll(all.map(p => (p.id === proposalId ? updated : p)));
    AuditTrailService.logAction({
      userId: doctor.userId,
      userName: doctor.name,
      role: doctor.role,
      action: `Rejected medication proposed by ${target.proposedByName}: ${target.medication.name || (target.medication as any).drug || 'Medication'} ${target.medication.dose}`,
      patientId: target.patientId,
      patientName: target.patientName,
      unitId: target.unitId,
      reason: note,
    });
    notify();
    return updated;
  },
};
