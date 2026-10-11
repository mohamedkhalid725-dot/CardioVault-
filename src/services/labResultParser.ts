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
  { name: 'WBC', aliases: ['total wbc', 'wbc count', 'total leukocyte count', 'leukocyte count', 'leukocytes', 'leukocyte', 'leucocyte count', 'leucocytes', 'leucocyte', 'wbc', 'tlc', 'white blood cell'] },
  { name: 'Neutrophils', aliases: ['neutrophils', 'neutrophil'] },
  { name: 'Rod neutrophils', aliases: ['rod neutrophil', 'rod neutrophils', 'band neutrophil', 'band neutrophils'] },
  { name: 'Segmented neutrophils', aliases: ['segmented neutrophil', 'segmented neutrophils', 'seg neutrophil', 'polymorph'] },
  { name: 'Lymphocytes', aliases: ['lymphocytes', 'lymphocyte'] },
  { name: 'Eosinophils', aliases: ['eosinophils', 'eosinophil'] },
  { name: 'Monocytes', aliases: ['monocytes', 'monocyte'] },
  { name: 'Basophils', aliases: ['basophils', 'basophil'] },
  { name: 'Platelet Count', aliases: ['platelet count', 'platelet', 'plt'] },
  { name: 'MPV', aliases: ['mpv'] },
  { name: 'ESR', aliases: ['esr'] },
  { name: 'CRP', aliases: ['hs-crp', 'c-reactive protein', 'crp'] },
  { name: 'Sodium', aliases: ['sodium', 'na+'] },
  { name: 'Potassium', aliases: ['potassium', 'k+'] },
  { name: 'Chloride', aliases: ['chloride', 'cl-'] },
  { name: 'Bicarbonate', aliases: ['bicarbonate', 'hco3', 'co2', 'carbon dioxide'] },
  { name: 'Urea', aliases: ['urea', 'bun', 'blood urea nitrogen'] },
  { name: 'Creatinine', aliases: ['creatinine', 'serum creatinine', 'creat'] },
  { name: 'eGFR', aliases: ['egfr', 'gfr', 'estimated gfr'] },
  { name: 'Glucose', aliases: ['fasting glucose', 'random glucose', 'postprandial glucose', 'glucose', 'blood sugar', 'fbs', 'rbs', 'fbg', 'rbg'] },
  { name: 'Calcium', aliases: ['serum calcium', 'calcium'] },
  { name: 'Magnesium', aliases: ['magnesium'] },
  { name: 'Phosphate', aliases: ['phosphate', 'phosphorus', 'po4'] },
  { name: 'Uric Acid', aliases: ['uric acid', 'urate'] },
  { name: 'Total Protein', aliases: ['total protein', 'protein total'] },
  { name: 'Globulin', aliases: ['globulin'] },
  { name: 'Anion Gap', aliases: ['anion gap'] },
  { name: 'A/G Ratio', aliases: ['a/g ratio', 'albumin globulin ratio'] },
  { name: 'Osmolality', aliases: ['osmolality', 'serum osmolality', 'osm'] },
  { name: 'Albumin', aliases: ['albumin', 'serum albumin'] },
  { name: 'ALP', aliases: ['alkaline phosphatase', 'alk phos', 'alp'] },
  { name: 'Bilirubin', aliases: ['total bilirubin', 'bilirubin', 'tbili', 'bili'] },
  { name: 'Direct Bilirubin', aliases: ['direct bilirubin', 'conjugated bilirubin', 'dbili'] },
  { name: 'GGT', aliases: ['ggt', 'gamma gt', 'gamma-glutamyl', 'gamma glutamyl'] },
  { name: 'LDH', aliases: ['ldh', 'lactate dehydrogenase'] },
  { name: 'Troponin', aliases: ['hs troponin', 'troponin i', 'troponin t', 'troponin', 'ctni', 'ctnt'] },
  { name: 'CK', aliases: ['creatine kinase', 'creatine phosphokinase', 'cpk', 'ck'] },
  { name: 'Myoglobin', aliases: ['myoglobin'] },
  { name: 'CK-MB', aliases: ['ck-mb', 'ckmb'] },
  { name: 'BNP', aliases: ['nt-probnp', 'nt probnp', 'bnp'] },
  { name: 'D-Dimer', aliases: ['d-dimer', 'd dimer'] },
  { name: 'PT', aliases: ['prothrombin time', 'pt'] },
  { name: 'aPTT', aliases: ['partial thromboplastin time', 'aptt', 'aptt', 'ptt'] },
  { name: 'Fibrinogen', aliases: ['fibrinogen', 'fib'] },
  { name: 'Thrombin Time', aliases: ['thrombin time'] },
  { name: 'Bleeding Time', aliases: ['bleeding time'] },
  { name: 'Clotting Time', aliases: ['clotting time'] },
  { name: 'Protein C', aliases: ['protein c'] },
  { name: 'Protein S', aliases: ['protein s'] },
  { name: 'INR', aliases: ['inr'] },
  { name: 'HbA1c', aliases: ['hba1c', 'hb a1c', 'a1c'] },
  { name: 'Insulin', aliases: ['fasting insulin', 'insulin'] },
  { name: 'C-Peptide', aliases: ['c-peptide', 'c peptide', 'cpeptide'] },
  { name: 'Total Cholesterol', aliases: ['total cholesterol', 'cholesterol'] },
  { name: 'LDL', aliases: ['ldl cholesterol', 'ldl-c', 'ldl'] },
  { name: 'HDL', aliases: ['hdl cholesterol', 'hdl-c', 'hdl'] },
  { name: 'Triglycerides', aliases: ['triglycerides', 'triglyceride'] },
  { name: 'VLDL', aliases: ['vldl cholesterol', 'vldl'] },
  { name: 'Non-HDL', aliases: ['non-hdl', 'non hdl'] },
  { name: 'Lp(a)', aliases: ['lipoprotein a', 'lp(a)', 'lpa'] },
  { name: 'ApoB', aliases: ['apolipoprotein b', 'apob'] },
  { name: 'ApoA1', aliases: ['apolipoprotein a1', 'apoa1'] },
  { name: 'Serum Iron', aliases: ['serum iron', 'iron'] },
  { name: 'Ferritin', aliases: ['ferritin', 'serum ferritin'] },
  { name: 'TIBC', aliases: ['tibc', 'total iron binding'] },
  { name: 'UIBC', aliases: ['uibc'] },
  { name: 'Transferrin Saturation', aliases: ['transferrin saturation', 'tsat'] },
  { name: 'Vitamin B12', aliases: ['vitamin b12', 'cobalamin', 'b12'] },
  { name: 'Folate', aliases: ['folate', 'folic acid'] },
  { name: 'Vitamin D', aliases: ['25-oh vitamin d', '25 oh vitamin d', 'vitamin d'] },
  { name: 'Procalcitonin', aliases: ['procalcitonin'] },
  { name: 'Rheumatoid Factor', aliases: ['rheumatoid factor', 'ra factor'] },
  { name: 'ASO', aliases: ['antistreptolysin o', 'aso titre', 'aso'] },
  { name: 'ANA', aliases: ['antinuclear antibodies', 'antinuclear antibody', 'ana'] },
  { name: 'Base Excess', aliases: ['base excess'] },
  { name: 'O2 Saturation', aliases: ['oxygen saturation', 'o2 saturation', 'sao2', 'spo2'] },
  { name: 'PSA', aliases: ['prostate specific antigen', 'psa'] },
  { name: 'CEA', aliases: ['carcinoembryonic antigen', 'cea'] },
  { name: 'AFP', aliases: ['alpha fetoprotein', 'afp'] },
  { name: 'CA-125', aliases: ['ca-125', 'ca125'] },
  { name: 'CA19-9', aliases: ['ca19-9', 'ca 19-9'] },
  { name: 'AST', aliases: ['ast', 'sgot'] },
  { name: 'ALT', aliases: ['alt', 'sgpt'] },
  { name: 'TSH', aliases: ['tsh'] },
  { name: 'Free T4', aliases: ['free t4', 'ft4'] },
  { name: 'Free T3', aliases: ['free t3', 'ft3'] },
  { name: 'Total T4', aliases: ['total t4', 'thyroxine', 't4'] },
  { name: 'Total T3', aliases: ['total t3', 'triiodothyronine', 't3'] },
  { name: 'TPO Antibodies', aliases: ['anti-tpo', 'thyroid peroxidase', 'tpo'] },
  { name: 'TSI', aliases: ['thyroid stimulating immunoglobulin', 'tsi', 'trab'] },
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
  'differential',
];

