import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'www');
await fs.rm(out, { recursive: true, force: true });
await fs.mkdir(out, { recursive: true });
for (const name of ['index.html','style.css','app.js','manifest.webmanifest','assets']) {
  await fs.cp(path.join(root,name), path.join(out,name), { recursive: true });
}
console.log('Web application staged in www/.');
