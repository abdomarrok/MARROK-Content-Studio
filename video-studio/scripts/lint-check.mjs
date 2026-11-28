import fs from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const execFileAsync = promisify(execFile);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const jsFiles = [
  'engine/paths.mjs',
  'engine/wav.mjs',
  'engine/schema.mjs',
  'engine/motion-sdk.js',
  'engine/audio-dsp.mjs',
  'engine/audio-vo.mjs',
  'engine/audio-mix.mjs',
  'engine/render-video.mjs',
  'engine/export-social.mjs',
  'engine/qa-inspect.mjs',
  'engine/build-pipeline.mjs',
  'scripts/new-project.mjs',
  'scripts/lint-check.mjs',
  'studio/expressRouter.mjs',
];

for (const rel of jsFiles) {
  await execFileAsync(process.execPath, ['--check', path.join(ROOT, rel)]);
}

const htmlFiles = [
  'templates/starter-project/scene.html',
];

try {
  const entries = await fs.readdir(path.join(ROOT, 'projects'), { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const rel = path.join('projects', entry.name, 'scene.html');
    try {
      await fs.access(path.join(ROOT, rel));
      htmlFiles.push(rel);
    } catch {
      // ignore
    }
  }
} catch {
  // projects dir missing
}

for (const rel of htmlFiles) {
  const html = await fs.readFile(path.join(ROOT, rel), 'utf8');
  const scriptRegex = /<script\b[^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  let count = 0;
  while ((match = scriptRegex.exec(html)) !== null) {
    const code = match[1].trim();
    if (!code) continue;
    new vm.Script(code, { filename: `${rel}#script-${++count}` });
  }
  if (count === 0) {
    throw new Error(`No inline <script> block found in ${rel}`);
  }
}

console.log(`Video Studio lint passed: ${jsFiles.length} JS modules and ${htmlFiles.length} HTML documents validated.`);
