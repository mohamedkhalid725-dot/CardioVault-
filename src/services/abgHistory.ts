import type { ABGRecord } from '../types/clinical';

const isTimeOnly = (value: string): boolean => /^\d{1,2}:\d{2}(?::\d{2})?$/.test(value.trim());
const timeOnlyMinutes = (value: string): number => { const [hours, minutes] = value.trim().split(':').map(Number); return hours * 60 + minutes; };
export const formatAbgTimestamp = (timestamp: string): string => {
  const value = String(timestamp || '').trim();
  if (!value) return 'Date not recorded';
  if (isTimeOnly(value)) return value;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' }) : value;
};
export const parseExplicitNumber = (value: string): number | undefined => {
  if (!value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};
export const sortAbgRecords = (records: ABGRecord[]): ABGRecord[] =>
  records.map((record, index) => ({
    record, index, parsed: Date.parse(String(record.timestamp || '')),
    legacyMinutes: isTimeOnly(String(record.timestamp || '')) ? timeOnlyMinutes(String(record.timestamp)) : null,
  })).sort((a, b) => {
    const aHasDate = Number.isFinite(a.parsed), bHasDate = Number.isFinite(b.parsed);
    if (aHasDate && bHasDate) return b.parsed - a.parsed;
    if (!aHasDate && !bHasDate && a.legacyMinutes !== null && b.legacyMinutes !== null) return b.legacyMinutes - a.legacyMinutes;
    if (aHasDate !== bHasDate) return aHasDate ? -1 : 1;
    return a.index - b.index;
  }).map(({ record }) => record);
