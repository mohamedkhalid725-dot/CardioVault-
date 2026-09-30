import { GoogleGenAI } from '@google/genai';

export function getGenAI() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error('AI service is not configured.');
  return new GoogleGenAI({ apiKey: key });
}

export function parseModelJson(raw: string): any {
  const cleaned = String(raw || '')
    .trim()
    .replace(/^\`\`\`(?:json)?\s*/i, '')
    .replace(/\s*\`\`\`$/i, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch {
    const start = cleaned.indexOf('{');
    const end = cleaned.lastIndexOf('}');
    if (start >= 0 && end > start) return JSON.parse(cleaned.slice(start, end + 1));
    throw new Error('AI returned invalid structured data.');
  }
}
