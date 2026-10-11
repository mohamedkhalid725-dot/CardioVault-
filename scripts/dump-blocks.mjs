// Temporary evidence tool (deleted before merge): dumps Tesseract word
// geometry + confidence for fixture lab images to pin parser thresholds.
// Usage: node scripts/dump-blocks.mjs test/fixtures/<image>
import { createWorker } from 'tesseract.js';
import { readFile } from 'node:fs/promises';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/dump-blocks.mjs <image>');
  process.exit(1);
}
const worker = await createWorker('eng');
try {
  const buffer = await readFile(file);
  const blob = new Blob([buffer]);
  const { data } = await worker.recognize(blob, {}, { blocks: true });
  const words = [];
  for (const block of data.blocks || []) {
    for (const para of block.paragraphs || []) {
      for (const line of para.lines || []) {
        for (const word of line.words || []) {
          words.push(word);
        }
      }
    }
  }
  console.log(`IMAGE: ${file}`);
  console.log(`WORDS: ${words.length}`);
  const confs = words.map((w) => w.confidence ?? -1).filter((c) => c >= 0).sort((a, b) => a - b);
  const pct = (p) => (confs.length ? confs[Math.min(confs.length - 1, Math.floor(p * confs.length))] : -1);
  console.log(`CONF p10=${pct(0.1)} p25=${pct(0.25)} p50=${pct(0.5)} p75=${pct(0.75)}`);
  const low = words.filter((w) => (w.confidence ?? 100) < 60);
  console.log(`LOW_CONF(<60): ${low.length}`);
  for (const w of low.slice(0, 30)) {
    console.log(`  [${w.confidence}] "${w.text}" bbox=${JSON.stringify(w.bbox)}`);
  }
  const nums = words.filter((w) => /^-?\d+(\.\d+)?$/.test(w.text || ''));
  console.log(`NUMERIC_WORDS: ${nums.length}`);
  for (const w of nums.slice(0, 40)) {
    console.log(`  [${w.confidence}] "${w.text}" bbox=${JSON.stringify(w.bbox)}`);
  }
} finally {
  await worker.terminate();
}
