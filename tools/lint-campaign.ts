import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { looksUnhumanized } from '../src/core/actions';
import { normalizeCampaign, validateCampaign } from '../src/core/campaign';
import { validateLayoutHints } from '../src/core/layouts';
import type { GuidanceAnnotation, LayoutHint, RawAreas, RawGuide } from '../src/core/types';

const root = process.cwd();
async function json<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, 'assets', 'campaign', name), 'utf8')) as T;
}

const [guide, areas, annotations, layoutInput, manifest] = await Promise.all([
  json<RawGuide>('guide.json'),
  json<RawAreas>('areas.json'),
  json<GuidanceAnnotation[]>('annotations.json'),
  json<unknown>('layouts.json'),
  json<{ commit: string; fetchedAt: string }>('manifest.json'),
]);
const validation = validateCampaign(guide, areas);
const layouts = validateLayoutHints(layoutInput);
const dataset = normalizeCampaign(guide, areas, annotations, {
  repository: 'Lailloken/Exile-UI', commit: manifest.commit, fetchedAt: manifest.fetchedAt, license: 'MIT',
}, layouts as LayoutHint[]);

const errors: string[] = [...validation.errors];
const warnings: string[] = [...validation.warnings];
const stepIds = new Set<string>();
const knownAreas = new Set(dataset.areas.map((area) => area.id));
const areaIds = new Set<string>();

for (const area of dataset.areas) {
  if (areaIds.has(area.id)) errors.push(`Duplicate area ID: ${area.id}`);
  areaIds.add(area.id);
  if (!area.name?.trim()) errors.push(`Area ${area.id} has no readable name.`);
}

let previousAct = 1;
for (const [index, step] of dataset.steps.entries()) {
  if (stepIds.has(step.id)) errors.push(`Duplicate semantic step ID: ${step.id}`);
  stepIds.add(step.id);
  if (step.act < previousAct || step.act > previousAct + 1) errors.push(`Impossible act transition near page ${index + 1}: Act ${previousAct} -> ${step.act}.`);
  previousAct = step.act;
  if (step.targetAreaId && !knownAreas.has(step.targetAreaId)) errors.push(`Page ${index + 1} targets unknown area ${step.targetAreaId}.`);
  if (!step.actions.some((action) => action.priority !== 'context')) errors.push(`Page ${index + 1} has no decisive semantic action.`);
  const actionIds = new Set<string>();
  for (const action of step.actions) {
    if (actionIds.has(action.id)) errors.push(`Page ${index + 1} has duplicate action ID ${action.id}.`);
    actionIds.add(action.id);
    if (!action.title.trim()) errors.push(`Page ${index + 1} has an empty action title.`);
    if (action.priority !== 'context' && looksUnhumanized(action.title)) errors.push(`Page ${index + 1} leaks upstream token syntax into ${action.priority.toUpperCase()} action: ${action.title}`);
  }
  if (step.permanentReward && !step.tags.includes(step.permanentReward)) errors.push(`Permanent ${step.permanentReward} page ${index + 1} is missing its matching tag.`);
}

const selectorKeys = new Set<string>();
for (const [index, annotation] of annotations.entries()) {
  const selector = annotation.selector;
  const key = JSON.stringify(selector);
  if (selectorKeys.has(key)) warnings.push(`Duplicate guidance selector #${index + 1}: ${key}`);
  selectorKeys.add(key);
  if (!selector.areaId && !(selector.contains?.length)) errors.push(`Guidance selector #${index + 1} is too broad; it has neither areaId nor contains terms.`);
  if (selector.areaId && !knownAreas.has(selector.areaId)) errors.push(`Guidance selector #${index + 1} references unknown area ${selector.areaId}.`);
}

for (const hint of layouts) {
  if (!knownAreas.has(hint.areaId)) errors.push(`Layout hint references unknown area ${hint.areaId}.`);
  if (!hint.text.trim()) errors.push(`Layout hint for ${hint.areaId} is empty.`);
}

console.log(`# Campaign semantic lint\n\n- Steps: ${dataset.steps.length}\n- Areas: ${dataset.areas.length}\n- Guidance selectors: ${annotations.length}\n- Layout hints: ${layouts.length}\n- Errors: ${errors.length}\n- Warnings: ${warnings.length}`);
if (warnings.length) console.log(`\nWarnings:\n- ${warnings.join('\n- ')}`);
if (errors.length) {
  console.error(`\nErrors:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
}
