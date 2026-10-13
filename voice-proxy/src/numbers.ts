// Digit helpers for the soft number post-check. Arabic-Indic digits ٠-٩
// are normalized to 0-9 before any comparison.
const ARABIC_INDIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function normalizeDigits(text: string): string {
  return text.replace(/[٠-٩]/g, (d) => String(ARABIC_INDIC_DIGITS.indexOf(d)));
}

export function extractNumbers(text: string): string[] {
  return normalizeDigits(text).match(/\d+(?:\.\d+)?/g) ?? [];
}

// Soft check only: every number in clean_english must also appear in
// raw_transcript. Returns warnings, never blocks.
export function numberPostCheck(rawTranscript: string, cleanEnglish: string): string[] {
  const spoken = new Set(extractNumbers(rawTranscript));
  const warnings: string[] = [];
  for (const n of extractNumbers(cleanEnglish)) {
    if (!spoken.has(n)) warnings.push(`number_not_in_transcript:${n}`);
  }
  return warnings;
}
