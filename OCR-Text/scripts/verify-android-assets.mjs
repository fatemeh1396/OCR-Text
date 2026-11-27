import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv[2] || 'source';
const roots = {
  source: path.join(root, 'assets', 'ocr-runtime'),
  web: path.join(root, 'www', 'assets', 'ocr-runtime'),
  android: path.join(root, 'android', 'app', 'src', 'main', 'assets', 'public', 'assets', 'ocr-runtime')
};
const base = roots[stage];
if (!base) throw new Error(`Unknown verification stage: ${stage}`);

const files = [
  'tesseract.min.js',
  'worker.min.js',
  'core/tesseract-core-simd-lstm.wasm.js',
  'core/tesseract-core-simd-lstm.wasm',
  'core/tesseract-core-lstm.wasm.js',
  'core/tesseract-core-lstm.wasm',
  'lang/fas.traineddata.gz',
  'lang/eng.traineddata.gz'
];

for (const relative of files) {
  const full = path.join(base, relative);
  let data;
  try {
    data = await fs.readFile(full);
  } catch {
    throw new Error(`Missing required OCR asset (${stage}): ${relative}`);
  }
  const minimum = relative.endsWith('.traineddata.gz') ? 50000
    : relative.endsWith('.wasm') ? 500000
    : relative.endsWith('.js') ? 10000 : 1;
  if (data.length < minimum) {
    throw new Error(`OCR asset is unexpectedly small (${stage}): ${relative} (${data.length} bytes)`);
  }
  if (relative.endsWith('.traineddata.gz') && !(data[0] === 0x1f && data[1] === 0x8b)) {
    throw new Error(`Invalid GZIP language model (${stage}): ${relative}`);
  }
  console.log(`OK ${relative} (${data.length} bytes)`);
}
console.log(`All OCR assets verified at stage: ${stage}`);
