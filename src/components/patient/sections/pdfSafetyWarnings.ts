export type PdfSafetyWarning = { t: string; kind: 'amber' | 'rose' };

export function getPdfSafetyWarnings(patient: any, record: any): PdfSafetyWarning[] {
  const warnings: PdfSafetyWarning[] = [];
  const freeText = [
    record.clinicalSummary?.chiefComplaint, record.clinicalSummary?.hpi, record.clinicalSummary?.summary,
    ...(record.progressNotes || []).map((note: any) => `${note.assessment || ''} ${note.subjective || ''} ${note.objective || ''}`),
  ].filter(Boolean).join('\n');
  const ages = new Set<number>();
  const agePattern = /(?:age\s*[:=]?\s*(\d{1,3})|(\d{1,3})\s*(?:-?years?-old|years?\s*old|y\.?o\.?|yo\b))|(?:العمر\s*[:=]?\s*(\d{1,3})|(\d{1,3})\s*(?:سنة|سنه|عام))/gi;
  let match: RegExpExecArray | null;
  while ((match = agePattern.exec(freeText))) {
    const age = Number(match[1] || match[2] || match[3] || match[4]);
    if (age <= 120) ages.add(age);
  }
  ages.forEach(age => {
    if (typeof patient.age === 'number' && Math.abs(age - patient.age) > 1) {
      warnings.push({ t: `Age discrepancy: file ${patient.age} vs note ${age}`, kind: 'amber' });
    }
  });

  const latestVitals = record.vitalsHistory?.[0];
  const numeric = (value: unknown): number | null => {
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };
  const systolic = numeric(latestVitals?.sbp);
  const pulse = numeric(latestVitals?.hr);
  const oxygen = numeric(latestVitals?.spo2);
  const temperature = numeric(latestVitals?.temp);
  const gcs = numeric(latestVitals?.gcsTotal);
  if (systolic !== null && (systolic >= 180 || systolic < 90)) warnings.push({ t: `Critical systolic blood pressure: ${systolic} mmHg`, kind: 'rose' });
  if (pulse !== null && (pulse >= 120 || pulse < 50)) warnings.push({ t: `Critical heart rate: ${pulse} bpm`, kind: 'rose' });
  if (oxygen !== null && oxygen < 90) warnings.push({ t: `Critical oxygen saturation: ${oxygen}%`, kind: 'rose' });
  if (temperature !== null && temperature >= 38) warnings.push({ t: `Fever: ${temperature} °C`, kind: 'amber' });
  if (gcs !== null && gcs <= 8) warnings.push({ t: `Critical GCS: ${gcs}/15`, kind: 'rose' });
  const heartRates: Array<[string, number]> = [];
  const addRate = (name: string, value: unknown) => {
    const rate = Number(value);
    if (value != null && value !== '' && Number.isFinite(rate) && rate > 0) heartRates.push([name, rate]);
  };
  addRate('vitals', latestVitals?.hr);
  addRate('ECG', record.ecgRecords?.[0]?.heartRate);
  addRate('cardiology', record.cardiology?.heartRate);
  for (let i = 0; i < heartRates.length; i++) for (let j = i + 1; j < heartRates.length; j++) {
    if (Math.abs(heartRates[i][1] - heartRates[j][1]) > 10) {
      warnings.push({ t: `HR discrepancy: ${heartRates[i][0]} ${heartRates[i][1]} vs ${heartRates[j][0]} ${heartRates[j][1]}`, kind: 'amber' });
    }
  }
  if (latestVitals && ['gcsEye', 'gcsVerbal', 'gcsMotor', 'gcsTotal'].every(key => latestVitals[key] != null)) {
    const components = [latestVitals.gcsEye, latestVitals.gcsVerbal, latestVitals.gcsMotor].map(Number);
    const total = Number(latestVitals.gcsTotal);
    if (components.every(Number.isFinite) && Number.isFinite(total) && components.reduce((sum, value) => sum + value, 0) !== total) {
      warnings.push({ t: `GCS discrepancy: components E${latestVitals.gcsEye}V${latestVitals.gcsVerbal}M${latestVitals.gcsMotor} (=${components.reduce((sum, value) => sum + value, 0)}) vs total ${latestVitals.gcsTotal}`, kind: 'amber' });
    }
  }

  const ecgText = [
    ...(record.ecgRecords || []).slice(0, 1).flatMap((ecg: any) => [ecg.interpretation, ecg.findings, ecg.impression, ecg.conclusion, ecg.finalImpression, ecg.stSegment]),
    record.cardiology?.ecgInterpretation, record.cardiology?.ecgFindings,
  ].flatMap(value => Array.isArray(value) ? value : [value]).filter((value): value is string => typeof value === 'string').join(' ');
  const mentionsAcute = /\b(stemi|acute myocardial infarction|st[- ]?elevation)\b/i.test(ecgText);
  const explicitlyNegative = /\b(no|without|negative for|no evidence of)\b[^.]{0,50}\b(stemi|st[- ]?elevation|acute myocardial infarction)\b/i.test(ecgText);
  if (mentionsAcute && !explicitlyNegative) {
    warnings.push({ t: 'ECG warning: recorded text mentions possible acute ST-elevation / MI; clinician review required', kind: 'rose' });
  }
  return warnings;
}
