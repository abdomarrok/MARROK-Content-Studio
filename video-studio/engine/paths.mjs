import { execFile } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const VIDEO_STUDIO_ROOT = path.resolve(__dirname, '..');
export const REPO_ROOT = path.resolve(VIDEO_STUDIO_ROOT, '..');
export const ENGINE_DIR = path.join(VIDEO_STUDIO_ROOT, 'engine');
export const TEMPLATES_DIR = path.join(VIDEO_STUDIO_ROOT, 'templates');
export const PROJECTS_DIR = path.join(VIDEO_STUDIO_ROOT, 'projects');
export const STUDIO_DIR = path.join(VIDEO_STUDIO_ROOT, 'studio');

export const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.jfif': 'image/jpeg',
  '.webp': 'image/webp',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.woff2': 'font/woff2',
};

export function toTitleCaseSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

const PROJECT_ID_RE = /^[a-z0-9][a-z0-9-]{0,62}$/;

export function isValidProjectId(id) {
  return typeof id === 'string' && PROJECT_ID_RE.test(id);
}

export function assertValidProjectId(id) {
  if (!isValidProjectId(id)) {
    const err = new Error(
      `Invalid project id "${id}". Use lowercase alphanumeric characters and hyphens only (e.g. "marrok-brand-film").`
    );
    err.statusCode = 400;
    throw err;
  }
  return id;
}

/**
 * Resolve a relative path strictly inside a project root, throwing on traversal.
 */
export function resolveProjectRelative(projectRoot, relPath) {
  if (typeof relPath !== 'string' || !relPath.trim()) {
    const err = new Error('Expected a non-empty relative path.');
    err.statusCode = 400;
    throw err;
  }
  if (path.isAbsolute(relPath)) {
    const err = new Error(`Path must be relative to the project folder, got absolute path: ${relPath}`);
    err.statusCode = 400;
    throw err;
  }
  const normalizedRoot = path.resolve(projectRoot);
  const resolved = path.resolve(normalizedRoot, relPath);
  if (resolved !== normalizedRoot && !resolved.startsWith(normalizedRoot + path.sep)) {
    const err = new Error(`Path escapes project directory: ${relPath}`);
    err.statusCode = 400;
    throw err;
  }
  return resolved;
}

export function getProjectPaths(id) {
  assertValidProjectId(id);
  const root = path.join(PROJECTS_DIR, id);
  const audioDir = path.join(root, 'audio');
  const outputDir = path.join(root, 'output');
  return {
    id,
    root,
    configPath: path.join(root, 'project.json'),
    scenePath: path.join(root, 'scene.html'),
    assetsDir: path.join(root, 'assets'),
    audioDir,
    outputDir,
    cacheManifestPath: path.join(audioDir, '.cache-manifest.json'),
    masterWavPath: path.join(audioDir, 'master.wav'),
    silentMp4Path: path.join(outputDir, 'silent.mp4'),
    silentFastMp4Path: path.join(outputDir, 'silent-fast.mp4'),
    final16x9Path: path.join(outputDir, 'final-16x9.mp4'),
    final9x16Path: path.join(outputDir, 'final-9x16.mp4'),
    qaSheetPath: path.join(outputDir, 'qa-sheet.png'),
    qaReportPath: path.join(outputDir, 'qa-report.json'),
  };
}

export async function listProjectIds() {
  let entries;
  try {
    entries = await fs.readdir(PROJECTS_DIR, { withFileTypes: true });
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw error;
  }

  const ids = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !isValidProjectId(entry.name)) continue;
    try {
      await fs.access(path.join(PROJECTS_DIR, entry.name, 'project.json'));
      ids.push(entry.name);
    } catch {
      // Ignore directories without project.json
    }
  }
  return ids.sort();
}

export function parseDotEnv(content) {
  const vars = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const normalized = line.startsWith('export ') ? line.slice(7).trim() : line;
    const eqIndex = normalized.indexOf('=');
    if (eqIndex <= 0) continue;

    const key = normalized.slice(0, eqIndex).trim();
    let value = normalized.slice(eqIndex + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    vars[key] = value;
  }
  return vars;
}