const normalize = (s: string): string =>
  s
    .toLowerCase()
    // Join thousand separators first: "5,100" -> "5100" ( else it reads as 5 ).
    .replace(/(\d),(\d{3})(?!\d)/g, '$1$2')
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
  RDW: 'CBC', WBC: 'CBC', Neutrophils: 'CBC', 'Rod neutrophils': 'CBC', 'Segmented neutrophils': 'CBC', Lymphocytes: 'CBC', Eosinophils: 'CBC',
  Monocytes: 'CBC', Basophils: 'CBC', 'Platelet Count': 'CBC', MPV: 'CBC',
  Sodium: 'Chemistry', Potassium: 'Chemistry', Chloride: 'Chemistry', Bicarbonate: 'Chemistry',
  Urea: 'Chemistry', Creatinine: 'Chemistry', Glucose: 'Chemistry', Calcium: 'Chemistry',
  Troponin: 'Cardiac Markers', 'CK-MB': 'Cardiac Markers', BNP: 'Cardiac Markers',
  CK: 'Cardiac Markers', Myoglobin: 'Cardiac Markers',
  'D-Dimer': 'Coagulation', INR: 'Coagulation',
  PT: 'Coagulation', aPTT: 'Coagulation', Fibrinogen: 'Coagulation',
  'Thrombin Time': 'Coagulation', 'Bleeding Time': 'Coagulation',
  'Clotting Time': 'Coagulation', 'Protein C': 'Coagulation', 'Protein S': 'Coagulation',
  HbA1c: 'Diabetes', Insulin: 'Diabetes', 'C-Peptide': 'Diabetes',
  AST: 'Liver', ALT: 'Liver', Albumin: 'Liver', ALP: 'Liver', Bilirubin: 'Liver',
  'Direct Bilirubin': 'Liver', GGT: 'Liver', LDH: 'Liver',
  TSH: 'Thyroid', 'Free T4': 'Thyroid', 'Free T3': 'Thyroid', 'Total T4': 'Thyroid',
  'Total T3': 'Thyroid', 'TPO Antibodies': 'Thyroid', TSI: 'Thyroid',
  pH: 'ABG', PaCO2: 'ABG', PaO2: 'ABG', Lactate: 'ABG',
  'Base Excess': 'ABG', 'O2 Saturation': 'ABG',
  ESR: 'Inflammatory / Infection', CRP: 'Inflammatory / Infection',
  Procalcitonin: 'Inflammatory / Infection', 'Rheumatoid Factor': 'Inflammatory / Infection',
  ASO: 'Inflammatory / Infection', ANA: 'Inflammatory / Infection',
  eGFR: 'Chemistry', Magnesium: 'Chemistry', Phosphate: 'Chemistry', 'Uric Acid': 'Chemistry',
  'Total Protein': 'Chemistry', Globulin: 'Chemistry', 'Anion Gap': 'Chemistry',
  'A/G Ratio': 'Chemistry', Osmolality: 'Chemistry',
  'Total Cholesterol': 'Lipid Profile', LDL: 'Lipid Profile', HDL: 'Lipid Profile',
  Triglycerides: 'Lipid Profile', VLDL: 'Lipid Profile', 'Non-HDL': 'Lipid Profile',
  'Lp(a)': 'Lipid Profile', ApoB: 'Lipid Profile', ApoA1: 'Lipid Profile',
  'Serum Iron': 'Iron / Vitamins', Ferritin: 'Iron / Vitamins', TIBC: 'Iron / Vitamins',
  UIBC: 'Iron / Vitamins', 'Transferrin Saturation': 'Iron / Vitamins',
  'Vitamin B12': 'Iron / Vitamins', Folate: 'Iron / Vitamins', 'Vitamin D': 'Iron / Vitamins',
  PSA: 'Custom Lab', CEA: 'Custom Lab', AFP: 'Custom Lab', 'CA-125': 'Custom Lab', 'CA19-9': 'Custom Lab',
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

    // Rightmost alias wins: in "MEAN CELL HAEMOGLOBIN, MCH 30.0" the test
    // being reported is MCH (adjacent to the numbers), not the HAEMOGLOBIN
    // mentioned in the method prefix. Ties break toward the longest alias.
    // Exact whole-word match first; single-word fuzzy (1-2 letters) only as
    // fallback, and still requires an explicit reference range below.
    let best: { name: string; alias: string; fuzzy: boolean; end: number } | null = null;
    for (const test of TEST_ALIASES) {
      for (const alias of test.aliases) {
        const re = new RegExp(`(^|[^a-z0-9])${escapeRegExp(alias)}([^a-z0-9]|$)`, 'g');
        let m: RegExpExecArray | null;
        let end = -1;
        while ((m = re.exec(line)) !== null) end = m.index + m[0].length;
        if (end < 0) continue;
        if (!best || end > best.end || (end === best.end && alias.length > best.alias.length)) {
          best = { name: test.name, alias, fuzzy: false, end };
        }
      }
    }
    if (!best) {
      for (const test of TEST_ALIASES) {
        for (const alias of test.aliases) {
          if (fuzzyAlias(line, alias) && (!best || alias.length > best.alias.length)) {
            best = { name: test.name, alias, fuzzy: true, end: -1 };
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
    // Strip unit exponents (10^6/ml, 10^3/uL, 10%/ml, (10/uL)): OCR reads the
    // "10" inside them and the parser would otherwise take it as the value
    // (RBC/WBC/Platelets all showed value 10 from their units). A standalone
    // value of 10 is never touched — only marked exponent forms are removed.
    rest = rest
      .replace(/\b10\s*\^[^ ]*/gi, ' ')
      .replace(/\b10\s*[³²¹⁰-⁹]+\s*\/?\s*[a-zµμ]*\/?[a-zµμ]*/gi, ' ')
      .replace(/\b10\s*%\s*\/\s*[a-zµμ]+/gi, ' ')
      .replace(/\(\s*10\s*\/[^)]*\)/gi, ' ');

    const range = extractRange(rest);
    // Single-bound reference ("< 2" for Basophils): explicit in the source,
    // so it is kept with its bound instead of dropped to manual review.
    const boundMatch = !range ? rest.match(/<\s*(-?\d+(?:\.\d+)?)/) : null;
    // Never accept a result without an explicit reference range: a name plus
    // a stray number is how "MCH 20" and "Troponin 60" style errors slip in.
    if (!range && !boundMatch) {
      notes.push(`${best.name} needs manual review: reference range could not be read.`);
      continue;
    }
    if (range) rest = rest.replace(range.raw, ' ');

    const numbers = [...rest.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => Number(m[0])).filter(Number.isFinite);
    if (!numbers.length) {
      notes.push(`${best.name} was detected but no value could be read.`);
      continue;
    }
    const value = numbers[0];
    if (!range) {
      // Single-bound reference ("< 2" for Basophils): explicit in the source.
      const bound = Number(boundMatch?.[1]);
      if (!Number.isFinite(bound)) {
        notes.push(`${best.name} needs manual review: reference range could not be read.`);
        continue;
      }
      const unitB = extractUnit(rest);
      const bLow = /\blow\b/.test(line) || /↓/.test(rawLine);
      const bHigh = /\bhigh\b/.test(line) || /↑/.test(rawLine);
      const bCritical = /\bcritical\b/.test(line);
      let bStatus: ExtractedLabResult['status'] = value < bound ? 'normal' : 'high';
      if (bCritical) bStatus = 'critical';
      else if (bHigh) bStatus = 'high';
      else if (bLow) bStatus = 'low';
      if (best.fuzzy) {
        notes.push(`${best.name} name was read with minor letter errors; confirm the test name manually.`);
      }
      results.push({ testName: best.name, value, unit: unitB, referenceRange: `< ${bound}`, status: bStatus });
      continue;
    }
    // Decimal-point rescue: OCR often drops the dot in ranges, reading
    // "4.5 - 5.5" as "450 - 550". The fix applies ONLY when the corrected
    // range actually contains the value — otherwise a correct range like
    // Platelets 150-450 would be corrupted into 1.5-4.5.
    let lo = range.lo;
    let hi = range.hi;
    let rangeFixed = false;
    if (value < 20 && lo >= 10 && lo / Math.max(value, 0.01) > 5) {
      for (const divisor of [100, 10]) {
        if (lo < divisor) continue;
        const fixedLo = lo / divisor;
        const fixedHi = hi / divisor;
        if (value >= fixedLo && value <= fixedHi) {
          lo = fixedLo;
          hi = fixedHi;
          rangeFixed = true;
          break;
        }
      }
      if (rangeFixed) {
        notes.push(`${best.name} reference range decimal point restored (${range.raw} -> ${lo} - ${hi}); confirm manually.`);
      } else {
        notes.push(`${best.name} range (${range.raw}) looks too large next to value ${value} — probable lost decimal point; confirm manually.`);
      }
    }
    // Loud flag when a value sits far outside its range (Hemoglobin 74 vs
    // 11.5-13.5 means a lost decimal, 7.4). The value is kept as read —
    // never altered — but it must not pass silently.
    if (value > 3 * hi || (lo > 0 && value < lo / 3)) {
      notes.push(`${best.name} value ${value} is far outside ${lo} - ${hi} — check for a lost decimal point before saving.`);
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
