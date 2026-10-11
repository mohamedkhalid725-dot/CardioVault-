// Parses raw on-device OCR text from a printed lab report into structured results.
// Same output shape as the cloud analyzer (ExtractedLabResult) so both paths
// feed the identical review modal. Never invents values: unmatched or unclear
// lines become human-readable notes, never fabricated results.
import type { ExtractedLabResult } from './aiLogic';

export interface ParsedLabOcr {
  results: ExtractedLabResult[];
  notes: string[];
}

// Canonical test name + OCR-tolerant aliases (lowercase, punctuation stripped).
const TEST_ALIASES: Array<{ name: string; aliases: string[] }> = [
  { name: 'Hemoglobin', aliases: ['hemoglobin', 'haemoglobin', 'hb', 'hgb'] },
  { name: 'RBC', aliases: ['total rbc', 'rbc count', 'rbc', 'red blood cell'] },
  { name: 'PCV', aliases: ['packed cell volume', 'pcv', 'hematocrit', 'haematocrit', 'hct'] },
  { name: 'MCV', aliases: ['mcv'] },
  { name: 'MCH', aliases: ['mch'] },
  { name: 'MCHC', aliases: ['mchc'] },
  { name: 'RDW', aliases: ['rdw-cv', 'rdw'] },
  { name: 'WBC', aliases: ['total wbc', 'wbc count', 'wbc', 'tlc', 'white blood cell'] },
  { name: 'Neutrophils', aliases: ['neutrophils', 'neutrophil'] },
  { name: 'Lymphocytes', aliases: ['lymphocytes', 'lymphocyte'] },
  { name: 'Eosinophils', aliases: ['eosinophils', 'eosinophil'] },
  { name: 'Monocytes', aliases: ['monocytes', 'monocyte'] },
  { name: 'Basophils', aliases: ['basophils', 'basophil'] },
  { name: 'Platelet Count', aliases: ['platelet count', 'platelet', 'plt'] },
  { name: 'MPV', aliases: ['mpv'] },
  { name: 'ESR', aliases: ['esr'] },
  { name: 'CRP', aliases: ['hs-crp', 'crp'] },
  { name: 'Sodium', aliases: ['sodium', 'na+'] },
  { name: 'Potassium', aliases: ['potassium', 'k+'] },
  { name: 'Chloride', aliases: ['chloride', 'cl-'] },
  { name: 'Bicarbonate', aliases: ['bicarbonate', 'hco3'] },
  { name: 'Urea', aliases: ['urea', 'bun'] },
  { name: 'Creatinine', aliases: ['creatinine'] },
  { name: 'Glucose', aliases: ['fasting glucose', 'random glucose', 'glucose', 'fbs', 'rbs'] },
  { name: 'Calcium', aliases: ['calcium'] },
  { name: 'Troponin', aliases: ['hs troponin', 'troponin', 'hs-trop', 'trop'] },
  { name: 'CK-MB', aliases: ['ck-mb', 'ckmb'] },
  { name: 'BNP', aliases: ['nt-probnp', 'nt probnp', 'bnp'] },
  { name: 'D-Dimer', aliases: ['d-dimer', 'd dimer'] },
  { name: 'INR', aliases: ['inr'] },
  { name: 'HbA1c', aliases: ['hba1c', 'hb a1c', 'a1c'] },
  { name: 'AST', aliases: ['ast', 'sgot'] },
  { name: 'ALT', aliases: ['alt', 'sgpt'] },
  { name: 'TSH', aliases: ['tsh'] },
  { name: 'pH', aliases: ['ph'] },
  { name: 'PaCO2', aliases: ['paco2', 'pa co2'] },
  { name: 'PaO2', aliases: ['pao2', 'pa o2'] },
  { name: 'Lactate', aliases: ['lactate'] },
];

const KNOWN_UNITS = [
  'mill/cumm', 'thou/cumm', 'lac/cumm', '10^6/µl', '10^3/µl', '10^6/ul', '10^3/ul',
  'mosm/kg', 'mm/hr', 'miu/l', 'µmol/l', 'umol/l', 'µg/dl', 'ug/dl',
  'g/dl', 'mg/dl', 'mmol/l', 'ng/ml', 'pg/ml', 'ng/l', 'mg/l', 'iu/ml', 'iu/l',
  'u/l', 'fl', 'pg', '%', '/cmm', 'cumm', 'sec', 'ratio', 'mmhg',
];

