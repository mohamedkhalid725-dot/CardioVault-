import { jsPDF } from 'jspdf';

const ARABIC_RE = /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF]/;
const originalText = (jsPDF as any).API.text;

function drawArabicText(this: any, value: string | string[], x: number, y: number, options?: any, transform?: any) {
  const lines = Array.isArray(value) ? value.map(String) : String(value).split('\n');
  if (!lines.some(line => ARABIC_RE.test(line))) return originalText.call(this, value, x, y, options, transform);

  const fontSizePt = Number(this.internal?.getFontSize?.() || 10);
  const scale = 3;
  const pxPerPt = 96 / 72;
  const linePx = Math.max(18, Math.ceil(fontSizePt * pxPerPt * 1.35));
  const fontWeight = /bold/i.test(String(this.getFont?.().fontStyle || '')) ? '700' : '400';
  const fontFamily = 'Arial, Tahoma, sans-serif';
  const canvas = document.createElement('canvas');
  const measure = canvas.getContext('2d');
  if (!measure) return originalText.call(this, value, x, y, options, transform);
  measure.font = `${fontWeight} ${fontSizePt * pxPerPt}px ${fontFamily}`;
  const widths = lines.map(line => Math.ceil(measure.measureText(line).width) + 12);
  const widthPx = Math.max(32, Math.max(...widths));
  canvas.width = widthPx * scale;
  canvas.height = Math.max(1, lines.length * linePx * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) return originalText.call(this, value, x, y, options, transform);
  ctx.scale(scale, scale);
  ctx.font = `${fontWeight} ${fontSizePt * pxPerPt}px ${fontFamily}`;
  const color = this.getTextColor?.() || '#000000';
  const rgb = typeof color === 'string' && color.startsWith('#') ? color : '#000000';
  ctx.fillStyle = rgb;
  ctx.textBaseline = 'alphabetic';
  ctx.direction = 'rtl';
  ctx.textAlign = 'right';
  lines.forEach((line, index) => {
    ctx.fillText(line, widthPx - 4, linePx * (index + 1) - 3);
  });

  const widthMm = widthPx * 0.264583;
  const heightMm = (canvas.height / scale) * 0.264583;
  const topY = y - fontSizePt * 0.352778;
  this.addImage(canvas.toDataURL('image/png'), 'PNG', x, topY, widthMm, heightMm, undefined, 'FAST');
  return this;
}

(jsPDF as any).API.text = drawArabicText;
