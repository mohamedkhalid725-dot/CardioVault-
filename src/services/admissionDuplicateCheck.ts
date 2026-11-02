import { findPatientNameMatches, type PatientNameMatch } from './patientDedup.ts';
import type { MasterPatientFile } from '../types/clinicArea.ts';
import type { Patient, Unit } from '../types/clinical.ts';

export async function findAdmissionDuplicateMatches(input: {
  name: string;
  patients: ReadonlyArray<Patient>;
  units: ReadonlyArray<Unit>;
  unitId: string;
  loadMasterFiles: () => Promise<MasterPatientFile[]>;
  onLookupError?: (error: unknown) => void;
}): Promise<PatientNameMatch[]> {
  let masterFiles: MasterPatientFile[] = [];
  try {
    masterFiles = await input.loadMasterFiles();
  } catch (error) {
    (input.onLookupError || (lookupError => console.warn('Master-file duplicate lookup failed; continuing with unit patients only.', lookupError)))(error);
  }

  return findPatientNameMatches(input.name, input.patients, input.units, input.unitId, masterFiles);
}