const HEADER_JUNK = [
  'investigation', 'reference value', 'biological reference', 'primary sample',
  'end of report', 'thanks for reference', 'page 1 of', 'generated on',
  'sample collected', 'registered on', 'collected on', 'reported on', 'interpretation',
];

const normalize = (s: string): string =>
  s
    .toLowerCase()
    .replace(/(\d)\.(\d)/g, '$1_dec_$2') // protect decimal points inside numbers
    .replace(/[.,;:()|]/g, ' ')
    .replace(/_dec_/g, '.')
    .replace(/\s+/g, ' ')
    .trim();

function matchesAlias(line: string, alias: string): boolean {
  if (alias.length <= 3) {
    return new RegExp(`(^|[^a-z])${alias.replace(/[+]/g, '\\$&')}([^a-z]|$)`).test(line);
  }
  return line.includes(alias);
}

function extractRange(rest: string): { lo: number; hi: number; raw: string } | null {
  const matches = [...rest.matchAll(/(-?\d+(?:\.\d+)?)\s*(?:-|–|—|to)\s*(-?\d+(?:\.\d+)?)/gi)];
  if (!matches.length) return null;
  const last = matches[matches.length - 1];
  const lo = Number(last[1]);
  const hi = Number(last[2]);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return null;
  return { lo, hi, raw: last[0] };
}

function extractUnit(rest: string): string {
  const lower = ` ${rest.toLowerCase().replace(/\s+/g, ' ')} `;
  const sorted = [...KNOWN_UNITS].sort((a, b) => b.length - a.length);
  for (const unit of sorted) {
    if (unit.length <= 3) {
      if (new RegExp(`(^|[^a-z/])${unit}([^a-z]|$)`).test(lower)) return unit;
    } else if (lower.includes(unit)) {
      return unit;
    }
  }
  return '';
}

export function parseLabOcrText(text: string): ParsedLabOcr {
  const results: ExtractedLabResult[] = [];
  const notes: string[] = [];
  const seen = new Set<string>();
  const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

  for (const rawLine of lines) {
    const line = normalize(rawLine);
    if (!line) continue;
    if (HEADER_JUNK.some((junk) => line.includes(junk))) continue;

    // Longest alias wins so "total wbc" beats "wbc", "packed cell volume" beats "pcv".
    let best: { name: string; alias: string } | null = null;
    for (const test of TEST_ALIASES) {
      for (const alias of test.aliases) {
        if (matchesAlias(line, alias) && (!best || alias.length > best.alias.length)) {
          best = { name: test.name, alias };
        }
      }
    }
    if (!best) {
      if (/\d/.test(line) && line.length > 8) {
        notes.push(`Unrecognized line kept for manual review: ${rawLine.slice(0, 80)}`);
      }
      continue;
    }
    if (seen.has(best.name)) continue;
    seen.add(best.name);

    let rest = line;
    const idx = rest.indexOf(best.alias);
    if (idx >= 0) rest = `${rest.slice(0, idx)} ${rest.slice(idx + best.alias.length)}`;

    const range = extractRange(rest);
    if (range) rest = rest.replace(range.raw, ' ');

    const numbers = [...rest.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter(Number.isFinite);
    if (!numbers.length) {
      notes.push(`${best.name} was detected but no value could be read.`);
      continue;
    }
    const value = numbers[0];
    const unit = extractUnit(rest);

    const hasLow = /\blow\b/.test(line) || /↓/.test(rawLine);
    const hasHigh = /\bhigh\b/.test(line) || /↑/.test(rawLine);
    const hasCritical = /\bcritical\b/.test(line);
    const hasBorderline = /\bborderline\b/.test(line);

    let status: ExtractedLabResult['status'] = 'unknown';
    if (hasCritical) status = 'critical';
    else if (hasHigh) status = 'high';
    else if (hasLow) status = 'low';
    else if (range) status = value < range.lo ? 'low' : value > range.hi ? 'high' : 'normal';
    if (hasBorderline) {
      status = 'unknown';
      notes.push(`${best.name} is borderline (${value}${unit ? ` ${unit}` : ''}); confirm manually.`);
    }

    results.push({
      testName: best.name,
      value,
      unit,
      referenceRange: range ? `${range.lo} - ${range.hi}` : '',
      status,
    });
  }

  return { results, notes };
}
