import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const guide = JSON.parse(await readFile(path.join(root, 'assets/campaign/guide.json'), 'utf8'));
const annotations = JSON.parse(await readFile(path.join(root, 'assets/campaign/annotations.json'), 'utf8'));

function linesFor(step) {
  return Array.isArray(step) ? step : step.lines;
}

function areaIds(lines) {
  return [...lines.join(' ').matchAll(/areaid([\w_]+)/gi)].map((match) => match[1]);
}

function annotationMatchIndex(act, lines) {
  const ids = areaIds(lines);
  const haystack = lines.join(' ').toLowerCase();
  return annotations.findIndex(({ selector }) => selector.act === act
    && (!selector.areaId || ids.includes(selector.areaId))
    && (selector.contains ?? []).every((part) => haystack.includes(part.toLowerCase())));
}

function actionKind(line) {
  const text = line.toLowerCase();
  if (/\bkill\b|arena:/.test(text)) return 'kill';
  if (/\brelog\b/.test(text)) return 'relog';
  if (/waypoint/.test(text)) return 'waypoint';
  if (/\(img:lab\)|\btrial\b/.test(text)) return 'trial';
  if (/quest:book|book_of_skill/.test(text)) return 'passive';
  if (/\(quest:|\bquest\s/.test(text)) return 'quest';
  if (/\b(?:take|collect|grab|pick up|obtain)\b/.test(text)) return 'collect';
  if (/\b(?:enter|go to|continue to|travel to|head to)\b|areaid/.test(text)) return 'travel';
  if (/buy_gems|\bbuy\b.*gem/.test(text)) return 'gem';
  if (/\(img:craft\)/.test(text)) return 'craft';
  if (/\(hint\)|tip:|follow|side of|road|stream|shore/.test(text)) return 'context';
  return 'unknown';
}

const matchedAnnotationIndexes = new Set();
const rows = [];
for (let actIndex = 0; actIndex < guide.length; actIndex += 1) {
  const act = actIndex + 1;
  for (let index = 0; index < guide[actIndex].length; index += 1) {
    const lines = linesFor(guide[actIndex][index]);
    const kinds = lines.map(actionKind);
    const annotationIndex = annotationMatchIndex(act, lines);
    if (annotationIndex >= 0) matchedAnnotationIndexes.add(annotationIndex);
    const annotation = annotationIndex >= 0 ? annotations[annotationIndex] : undefined;
    rows.push({
      act,
      step: index + 1,
      kinds,
      structured: kinds.some((kind) => kind !== 'unknown' && kind !== 'context'),
      contextOnly: kinds.every((kind) => kind === 'context' || kind === 'unknown'),
      annotation: Boolean(annotation),
      warning: Boolean(annotation?.warning),
      suspicious: lines.filter((line) => /\bquest\s+[a-z]+:|\b[a-z]+_[a-z]+\b/i.test(line)).length,
    });
  }
}

const unmatchedAnnotations = annotations
  .map((annotation, index) => ({ annotation, index }))
  .filter(({ index }) => !matchedAnnotationIndexes.has(index));

const byAct = Array.from({ length: 10 }, (_, i) => i + 1).map((act) => {
  const actRows = rows.filter((row) => row.act === act);
  return {
    act,
    steps: actRows.length,
    structured: actRows.filter((row) => row.structured).length,
    contextOnly: actRows.filter((row) => row.contextOnly).length,
    annotations: actRows.filter((row) => row.annotation).length,
    warnings: actRows.filter((row) => row.warning).length,
  };
});

const total = rows.length;
const structured = rows.filter((row) => row.structured).length;
const contextOnly = rows.filter((row) => row.contextOnly).length;
const annotated = rows.filter((row) => row.annotation).length;
const warnings = rows.filter((row) => row.warning).length;
const suspicious = rows.reduce((sum, row) => sum + row.suspicious, 0);

const report = [
  '# Campaign content audit',
  '',
  `Generated: ${new Date().toISOString()}`,
  '',
  `- Route pages: **${total}**`,
  `- Pages with at least one decisive structured-action signal: **${structured}/${total}**`,
  `- Context-only / manual-review candidates: **${contextOnly}**`,
  `- Pages with bespoke guidance annotations: **${annotated}**`,
  `- Guidance selectors currently unmatched/stale: **${unmatchedAnnotations.length}/${annotations.length}**`,
  `- Pages with explicit warning copy: **${warnings}**`,
  `- Raw source lines containing upstream token/jargon patterns: **${suspicious}** (expected in source data; these must not leak into Focus UI)`,
  '',
  '| Act | Pages | Structured | Context-only | Annotated | Warnings |',
  '|---:|---:|---:|---:|---:|---:|',
  ...byAct.map((row) => `| ${row.act} | ${row.steps} | ${row.structured} | ${row.contextOnly} | ${row.annotations} | ${row.warnings} |`),
  '',
  '## Unmatched guidance selectors',
  '',
  ...(unmatchedAnnotations.length
    ? unmatchedAnnotations.map(({ annotation, index }) => `- #${index + 1}: \`${JSON.stringify(annotation.selector)}\` — ${annotation.title ?? annotation.summary ?? 'untitled guidance'}`)
    : ['All guidance selectors match at least one bundled route page.']),
  '',
  '## Review rule',
  '',
  'Context-only pages are not automatically wrong. Directional/layout clues intentionally remain context so a wall-following hint cannot outrank a decisive kill/travel objective. Review these pages manually when expanding the guidance layer.',
  '',
].join('\n');

const target = path.join(root, 'docs/CAMPAIGN_AUDIT.md');
await writeFile(target, report, 'utf8');
console.log(report);

const failures = [];
if (structured !== total) failures.push(`${total - structured} route page(s) lost decisive structured-action coverage.`);
if (unmatchedAnnotations.length) failures.push(`${unmatchedAnnotations.length} bespoke guidance selector(s) are stale/unmatched.`);
if (failures.length) {
  console.error(`\nCampaign audit failed:\n- ${failures.join('\n- ')}`);
  process.exitCode = 1;
}
