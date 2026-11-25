import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'assets', 'ocr-runtime');
const copy = async (from, to) => { await fs.mkdir(path.dirname(to), { recursive: true }); await fs.copyFile(from, to); };
const tess = path.join(root, 'node_modules', 'tesseract.js', 'dist');
const core = path.join(root, 'node_modules', 'tesseract.js-core');
await copy(path.join(tess, 'tesseract.min.js'), path.join(out, 'tesseract.min.js'));
await copy(path.join(tess, 'worker.min.js'), path.join(out, 'worker.min.js'));
for (const file of ['tesseract-core-simd-lstm.wasm.js','tesseract-core-simd-lstm.wasm','tesseract-core-lstm.wasm.js','tesseract-core-lstm.wasm']) {
  await copy(path.join(core, file), path.join(out, 'core', file));
}
for (const lang of ['fas','eng']) {
  const urls = [
    `https://cdn.jsdelivr.net/npm/@tesseract.js-data/${lang}@1.0.0/4.0.0_best_int/${lang}.traineddata.gz`,
    `https://unpkg.com/@tesseract.js-data/${lang}@1.0.0/4.0.0_best_int/${lang}.traineddata.gz`
  ];
  let saved = false;
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = new Uint8Array(await response.arrayBuffer());
      if (data.length < 50000 || data[0] !== 0x1f || data[1] !== 0x8b) throw new Error('Invalid GZIP language data');
      await fs.mkdir(path.join(out, 'lang'), { recursive: true });
      await fs.writeFile(path.join(out, 'lang', `${lang}.traineddata.gz`), data);
      saved = true;
      break;
    } catch (error) { console.warn(`Could not fetch ${lang} from ${url}: ${error.message}`); }
  }
  if (!saved) throw new Error(`Unable to download OCR language data: ${lang}`);
}
console.log('Bundled OCR runtime and fas/eng language data for Android.');
