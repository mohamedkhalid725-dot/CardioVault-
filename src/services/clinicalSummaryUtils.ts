import { Patient } from '../types/clinical';

/**
 * Generates a concise, prioritized Patient Brief Summary from existing documented records.
 * STRICT CLINICAL RULES:
 * - Prioritize major chronic diseases, cardiac history, previous PCI/CABG, stents, heart failure, arrhythmias.
 * - Prioritize relevant major diagnoses and important allergies.
 * - Ground strictly in information already present in the patient record. Zero hallucination.
 * - Concise clinical snapshot, e.g.: "DM, HTN, IHD, s/p PCI with coronary stent."
 */
export function generatePatientBriefSummary(patient?: Patient | null): string {
  if (!patient) return 'No patient selected';

  const parts: string[] = [];

  // 1. Cardiovascular & Chronic Risk Factors (from structured cardiovascularHistory)
  const cv = patient.cardiovascularHistory;
  if (cv) {
    if (cv.diabetes) parts.push('DM');
    if (cv.hypertension) parts.push('HTN');
    if (cv.dyslipidemia) parts.push('DLP');
    if (cv.cad) parts.push('CAD/IHD');
    if (cv.previousMI) parts.push('s/p MI');
    if (cv.heartFailure) parts.push('Heart Failure');
    if (cv.arrhythmias) parts.push('Arrhythmia/AF');
    if (cv.valvularDisease) parts.push('Valvular Dz');
    if (cv.previousPCI) parts.push('s/p PCI');
    if (cv.previousCABG) parts.push('s/p CABG');
    if (cv.previousStroke) parts.push('s/p CVA/TIA');
    if (cv.pvd) parts.push('PVD');
    if (cv.smoking) parts.push('Tobacco Smoker');
    if (cv.other && typeof cv.other === 'string' && cv.other.trim()) {
      parts.push(cv.other.trim());
    }
  }

  // 2. Past Medical History (PMH) strings from clinicalSummary
  const pmh = patient.clinicalSummary?.pmh;
  if (Array.isArray(pmh) && pmh.length > 0) {
    for (const item of pmh) {
      if (!item || typeof item !== 'string') continue;
      const clean = item.trim();
      const lower = clean.toLowerCase();
      // Avoid duplicate abbreviations if already included from cv
      if (lower.includes('diabetes') && parts.includes('DM')) continue;
      if (lower.includes('hypertension') && parts.includes('HTN')) continue;
      if ((lower.includes('cad') || lower.includes('ischemic') || lower.includes('ihd')) && parts.includes('CAD/IHD')) continue;
      if (lower.includes('heart failure') && parts.includes('Heart Failure')) continue;
      if (lower.includes('cabg') && parts.includes('s/p CABG')) continue;
      if (lower.includes('pci') && parts.includes('s/p PCI')) continue;
      parts.push(clean);
    }
  } else if (typeof pmh === 'string' && (pmh as string).trim()) {
    parts.push((pmh as string).trim());
  }

  // 3. Past Surgical History (PSH) / Interventions
  const psh = patient.clinicalSummary?.psh;
  if (Array.isArray(psh) && psh.length > 0) {
    for (const item of psh) {
      if (!item || typeof item !== 'string') continue;
      const clean = item.trim();
      const lower = clean.toLowerCase();
      if (lower.includes('pci') && parts.includes('s/p PCI')) {
        // If specific details like stent are mentioned, upgrade the entry
        const pciIdx = parts.indexOf('s/p PCI');
        if (pciIdx !== -1 && lower.includes('stent')) {
          parts[pciIdx] = clean;
        }
        continue;
      }
      parts.push(clean);
    }
  } else if (typeof psh === 'string' && (psh as string).trim()) {
    parts.push((psh as string).trim());
  }

  // 4. Stents & Coronary history from cardiology
  const coronary = patient.cardiology?.coronary;
  if (coronary) {
    if (coronary.stent && typeof coronary.stent === 'string' && coronary.stent.trim()) {
      const stentText = `Stent: ${coronary.stent.trim()}`;
      if (!parts.some(p => p.toLowerCase().includes(coronary.stent.toLowerCase()))) {
        parts.push(stentText);
      }
    }
    if (coronary.pci && typeof coronary.pci === 'string' && coronary.pci.trim() && !parts.includes('s/p PCI')) {
      parts.push(`s/p PCI (${coronary.pci.trim()})`);
    }
    if (coronary.cabg && typeof coronary.cabg === 'string' && coronary.cabg.trim() && !parts.includes('s/p CABG')) {
      parts.push(`s/p CABG (${coronary.cabg.trim()})`);
    }
  }

  // 5. Echo findings if noteworthy (e.g. reduced EF)
  const ef = patient.cardiology?.echo?.ef;
  if (typeof ef === 'number' && ef > 0) {
    parts.push(`LVEF ${ef}%`);
  }

  // 6. Allergies (only if specific known allergies, omit generic NKDA to keep snapshot brief)
  if (Array.isArray(patient.allergies) && patient.allergies.length > 0) {
    const significantAllergies = patient.allergies.filter(
      a => a && !['nkda', 'none', 'no known allergies', 'no known drug allergies', 'nil'].includes(a.trim().toLowerCase())
    );
    if (significantAllergies.length > 0) {
      parts.push(`Allergies: ${significantAllergies.join(', ')}`);
    }
  }

  // 7. If still empty, fall back to primary diagnosis
  if (parts.length === 0) {
    if (patient.primaryDiagnosis && patient.primaryDiagnosis.trim()) {
      return patient.primaryDiagnosis.trim();
    }
    return 'No prior chronic history or cardiac interventions documented.';
  }

  // Join into clean concise medical snapshot
  return parts.join(' • ');
}
