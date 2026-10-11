// Parses raw on-device OCR text from a printed lab report into structured results.
// Same output shape as the cloud analyzer (ExtractedLabResult) so both paths
// feed the identical review modal. Never invents values: unmatched or unclear
// lines become human-readable notes, never fabricated results.
import type { ExtractedLabResult } from './aiLogic';

export interface ParsedLabOcr {
  results: ExtractedLabResult[];
  notes: string[];
  rawText: string;
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
  { name: 'Troponin', aliases: ['hs troponin', 'troponin'] },
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

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Whole-word match for every alias: prevents a fragment inside another word
// (for example "trop" inside "neutrophils") from hijacking the test name.
function matchesAlias(line: string, alias: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}([^a-z0-9]|$)`).test(line);
}

// Small edit distance for OCR-broken names ("sasophils" -> "basophils").
// Short aliases (length 3 or less) stay exact-only: fuzzy on them causes
// far more wrong-name errors than it fixes.
function editDistance(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

// Fuzzy fallback: tolerates 1-2 wrong letters in a single word token.
// Multi-word aliases must match exactly; only single words go fuzzy.
function fuzzyAlias(line: string, alias: string): boolean {
  if (alias.includes(' ') || alias.length <= 3) return false;
  const threshold = alias.length <= 5 ? 1 : 2;
  for (const token of line.split(/[^a-z0-9+]+/)) {
    if (!token || Math.abs(token.length - alias.length) > threshold) continue;
    if (editDistance(token, alias) <= threshold) return true;
  }
  return false;
}

// Canonical test name -> laboratory panel (same names as the Labs UI filter).
const TEST_PANELS: Record<string, string> = {
  Hemoglobin: 'CBC', RBC: 'CBC', PCV: 'CBC', MCV: 'CBC', MCH: 'CBC', MCHC: 'CBC',
  RDW: 'CBC', WBC: 'CBC', Neutrophils: 'CBC', Lymphocytes: 'CBC', Eosinophils: 'CBC',
  Monocytes: 'CBC', Basophils: 'CBC', 'Platelet Count': 'CBC', MPV: 'CBC',
  Sodium: 'Chemistry', Potassium: 'Chemistry', Chloride: 'Chemistry', Bicarbonate: 'Chemistry',
  Urea: 'Chemistry', Creatinine: 'Chemistry', Glucose: 'Chemistry', Calcium: 'Chemistry',
  Troponin: 'Cardiac Markers', 'CK-MB': 'Cardiac Markers', BNP: 'Cardiac Markers',
  'D-Dimer': 'Coagulation', INR: 'Coagulation',
  HbA1c: 'Diabetes', AST: 'Liver', ALT: 'Liver', TSH: 'Thyroid',
  pH: 'ABG', PaCO2: 'ABG', PaO2: 'ABG', Lactate: 'ABG',
  ESR: 'Inflammatory / Infection', CRP: 'Inflammatory / Infection',
};

// Panel for one extracted test. Unknown tests go to Custom Lab, never to a
// fabricated panel name.
export function panelForTest(testName: string): string {
  const clean = String(testName || '').trim();
  if (TEST_PANELS[clean]) return TEST_PANELS[clean];
  const lower = clean.toLowerCase();
  for (const key of Object.keys(TEST_PANELS)) {
    if (key.toLowerCase() === lower) return TEST_PANELS[key];
  }
  return 'Custom Lab';
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
  const source = String(text || '');
  const rawLines = source.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  // Join split lines: a test name on one line with its numbers on the next
  // (common when Tesseract breaks "PCV" / "Basophils" rows in two).
  const lines: string[] = [];
  for (let i = 0; i < rawLines.length; i++) {
    let cur = rawLines[i];
    const norm = normalize(cur);
    const hasAlias = TEST_ALIASES.some((t) => t.aliases.some((a) => matchesAlias(norm, a)));
    if (hasAlias && !/\d/.test(cur) && i + 1 < rawLines.length) {
      cur = `${cur} ${rawLines[i + 1]}`;
      i++;
    }
    lines.push(cur);
  }

  for (const rawLine of lines) {
    const line = normalize(rawLine);
    if (!line) continue;
    if (HEADER_JUNK.some((junk) => line.includes(junk))) continue;

    // Longest alias wins so "total wbc" beats "wbc", "packed cell volume" beats "pcv".
    // Exact whole-word match first; single-word fuzzy (1-2 letters) only as
    // fallback, and still requires an explicit reference range below.
    let best: { name: string; alias: string; fuzzy: boolean } | null = null;
    for (const test of TEST_ALIASES) {
      for (const alias of test.aliases) {
        if (matchesAlias(line, alias) && (!best || (alias.length > best.alias.length && !best.fuzzy))) {
          best = { name: test.name, alias, fuzzy: false };
        }
      }
    }
    if (!best) {
      for (const test of TEST_ALIASES) {
        for (const alias of test.aliases) {
          if (fuzzyAlias(line, alias) && (!best || alias.length > best.alias.length)) {
            best = { name: test.name, alias, fuzzy: true };
          }
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
    // Never accept a result without an explicit reference range: a name plus
    // a stray number is how "MCH 20" and "Troponin 60" style errors slip in.
    if (!range) {
      notes.push(`${best.name} needs manual review: reference range could not be read.`);
      continue;
    }
    rest = rest.replace(range.raw, ' ');

    const numbers = [...rest.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter(Number.isFinite);
    if (!numbers.length) {
      notes.push(`${best.name} was detected but no value could be read.`);
      continue;
    }
    const value = numbers[0];
    // Decimal-point rescue: OCR often drops the dot in small ranges, reading
    // "4.5 - 5.5" as "450 - 550". When the value is small and the range is
    // ~100x larger, restore the decimals rather than storing a wrong range.
    let lo = range.lo;
    let hi = range.hi;
    let rangeFixed = false;
    if (value < 20 && lo >= 100 && lo / Math.max(value, 0.01) > 10) {
      lo = lo / 100;
      hi = hi / 100;
      rangeFixed = true;
    }
    if (rangeFixed) {
      notes.push(`${best.name} reference range decimal point restored (${range.raw} -> ${lo} - ${hi}); confirm manually.`);
    }
    const unit = extractUnit(rest);

    const hasLow = /\blow\b/.test(line) || /↓/.test(rawLine);
    const hasHigh = /\bhigh\b/.test(line) || /↑/.test(rawLine);
    const hasCritical = /\bcritical\b/.test(line);
    const hasBorderline = /\bborderline\b/.test(line);

    let status: ExtractedLabResult['status'] = 'unknown';
    if (hasCritical) status = 'critical';
    else if (hasHigh) status = 'high';
    else if (hasLow) status = 'low';
    else status = value < lo ? 'low' : value > hi ? 'high' : 'normal';
    if (hasBorderline) {
      status = 'unknown';
      notes.push(`${best.name} is borderline (${value}${unit ? ` ${unit}` : ''}); confirm manually.`);
    }
    if (best.fuzzy) {
      notes.push(`${best.name} name was read with minor letter errors; confirm the test name manually.`);
    }

    results.push({
      testName: best.name,
      value,
      unit,
      referenceRange: `${lo} - ${hi}`,
      status,
    });
  }

  return { results, notes, rawText: source };
}
