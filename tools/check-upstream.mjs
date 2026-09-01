import { appendFile, readFile } from 'node:fs/promises';
import crypto from 'node:crypto';

const root = new URL('../', import.meta.url);
const bundledManifest = JSON.parse(await readFile(new URL('../assets/campaign/manifest.json', import.meta.url), 'utf8'));
const compatibility = JSON.parse(await readFile(new URL('../assets/campaign/compatibility.json', import.meta.url), 'utf8'));
const currentGuide = JSON.parse(await readFile(new URL('../assets/campaign/guide.json', import.meta.url), 'utf8'));
const annotations = JSON.parse(await readFile(new URL('../assets/campaign/annotations.json', import.meta.url), 'utf8'));
const repository = compatibility.upstream.repository;
const headers = { 'User-Agent': 'ExileQuesting-upstream-monitor (github.com/Stoffe101/ExileQuesting)' };

async function request(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response;
}

function rawUrl(commit, file) {
  return `https://raw.githubusercontent.com/${repository}/${commit}/${file.split('/').map(encodeURIComponent).join('/')}`;
}

function linesFor(step) {
  return Array.isArray(step) ? step : step?.lines;
}

function validate(guide, areas) {
  const errors = [];
  if (!Array.isArray(guide) || guide.length !== 10) errors.push(`Expected 10 acts; received ${guide?.length ?? 'invalid'}.`);
  const steps = Array.isArray(guide) ? guide.reduce((sum, act) => sum + (Array.isArray(act) ? act.length : 0), 0) : 0;
  const areaCount = Array.isArray(areas) ? areas.flat().length : 0;
  if (steps < 180) errors.push(`Expected at least 180 steps; received ${steps}.`);
  if (areaCount < 140) errors.push(`Expected at least 140 areas; received ${areaCount}.`);
  for (const [actIndex, act] of (Array.isArray(guide) ? guide : []).entries()) {
    if (!Array.isArray(act)) { errors.push(`Act ${actIndex + 1} malformed.`); continue; }
    for (const step of act) {
      const lines = linesFor(step);
      if (!Array.isArray(lines) || !lines.every((line) => typeof line === 'string')) errors.push(`Act ${actIndex + 1} contains malformed route data.`);
    }
  }
  return { valid: errors.length === 0, errors, acts: Array.isArray(guide) ? guide.length : 0, steps, areas: areaCount };
}

function signature(step) {
  const lines = linesFor(step) ?? [];
  const condition = Array.isArray(step) ? null : step?.condition ?? null;
  return crypto.createHash('sha1').update(JSON.stringify({ lines, condition })).digest('hex').slice(0, 12);
}

function annotationMatches(guide) {
  let matched = 0;
  for (let actIndex = 0; actIndex < guide.length; actIndex += 1) {
    for (const step of guide[actIndex]) {
      const lines = linesFor(step) ?? [];
      const text = lines.join(' ').toLowerCase();
      const ids = [...text.matchAll(/areaid([\w_]+)/gi)].map((match) => match[1]);
      if (annotations.some(({ selector }) => selector.act === actIndex + 1
        && (!selector.areaId || ids.includes(selector.areaId))
        && (selector.contains ?? []).every((part) => text.includes(part.toLowerCase())))) matched += 1;
    }
  }
  return matched;
}

function diffGuide(before, after) {
  return Array.from({ length: 10 }, (_, index) => {
    const oldAct = before[index] ?? [];
    const newAct = after[index] ?? [];
    const oldSet = new Set(oldAct.map(signature));
    const newSet = new Set(newAct.map(signature));
    return {
      act: index + 1,
      before: oldAct.length,
      after: newAct.length,
      added: [...newSet].filter((value) => !oldSet.has(value)).length,
      removed: [...oldSet].filter((value) => !newSet.has(value)).length,
    };
  });
}

const latest = await request(`https://api.github.com/repos/${repository}/commits/main`).then((response) => response.json());
const changed = latest.sha !== bundledManifest.commit;
let validation = { valid: true, errors: [], acts: 10, steps: currentGuide.flat().length, areas: 0 };
let diff = Array.from({ length: 10 }, (_, index) => ({ act: index + 1, before: currentGuide[index].length, after: currentGuide[index].length, added: 0, removed: 0 }));
let annotationCount = annotationMatches(currentGuide);
let relevantChangedFiles = [];

if (changed) {
  const compare = await request(`https://api.github.com/repos/${repository}/compare/${bundledManifest.commit}...${latest.sha}`).then((response) => response.json());
  relevantChangedFiles = (compare.files ?? []).map((file) => file.filename).filter((file) =>
    file === compatibility.upstream.guidePath || file === compatibility.upstream.areasPath || /leveltracker|act.?tracker|areas\.json/i.test(file));

  const [newGuide, newAreas] = await Promise.all([
    request(rawUrl(latest.sha, compatibility.upstream.guidePath)).then((response) => response.json()),
    request(rawUrl(latest.sha, compatibility.upstream.areasPath)).then((response) => response.json()),
  ]);
  validation = validate(newGuide, newAreas);
  if (validation.valid) {
    diff = diffGuide(currentGuide, newGuide);
    annotationCount = annotationMatches(newGuide);
  }
}

const output = process.env.GITHUB_OUTPUT;
if (output) {
  await appendFile(output, [
    `changed=${changed}`,
    `latest=${latest.sha}`,
    `pinned=${bundledManifest.commit}`,
    `valid=${validation.valid}`,
    `relevant=${relevantChangedFiles.length}`,
    `annotations=${annotationCount}`,
    '',
  ].join('\n'), 'utf8');
}

const summary = [
  '# Exile-UI compatibility monitor',
  '',
  `- Pinned: \`${bundledManifest.commit}\``,
  `- Latest: \`${latest.sha}\``,
  `- Upstream changed: **${changed ? 'yes' : 'no'}**`,
  `- Relevant changed files: **${relevantChangedFiles.length}**`,
  `- Structural validation: **${validation.valid ? 'PASS' : 'FAIL'}**`,
  `- Semantic annotations still matching: **${annotationCount}**`,
  '',
  ...(relevantChangedFiles.length ? ['## Relevant files', '', ...relevantChangedFiles.map((file) => `- \`${file}\``), ''] : []),
  '## Campaign semantic diff',
  '',
  '| Act | Before | After | Added/changed | Removed/changed |',
  '|---:|---:|---:|---:|---:|',
  ...diff.map((row) => `| ${row.act} | ${row.before} | ${row.after} | ${row.added} | ${row.removed} |`),
  '',
  ...(validation.errors.length ? ['## Validation errors', '', ...validation.errors.map((error) => `- ${error}`), ''] : []),
  changed
    ? validation.valid
      ? 'The new data parses structurally, but it is **not trusted automatically**. Review route/annotation changes before advancing the bundled fallback.'
      : 'The new upstream data failed validation. The application must remain on its last-known-good dataset.'
    : 'The bundled fallback still matches upstream HEAD.',
  '',
].join('\n');

if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');
console.log(summary);
