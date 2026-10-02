import {Patient} from '../types/clinical';

export function patientBriefSummary(patient: Patient): string {
  const items: string[] = [];
  const cv = patient.cardiovascularHistory;
  if (cv?.diabetes) items.push('Diabetes mellitus');
  if (cv?.hypertension) items.push('Hypertension');
  if (cv?.cad) items.push('Ischemic heart disease');
  if (cv?.previousMI) items.push('Previous MI');
  if (cv?.previousPCI) items.push('s/p PCI');
  if (cv?.previousCABG) items.push('s/p CABG');
  if (cv?.heartFailure) items.push('Heart failure');
  if (cv?.arrhythmias) items.push('Arrhythmia');
  for (const value of [...(patient.clinicalSummary?.pmh || []), ...(patient.clinicalSummary?.psh || [])]) {
    const clean = String(value || '').trim();
    if (clean) items.push(clean);
  }
  const unique = Array.from(new Set(items));
  if (unique.length) return unique.slice(0, 5).join(' • ');
  const complaint = String(patient.clinicalSummary?.chiefComplaint || '').trim();
  if (complaint) return complaint.slice(0, 180);
  const diagnosis = String(patient.primaryDiagnosis || '').trim();
  return diagnosis || 'No relevant history documented';
}
