import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const repository = 'Lailloken/Exile-UI';
const outputDir = path.resolve('assets/campaign');
const headers = { 'User-Agent': 'ExileQuesting-importer (github.com/Stoffe101/ExileQuesting)' };

async function request(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response;
}

async function writeAtomic(filePath, value) {
  const temporary = `${filePath}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
  await rename(temporary, filePath);
}

function validate(guide, areas) {
  if (!Array.isArray(guide) || guide.length !== 10) throw new Error(`Expected 10 acts; received ${guide?.length ?? 'invalid'}.`);
  const steps = guide.reduce((total, act) => total + (Array.isArray(act) ? act.length : 0), 0);
  const areaCount = Array.isArray(areas) ? areas.flat().length : 0;
  if (steps < 180) throw new Error(`Expected at least 180 steps; received ${steps}.`);
  if (areaCount < 140) throw new Error(`Expected at least 140 areas; received ${areaCount}.`);
  for (const [actIndex, act] of guide.entries()) {
    if (!Array.isArray(act)) throw new Error(`Act ${actIndex + 1} is malformed.`);
    for (const step of act) {
      const lines = Array.isArray(step) ? step : step?.lines;
      if (!Array.isArray(lines) || !lines.every((line) => typeof line === 'string')) throw new Error(`Act ${actIndex + 1} has a malformed step.`);
    }
  }
  return { acts: guide.length, steps, areas: areaCount };
}

const requestedRef = process.argv[2] || 'main';
const commit = await (await request(`https://api.github.com/repos/${repository}/commits/${requestedRef}`)).json();
const guidePath = 'data/english/[leveltracker] default guide.json';
const areasPath = 'data/english/[leveltracker] areas.json';
const rawUrl = (file) => `https://raw.githubusercontent.com/${repository}/${commit.sha}/${file.split('/').map(encodeURIComponent).join('/')}`;
const [guide, areas] = await Promise.all([
  request(rawUrl(guidePath)).then((response) => response.json()),
  request(rawUrl(areasPath)).then((response) => response.json()),
]);
const metrics = validate(guide, areas);

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeAtomic(path.join(outputDir, 'guide.json'), guide),
  writeAtomic(path.join(outputDir, 'areas.json'), areas),
  writeAtomic(path.join(outputDir, 'manifest.json'), {
    schemaVersion: 1,
    repository,
    commit: commit.sha,
    fetchedAt: new Date().toISOString(),
    files: { guide: guidePath, areas: areasPath },
    license: 'MIT',
    validation: metrics,
  }),
]);

const annotations = JSON.parse(await readFile(path.join(outputDir, 'annotations.json'), 'utf8'));
console.log(`Imported ${metrics.steps} steps and ${metrics.areas} areas from ${commit.sha}. ${annotations.length} semantic annotations remain available for matching.`);

