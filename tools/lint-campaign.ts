import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { looksUnhumanized } from '../src/core/actions';
import { normalizeCampaign, validateCampaign } from '../src/core/campaign';
import { guideCalloutsForStep, labyrinthNameForStep } from '../src/core/guide-experience';
import { layoutAuditStatus, validateLayoutHints } from '../src/core/layouts';
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
let criticalSteps = 0;
let annotatedSteps = 0;
let layoutSteps = 0;
let passiveSteps = 0;
let trialSteps = 0;
let labyrinthSteps = 0;
let waypointSteps = 0;
let buildSteps = 0;
let genericTravelSteps = 0;

for (const area of dataset.areas) {
  if (areaIds.has(area.id)) errors.push(`Duplicate area ID: ${area.id}`);
  areaIds.add(area.id);
  if (!area.name?.trim()) errors.push(`Area ${area.id} has no readable name.`);
}

let previousAct = 1;
for (const [index, step] of dataset.steps.entries()) {
  const page = index + 1;
  if (stepIds.has(step.id)) errors.push(`Duplicate semantic step ID: ${step.id}`);
  stepIds.add(step.id);
  if (step.act < previousAct || step.act > previousAct + 1) errors.push(`Impossible act transition near page ${page}: Act ${previousAct} -> ${step.act}.`);
  previousAct = step.act;
  if (step.targetAreaId && !knownAreas.has(step.targetAreaId)) errors.push(`Page ${page} targets unknown area ${step.targetAreaId}.`);
  if (!step.actions.some((action) => action.priority !== 'context')) errors.push(`Page ${page} has no decisive semantic action.`);
  const actionIds = new Set<string>();
  for (const action of step.actions) {
    if (actionIds.has(action.id)) errors.push(`Page ${page} has duplicate action ID ${action.id}.`);
    actionIds.add(action.id);
    if (!action.title.trim()) errors.push(`Page ${page} has an empty action title.`);
    if (action.priority !== 'context' && looksUnhumanized(action.title)) errors.push(`Page ${page} leaks upstream token syntax into ${action.priority.toUpperCase()} action: ${action.title}`);
  }
  if (step.permanentReward && !step.tags.includes(step.permanentReward)) errors.push(`Permanent ${step.permanentReward} page ${page} is missing its matching tag.`);

  const callouts = guideCalloutsForStep(step);
  const labName = labyrinthNameForStep(step);
  const hasWaypoint = step.actions.some((action) => action.type === 'waypoint');
  const hasBuild = step.actions.some((action) => action.type === 'build');
  const now = step.actions.find((action) => action.priority === 'now');

  if (callouts.some((callout) => callout.importance === 'critical')) criticalSteps += 1;
  if (step.annotation) annotatedSteps += 1;
  if (step.layoutHints?.length) layoutSteps += 1;
  if (step.permanentReward === 'passive') passiveSteps += 1;
  if (step.permanentReward === 'trial') trialSteps += 1;
  if (labName) labyrinthSteps += 1;
  if (hasWaypoint) waypointSteps += 1;
  if (hasBuild) buildSteps += 1;
  if (now?.type === 'travel' && /^Enter\s+/i.test(now.title) && !step.annotation && !(step.layoutHints?.length)) genericTravelSteps += 1;

  if (step.permanentReward === 'passive' && !callouts.some((callout) => callout.kind === 'passive')) {
    errors.push(`Page ${page} is a passive reward but lacks the explicit "Passive skill point quest here" callout.`);
  }
  if (step.permanentReward === 'trial' && !callouts.some((callout) => callout.kind === 'trial')) {
    errors.push(`Page ${page} is an Ascendancy Trial but lacks the explicit trial callout.`);
  }
  if (labName && !callouts.some((callout) => callout.kind === 'labyrinth')) {
    errors.push(`Page ${page} is the ${labName} Labyrinth but lacks a Labyrinth-run callout.`);
  }
  if (labName && step.permanentReward === 'trial') {
    errors.push(`Page ${page} incorrectly treats the ${labName} Labyrinth run as a permanent Trial reward.`);
  }
  if (hasWaypoint && !callouts.some((callout) => callout.kind === 'waypoint')) {
    errors.push(`Page ${page} contains a waypoint action but lacks the "grab the waypoint" callout.`);
  }
  if (hasBuild && !callouts.some((callout) => callout.kind === 'build')) {
    errors.push(`Page ${page} contains a build action but lacks the build-milestone callout.`);
  }
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

const layoutAuditCounts = { verified: 0, reviewed: 0, unaudited: 0, outdated: 0 };
for (const hint of layouts) {
  if (!knownAreas.has(hint.areaId)) errors.push(`Layout hint references unknown area ${hint.areaId}.`);
  if (!hint.text.trim()) errors.push(`Layout hint for ${hint.areaId} is empty.`);
  const audit = layoutAuditStatus(hint);
  layoutAuditCounts[audit] += 1;
  if (audit === 'outdated' && hint.enabled !== false) errors.push(`Outdated layout hint for ${hint.areaId} must be disabled.`);
  if ((audit === 'verified' || audit === 'reviewed') && !hint.gameVersion) errors.push(`${audit} layout hint for ${hint.areaId} has no gameVersion.`);
  if ((audit === 'verified' || audit === 'reviewed') && !hint.auditedAt) errors.push(`${audit} layout hint for ${hint.areaId} has no auditedAt date.`);
  if (audit === 'unaudited') warnings.push(`Layout hint for ${hint.areaId} is unaudited and will be lower priority.`);
}

console.log([
  '# Campaign semantic lint',
  '',
  `- Steps: ${dataset.steps.length}`,
  `- Areas: ${dataset.areas.length}`,
  `- Guidance selectors: ${annotations.length}`,
  `- Layout hints: ${layouts.length}`,
  `- Critical guide steps: ${criticalSteps}`,
  `- Bespoke annotated steps: ${annotatedSteps}`,
  `- Steps with layout help: ${layoutSteps}`,
  `- Permanent passive steps: ${passiveSteps}`,
  `- Ascendancy Trial steps: ${trialSteps}`,
  `- Labyrinth-run steps: ${labyrinthSteps}`,
  `- Waypoint steps: ${waypointSteps}`,
  `- Build-milestone steps: ${buildSteps}`,
  `- Plain travel steps without bespoke/layout help: ${genericTravelSteps}`,
  `- Layout audit: ${layoutAuditCounts.verified} verified / ${layoutAuditCounts.reviewed} reviewed / ${layoutAuditCounts.unaudited} unaudited / ${layoutAuditCounts.outdated} outdated`,
  `- Errors: ${errors.length}`,
  `- Warnings: ${warnings.length}`,
].join('\n'));
if (warnings.length) console.log(`\nWarnings:\n- ${warnings.join('\n- ')}`);
if (errors.length) {
  console.error(`\nErrors:\n- ${errors.join('\n- ')}`);
  process.exitCode = 1;
}
