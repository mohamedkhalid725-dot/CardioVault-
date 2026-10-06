const normalizeExaminationText = (value: string): string =>
  value.replace(/^[•·▪◦*-]\s*/, '').replace(/\s+/g, ' ').trim();

const isLabelOnlyTemplate = (value: string): boolean => {
  const text = normalizeExaminationText(value);
  if (!text || /^\(\s*\)$/.test(text)) return true;
  return /^[^:]{1,120}:\s*$/.test(text);
};

export function hasMeaningfulExaminationContent(value: unknown): boolean {
  if (value === null || value === undefined || value === false) return false;
  if (typeof value === 'string') {
    const text = normalizeExaminationText(value);
    return text.length > 0 && !isLabelOnlyTemplate(text);
  }
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value === 'boolean') return value;
  if (Array.isArray(value)) return value.some((item) => hasMeaningfulExaminationContent(item));
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, unknown>).some(([key, child]) => {
      if (key === 'customFields' && Array.isArray(child)) {
        return child.some((field) => field && typeof field === 'object'
          ? hasMeaningfulExaminationContent((field as Record<string, unknown>).value)
          : false);
      }
      return hasMeaningfulExaminationContent(child);
    });
  }
  return false;
}

export function meaningfulExaminationText(value: unknown): string {
  if (!hasMeaningfulExaminationContent(value)) return '';
  return typeof value === 'string' ? normalizeExaminationText(value) : String(value);
}