export async function loadEnv() {
  const merged = {};
  for (const envPath of [path.join(VIDEO_STUDIO_ROOT, '.env'), path.join(REPO_ROOT, '.env')]) {
    try {
      const content = await fs.readFile(envPath, 'utf8');
      Object.assign(merged, parseDotEnv(content));
    } catch (error) {
      if (error?.code !== 'ENOENT') {
        throw new Error(`Failed to read ${envPath}: ${error.message}`);
      }
    }
  }

  for (const [k, v] of Object.entries(process.env)) {
    if (typeof v === 'string' && v.trim() !== '') {
      merged[k] = v;
    }
  }
  return merged;
}

async function findExecutableRecursive(dir, targetName, maxDepth = 4) {
  if (maxDepth < 0) return null;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    return null;
  }

  for (const entry of entries) {
    if (entry.isFile() && entry.name.toLowerCase() === targetName.toLowerCase()) {
      return path.join(dir, entry.name);
    }
  }

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const found = await findExecutableRecursive(path.join(dir, entry.name), targetName, maxDepth - 1);
    if (found) return found;
  }

  return null;
}

async function findWingetFfmpegBinDir() {
  const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
  const packagesDir = path.join(localAppData, 'Microsoft', 'WinGet', 'Packages');
  let entries;
  try {
    entries = await fs.readdir(packagesDir, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = entries.filter(
    (entry) => entry.isDirectory() && entry.name.toLowerCase().includes('ffmpeg')
  );

  for (const pkg of candidates) {
    const exePath = await findExecutableRecursive(path.join(packagesDir, pkg.name), 'ffmpeg.exe', 4);
    if (exePath) {
      return path.dirname(exePath);
    }
  }
  return null;
}

let cachedFfmpegResult = null;

/**
 * Locate ffmpeg and ffprobe (checking PATH first, then WinGet's Gyan.FFmpeg packages)
 * and prepend the bin directory to PATH when needed.
 */
export async function resolveFfmpegBinaries() {
  if (cachedFfmpegResult) return cachedFfmpegResult;

  const checkBoth = async () => {
    try {
      await execFileAsync('ffmpeg', ['-version']);
      await execFileAsync('ffprobe', ['-version']);
      return true;
    } catch {
      return false;
    }
  };

  if (await checkBoth()) {
    cachedFfmpegResult = { ffmpeg: 'ffmpeg', ffprobe: 'ffprobe', binDir: null };
    return cachedFfmpegResult;
  }

  const wingetBin = await findWingetFfmpegBinDir();
  if (wingetBin) {
    const currentPath = process.env.PATH || '';
    const segments = currentPath.split(path.delimiter).map((s) => s.toLowerCase());
    if (!segments.includes(wingetBin.toLowerCase())) {
      process.env.PATH = currentPath ? `${wingetBin}${path.delimiter}${currentPath}` : wingetBin;
    }
    if (await checkBoth()) {
      cachedFfmpegResult = {
        ffmpeg: path.join(wingetBin, 'ffmpeg.exe'),
        ffprobe: path.join(wingetBin, 'ffprobe.exe'),
        binDir: wingetBin,
      };
      return cachedFfmpegResult;
    }
  }

  throw new Error(
    'FFmpeg and ffprobe are required on PATH or installed via WinGet (Gyan.FFmpeg). Neither was executable.'
  );
}

/**
 * Parse standard CLI flags (`--key value`, `--key=value`, boolean flags, and positionals).
 */
export function parseCliArgs(argv) {
  const flags = {};
  const positionals = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--') {
      positionals.push(...argv.slice(i + 1));
      break;
    }
    if (arg.startsWith('--')) {
      const eqIdx = arg.indexOf('=');
      if (eqIdx > 2) {
        const key = arg.slice(2, eqIdx);
        flags[key] = arg.slice(eqIdx + 1);
      } else {
        const key = arg.slice(2);
        const next = argv[i + 1];
        if (next !== undefined && !next.startsWith('--')) {
          flags[key] = next;
          i++;
        } else {
          flags[key] = true;
        }
      }
    } else {
      positionals.push(arg);
    }
  }

  return { flags, positionals };
}
