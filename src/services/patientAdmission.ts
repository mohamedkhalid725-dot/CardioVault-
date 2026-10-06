import type { Patient } from '../types/clinical';

const pad = (value: number): string => String(value).padStart(2, '0');
export const toLocalIsoTimestamp = (date: Date): string => {
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const absoluteOffset = Math.abs(offsetMinutes);
  const hours = Math.floor(absoluteOffset / 60);
  const minutes = absoluteOffset % 60;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}${sign}${pad(hours)}:${pad(minutes)}`;
};
export const isAtOrAfterCurrentAdmission = (recordTimestamp: string | undefined, currentAdmissionStartedAt: string | undefined): boolean => {
  if (!currentAdmissionStartedAt) return true;
  if (!recordTimestamp) return false;
  const recordMs = Date.parse(recordTimestamp);
  const admissionMs = Date.parse(currentAdmissionStartedAt);
  return Number.isFinite(recordMs) && Number.isFinite(admissionMs) && recordMs >= admissionMs;
};
export const prepareReadmittedPatient = (patient: Patient, unitId: string, bedId: string): Patient => ({
  ...patient,
  isArchived: false,
  archiveReason: undefined,
  archiveDate: undefined,
  unitId,
  bedId,
  pastAdmissions: [...(patient.pastAdmissions || [])],
});
