import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { assertValidProjectId, getProjectPaths, parseCliArgs, TEMPLATES_DIR } from '../engine/paths.mjs';
import { validateProjectConfig } from '../engine/schema.mjs';

function toTitleCase(slug) {
  return slug
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

/**
 * Scaffold a new video project under projects/<id>/ from templates/starter-project/.
 */
export async function createProjectFromTemplate({ id, name, durationSec }) {
  assertValidProjectId(id);
  const paths = getProjectPaths(id);

  try {
    await fs.access(paths.root);
    const err = new Error(`Project "${id}" already exists at ${paths.root}`);
    err.statusCode = 409;
    throw err;
  } catch (error) {
    if (error?.code !== 'ENOENT') throw error;
  }

  const templateDir = path.join(TEMPLATES_DIR, 'starter-project');
  const rawConfig = JSON.parse(await fs.readFile(path.join(templateDir, 'project.json'), 'utf8'));
  rawConfig.id = id;
  rawConfig.name = (name && String(name).trim()) || toTitleCase(id);

  if (durationSec !== undefined && durationSec !== null && durationSec !== '') {
    const dur = Number(durationSec);
    if (!Number.isFinite(dur) || dur <= 1) {
      throw new Error(`Invalid duration "${durationSec}". Must be > 1 second.`);
    }
    const scale = dur / rawConfig.video.durationSec;
    rawConfig.video.durationSec = dur;
    if (rawConfig.music) {
      rawConfig.music.fadeOutStartSec = Number(Math.max(0, dur - rawConfig.music.fadeOutDurationSec).toFixed(2));
      if (rawConfig.music.swellAtSec !== undefined) {
        rawConfig.music.swellAtSec = Number((dur * 0.62).toFixed(2));
      }
    }
    for (const act of rawConfig.acts || []) {
      act.startSec = Number((act.startSec * scale).toFixed(2));
      act.maxDurationSec = Number(Math.max(0.8, act.maxDurationSec * scale).toFixed(2));
    }
    for (const sfx of rawConfig.sfx || []) {
      sfx.atSec = Number(Math.min(dur - 0.1, sfx.atSec * scale).toFixed(2));
    }
  }

  const validated = validateProjectConfig(rawConfig, id);

  await fs.mkdir(paths.assetsDir, { recursive: true });
  await fs.mkdir(paths.audioDir, { recursive: true });
  await fs.mkdir(paths.outputDir, { recursive: true });
  await fs.writeFile(paths.configPath, JSON.stringify(validated, null, 2) + '\n', 'utf8');

  let sceneHtml = await fs.readFile(path.join(templateDir, 'scene.html'), 'utf8');
  sceneHtml = sceneHtml.replace('<title>Starter Project — Motion Stage</title>', `<title>${validated.name} — Motion Stage</title>`);
  if (validated.video.durationSec !== 15) {
    sceneHtml = sceneHtml.replace('const DURATION = 15;', `const DURATION = ${validated.video.durationSec};`);
    sceneHtml = sceneHtml.replace('max="15"', `max="${validated.video.durationSec}"`);
    sceneHtml = sceneHtml.replace('00.00s / 15.00s', `00.00s / ${validated.video.durationSec.toFixed(2)}s`);
  }
  await fs.writeFile(paths.scenePath, sceneHtml, 'utf8');

  return { config: validated, paths };
}

const isEntryPoint =
  process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href;

if (isEntryPoint) {
  (async () => {
    const { flags, positionals } = parseCliArgs(process.argv.slice(2));
    const id = String(flags.id || flags.project || positionals[0] || '').trim();
    if (!id) {
      throw new Error('Usage: npm run new-project -- <id> [--name "Project Name"] [--duration 15]');
    }
    const { config, paths } = await createProjectFromTemplate({
      id,
      name: flags.name ? String(flags.name) : undefined,
      durationSec: flags.duration !== undefined ? Number(flags.duration) : undefined,
    });
    console.log(`Created project "${config.id}" at ${paths.root}`);
    console.log(`Next steps:\n  1. Edit ${path.relative(process.cwd(), paths.configPath)} and ${path.relative(process.cwd(), paths.scenePath)}`);
    console.log(`  2. npm run audio -- --project ${config.id}`);
    console.log(`  3. npm run build-video -- --project ${config.id} --vertical`);
  })().catch((err) => {
    console.error(`Error: ${err.message}`);
    process.exitCode = 1;
  });
}
