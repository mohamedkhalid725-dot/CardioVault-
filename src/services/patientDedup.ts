import type { Patient, Unit } from '../types/clinical';

/**
 * Name matching for the "one clinical file, two units" flow.
 *
 * Pure functions only: no Firebase, no storage, no React. That keeps the rule
 * that decides whether two spellings are "the same patient" unit-testable and
 * identical on every device.
 *
 * The comparison is deliberately conservative: it never merges anything by
 * itself, it only reports candidates for the doctor to accept or reject.
 */

// Arabic-Indic and Eastern Arabic-Indic digits -> ASCII.
const ARABIC_INDIC_ZERO = 0x0660;
const EXTENDED_ARABIC_INDIC_ZERO = 0x06f0;

function normalizeDigits(value: string): string {
  let out = '';
  for (const character of value) {
    const code = character.codePointAt(0) || 0;
    if (code >= ARABIC_INDIC_ZERO && code <= ARABIC_INDIC_ZERO + 9) {
      out += String(code - ARABIC_INDIC_ZERO);
    } else if (code >= EXTENDED_ARABIC_INDIC_ZERO && code <= EXTENDED_ARABIC_INDIC_ZERO + 9) {
      out += String(code - EXTENDED_ARABIC_INDIC_ZERO);
    } else {
      out += character;
    }
  }
  return out;
}

/**
 * Normalises a patient name for comparison:
 *  - trims and collapses whitespace;
 *  - strips Arabic diacritics (harakat, tanween, shadda, sukun, Quranic marks)
 *    and the tatweel/kashida elongation character;
 *  - unifies the alef forms (alef with hamza above/below, alef madda) to a bare
 *    alef, alef maqsura to yeh, and teh marbuta to heh;
 *  - converts Arabic-Indic digits to ASCII;
 *  - lowercases Latin letters and drops every punctuation or symbol character.
 *
 * So "Mohamed  KHALID" and "Mohamed Khalid." collapse to the same key, and so do
 * "أحمد" and "احمد".
 */
export function normalizePatientName(value: unknown): string {
  let text = String(value ?? '');
  if (!text) return '';
  // Diacritics + tatweel.
  text = text.replace(/[\u064b-\u065f\u0670\u06d6-\u06ed\u0640]/g, '');
  // Alef forms, alef maqsura, teh marbuta.
  text = text.replace(/[\u0622\u0623\u0625]/g, '\u0627').replace(/\u0649/g, '\u064a').replace(/\u0629/g, '\u0647');
  text = normalizeDigits(text);
  text = text.toLowerCase();
  // Keep letters, digits and spaces only (Unicode aware, so Arabic survives).
  text = text.replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return text.replace(/\s+/g, ' ').trim();
}

export interface PatientNameMatch {
  patientId: string;
  name: string;
  mrn: string;
  age: number;
  bedNumber: string;
  unitId: string;
  unitName: string;
  /** True when the candidate file already lives in the unit being admitted to. */
  isSameUnit: boolean;
}

/**
 * Finds the already-registered files whose normalised name equals `name`.
 *
 * Only patients of the units in `units` are ever considered, so a lookup can
 * never reveal that a name exists in a unit the caller does not belong to.
 * Archived (discharged) files are skipped: they are history, not an admission.
 *
 * `currentUnitId` is the unit the caller is admitting into, and only sets
 * `isSameUnit` on the result - nothing here reads or writes Firestore.
 */
export function findPatientNameMatches(
  name: unknown,
  patients: ReadonlyArray<Patient> | null | undefined,
  units: ReadonlyArray<Unit> | null | undefined,
  currentUnitId?: string,
): PatientNameMatch[] {
  const target = normalizePatientName(name);
  if (!target) return [];
  const unitById = new Map<string, Unit>();
  for (const unit of units || []) {
    if (unit && unit.id) unitById.set(String(unit.id), unit);
  }
  if (!unitById.size) return [];
  const wanted = currentUnitId ? String(currentUnitId) : '';
  const seen = new Set<string>();
  const matches: PatientNameMatch[] = [];
  for (const patient of patients || []) {
    if (!patient || patient.isArchived) continue;
    const patientId = String(patient.id || '');
    if (!patientId || seen.has(patientId)) continue;
    const unitId = String(patient.unitId || '');
    // The caller's own units only - never a unit they are not a member of.
    const unit = unitById.get(unitId);
    if (!unit) continue;
    const displayName = String(patient.fullName || patient.name || '');
    if (normalizePatientName(displayName) !== target) continue;
    seen.add(patientId);
    matches.push({
      patientId,
      name: displayName,
      mrn: String(patient.mrn || ''),
      age: Number(patient.age || 0),
      bedNumber: String(patient.bedNumber || ''),
      unitId,
      unitName: String(unit.name || unitId),
      isSameUnit: !!wanted && unitId === wanted,
    });
  }
  return matches;
}
