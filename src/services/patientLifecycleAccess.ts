import type { Bed, Patient, UserProfile } from '../types/clinical';

export function isAvailableLifecycleBed(bed: Bed, patients: Patient[]): boolean {
  if (bed.status !== 'Empty') return false;
  if (!bed.patientId) return true;
  const occupant = patients.find(patient => patient.id === bed.patientId);
  // An orphaned occupant is not evidence that a bed is free.
  return !!occupant?.isArchived;
}

export function canTransferBetweenUnits(
  user: UserProfile | null | undefined,
  sourceUnitId: string,
  destinationUnitId: string,
  canWriteUnit: (unitId: string) => boolean,
  canPerformTransfer: (user: UserProfile, unitId: string) => boolean,
): boolean {
  if (!user || !sourceUnitId || !destinationUnitId || sourceUnitId === destinationUnitId) return false;
  return canWriteUnit(sourceUnitId)
    && canWriteUnit(destinationUnitId)
    && canPerformTransfer(user, sourceUnitId)
    && canPerformTransfer(user, destinationUnitId);
}
