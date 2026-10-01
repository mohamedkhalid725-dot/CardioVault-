import { getGenAI, parseModelJson } from '../_ai.js';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function isRetryable(error: any) {
  const code = Number(error?.status ?? error?.code ?? 0);
  const message = String(error?.message || '').toLowerCase();
  return code === 429 || code === 500 || code === 502 || code === 503 || code === 504 ||
    message.includes('unavailable') || message.includes('high demand') || message.includes('temporarily');
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const imageBase64 = typeof body?.imageBase64 === 'string' ? body.imageBase64 : '';
    const patientName = typeof body?.patientName === 'string' ? body.patientName : '';

    if (!imageBase64) return Response.json({ error: 'Lab report image is required.' }, { status: 400 });

    const match = imageBase64.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) return Response.json({ error: 'Unsupported lab image format.' }, { status: 400 });
    if (match[2].length > 14_000_000) return Response.json({ error: 'Lab report image is too large.' }, { status: 413 });

    const prompt = [
      'You are a laboratory report extraction assistant for CardioVault.',
      'Extract only values visibly present on the supplied laboratory report. Never guess missing digits or values.',
      'Detect the laboratory panel (CBC, Chemistry, Cardiac Markers, Coagulation, Lipid Profile, Diabetes, Liver, Thyroid, ABG, Electrolytes, Inflammatory / Infection, Iron / Vitamins, or Custom Lab).',
      'For every extracted test return testName, value, unit, referenceRange, status, confidence.',
      'Use the report-provided reference range when visible. If absent, leave referenceRange empty and use status unknown unless the report itself marks the result high/low/critical.',
      'Only use critical when the report explicitly marks a result critical or provides a critical flag/range. Do not invent critical thresholds.',
      'Extract report patient name and report date when visible.',
      'Compare the report patient name with the current patient name only to produce a mismatch warning; do not reject solely on minor spelling differences.',
      'Return JSON only with keys: panel, patientName, reportDate, tests, warnings.',
      'tests is an array of {testName,value,unit,referenceRange,status,confidence}. status must be normal|low|high|critical|unknown. confidence must be low|moderate|high.',
      'Current patient name: ' + patientName
    ].join('\n');

    const ai = getGenAI();
    // Lab extraction is a latency-sensitive OCR task: use the low-latency multimodal model first.\n    const models = ['gemini-3.5-flash-lite', 'gemini-3.8-flash'];
    let raw = '';
    const errors: string[] = [];

    for (const modelName of models) {
      let lastError: any = null;
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          const response = await ai.models.generateContent({
            model: modelName,
            contents: [{ role: 'user', parts: [{ text: prompt }, { inlineData: { mimeType: match[1], data: match[2] } }] }],
            config: { responseMimeType: 'application/json' },
          });
          raw = String(response.text || '').trim();
          if (raw) break;
        } catch (error: any) {
          lastError = error;
          if (!isRetryable(error) || attempt === 1) break;
          await sleep(700);
        }
      }
      if (raw) break;
      errors.push(modelName + ': ' + String(lastError?.message || lastError || 'empty response').slice(0, 240));
    }

    if (!raw) {
      console.error('Lab scan AI failed:', errors.join(' | '));
      return Response.json({ error: 'AI could not read the laboratory report. Please try again.' }, { status: 502 });
    }

    const parsed = parseModelJson(raw);
    const tests = Array.isArray(parsed?.tests) ? parsed.tests.map((t:any) => ({
      testName: String(t?.testName || ''),
      value: t?.value ?? '',
      unit: String(t?.unit || ''),
      referenceRange: String(t?.referenceRange || ''),
      status: ['normal','low','high','critical','unknown'].includes(t?.status) ? t.status : 'unknown',
      confidence: ['low','moderate','high'].includes(t?.confidence) ? t.confidence : 'moderate',
    })).filter((t:any) => t.testName && t.value !== '') : [];

    return Response.json({
      panel: String(parsed?.panel || 'Custom Lab'),
      patientName: String(parsed?.patientName || ''),
      reportDate: String(parsed?.reportDate || ''),
      tests,
      warnings: Array.isArray(parsed?.warnings) ? parsed.warnings.map(String).filter(Boolean) : [],
    });
  } catch (error: any) {
    console.error('Lab scan error:', error);
    return Response.json({ error: 'Laboratory scan failed. Please try again.' }, { status: 500 });
  }
}
