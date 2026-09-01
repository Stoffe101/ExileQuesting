import { buildRouteActions } from './actions';
import { hintsForArea } from './layouts';
import { decideProgression } from './progression';
import { isPermanentRewardStep } from './rewards';
import type {
  AreaRecord,
  CampaignCondition,
  CampaignDataset,
  CampaignStep,
  CampaignValidation,
  GuidanceAnnotation,
  LayoutHint,
  RawAreas,
  RawGuide,
  RawStep,
} from './types';

const ICON_LABELS: Record<string, string> = {
  waypoint: 'Waypoint', quest: 'Quest', portal: 'Portal', arena: 'Boss arena', lab: 'Trial', craft: 'Crafting recipe',
  town: 'Town', hideout: 'Hideout', help: 'Help', chest: 'Reward',
};

function stableHash(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}

function slug(value: string): string {
  return value
    .toLowerCase()
    .replace(/areaid[\w_]+/g, '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 44) || 'step';
}

function titleCase(value: string): string {
  return value.replaceAll('_', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export function buildAreaLookup(rawAreas: RawAreas): Map<string, AreaRecord> {
  return new Map(rawAreas.flat().map((area) => [area.id, area]));
}

export function extractAreaIds(lines: string[]): string[] {
  const ids: string[] = [];
  for (const line of lines) {
    for (const match of line.matchAll(/areaid([\w_]+)/gi)) ids.push(match[1]);
  }
  return ids;
}

export function humanizeLine(raw: string, areas: Map<string, AreaRecord>): string {
  const human = raw
    .replace(/\s*;;\s*/g, ' — ')
    .replace(/\(color:[^)]+\)/gi, '')
    .replace(/\(lvl:(\d+)\)/gi, 'level $1')
    .replace(/\(ms\)/gi, 'movement speed')
    .replace(/\(img:([^)]+)\)/gi, (_match, icon: string) => ICON_LABELS[icon.toLowerCase()] ?? icon.replaceAll('_', ' '))
    .replace(/\(quest:([^)]+)\)/gi, (_match, quest: string) => `Quest: ${titleCase(quest)}`)
    .replace(/<([^>]+)>/g, (_match, token: string) => token.replaceAll('_', ' '))
    .replace(/areaid([\w_]+)/gi, (_match, id: string) => areas.get(id)?.name ?? id)
    .replace(/arena:([\w_]+)/gi, (_match, name: string) => name.replaceAll('_', ' '))
    .replace(/\(hint\)_*/gi, 'Tip:')
    .replace(/\b(leaguestart|twinkrun):\s*/gi, '')
    .replace(/\bbuy_gems\b/gi, 'buy gems')
    .replace(/\byour_hideout\b/gi, 'your hideout')
    .replace(/\bcheck_room\b/gi, 'check the room')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/\s+([,.])/g, '$1')
    .trim();
  return human ? human[0].toUpperCase() + human.slice(1) : human;
}

function tagsFor(lines: string[]): string[] {
  const text = lines.join(' ').toLowerCase();
  const tags: string[] = [];
  if (text.includes('waypoint')) tags.push('waypoint');
  if (text.includes('quest:book') || text.includes('(quest:the_apex)') || /book_of_skill/i.test(text)) tags.push('passive');
  if (text.includes('(img:lab)') || text.includes('trial')) tags.push('trial');
  if (text.includes('kill ') || text.includes('arena:')) tags.push('boss');
  if (text.includes('relog')) tags.push('logout');
  if (text.includes('optional')) tags.push('optional');
  if (text.includes('buy_gems') || /<[^>]+>/.test(text)) tags.push('gems');
  if (text.includes('(img:craft)')) tags.push('craft');
  return tags;
}

function conditionFor(step: RawStep): CampaignCondition | undefined {
  if (Array.isArray(step)) return undefined;
  const [key, value] = step.condition;
  if (key !== 'league-start' && key !== 'bandit') return undefined;
  return { key, value };
}

function linesFor(step: RawStep): string[] {
  return Array.isArray(step) ? step : step.lines;
}

function findAnnotation(annotations: GuidanceAnnotation[], act: number, areaIds: string[], lines: string[]): GuidanceAnnotation | undefined {
  const haystack = lines.join(' ').toLowerCase();
  return annotations.find(({ selector }) => {
    if (selector.act !== act) return false;
    if (selector.areaId && !areaIds.includes(selector.areaId)) return false;
    return (selector.contains ?? []).every((part) => haystack.includes(part.toLowerCase()));
  });
}

function inferTitle(lines: string[], targetArea?: string): string {
  const text = lines.join(' ').toLowerCase();
  if (text.includes('kill ')) {
    const match = text.match(/kill\s+(?:arena:)?([a-z_' -]+)/i);
    if (match) return `Defeat ${match[1].trim().replaceAll('_', ' ')}`;
  }
  if (text.includes('relog')) return 'Return to town efficiently';
  if (text.includes('(img:lab)') || text.includes(' trial')) return 'Complete the Ascendancy trial';
  if (text.includes('(img:quest)')) return 'Turn in quests and prepare';
  if (targetArea) return `Continue to ${targetArea}`;
  return 'Continue the campaign route';
}

export function normalizeCampaign(
  rawGuide: RawGuide,
  rawAreas: RawAreas,
  annotations: GuidanceAnnotation[],
  source: CampaignDataset['source'],
  layoutHints: LayoutHint[] = [],
): CampaignDataset {
  const areas = buildAreaLookup(rawAreas);
  const steps: CampaignStep[] = [];
  const acts: CampaignDataset['acts'] = [];
  const signatureOccurrences = new Map<string, number>();

  rawGuide.forEach((actSteps, actIndex) => {
    const act = actIndex + 1;
    const firstStep = steps.length;
    actSteps.forEach((rawStep, indexInAct) => {
      const rawLines = linesFor(rawStep);
      const areaIds = extractAreaIds(rawLines);
      const targetAreaId = areaIds.at(-1);
      const target = targetAreaId ? areas.get(targetAreaId) : undefined;
      const annotation = findAnnotation(annotations, act, areaIds, rawLines);
      const condition = conditionFor(rawStep);
      const signature = `${act}|${targetAreaId ?? ''}|${JSON.stringify(condition ?? null)}|${rawLines.join('|')}`;
      const occurrence = (signatureOccurrences.get(signature) ?? 0) + 1;
      signatureOccurrences.set(signature, occurrence);
      const tags = tagsFor(rawLines);
      const actions = buildRouteActions(rawLines, areas);
      const id = `poe1.act${act}.${targetAreaId ?? 'route'}.${slug(rawLines[0] ?? '')}.${stableHash(signature)}.${occurrence}`;
      steps.push({
        id,
        act,
        indexInAct,
        title: annotation?.title ?? actions.find((action) => action.priority === 'now')?.title ?? inferTitle(rawLines, target?.name),
        targetAreaId,
        targetArea: target?.name,
        areaLevel: target?.lvl,
        lines: rawLines.map((line) => humanizeLine(line, areas)),
        rawLines,
        tags,
        actions,
        condition,
        annotation: annotation ? {
          title: annotation.title,
          summary: annotation.summary,
          details: annotation.details,
          why: annotation.why,
          warning: annotation.warning,
          speedrun: annotation.speedrun,
        } : undefined,
        layoutHints: hintsForArea(layoutHints, targetAreaId),
        permanentReward: isPermanentRewardStep(tags),
      });
    });
    acts.push({ act, firstStep, stepCount: steps.length - firstStep });
  });

  return { schemaVersion: 2, source, steps, acts, areas: [...areas.values()] };
}

export function validateCampaign(rawGuide: unknown, rawAreas: unknown): CampaignValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  if (!Array.isArray(rawGuide)) errors.push('Guide root is not an array.');
  if (!Array.isArray(rawAreas)) errors.push('Area root is not an array.');

  const guide = Array.isArray(rawGuide) ? rawGuide : [];
  const areaGroups = Array.isArray(rawAreas) ? rawAreas : [];
  const areas = areaGroups.flat().filter((value): value is AreaRecord => Boolean(value && typeof value === 'object' && 'id' in value));
  const areaIds = new Set(areas.map((area) => area.id));
  let steps = 0;
  let referencedAreas = 0;
  let unresolved = 0;

  guide.forEach((act, actIndex) => {
    if (!Array.isArray(act)) {
      errors.push(`Act ${actIndex + 1} is not an array.`);
      return;
    }
    if (act.length < 8) warnings.push(`Act ${actIndex + 1} has an unusually small number of steps (${act.length}).`);
    steps += act.length;
    act.forEach((step) => {
      const lines = Array.isArray(step)
        ? step
        : step && typeof step === 'object' && 'lines' in step && Array.isArray(step.lines)
          ? step.lines
          : null;
      if (!lines || !lines.every((line: unknown) => typeof line === 'string')) {
        errors.push(`Act ${actIndex + 1} contains a malformed step.`);
        return;
      }
      for (const id of extractAreaIds(lines)) {
        referencedAreas += 1;
        if (!areaIds.has(id)) unresolved += 1;
      }
    });
  });

  if (guide.length !== 10) errors.push(`Expected 10 acts, received ${guide.length}.`);
  if (steps < 180) errors.push(`Expected at least 180 steps, received ${steps}.`);
  if (areas.length < 140) errors.push(`Expected at least 140 areas, received ${areas.length}.`);
  if (unresolved > 8) errors.push(`${unresolved} area references could not be resolved.`);
  else if (unresolved > 0) warnings.push(`${unresolved} area references could not be resolved.`);

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    metrics: { acts: guide.length, steps, areas: areas.length, referencedAreas, unresolvedAreaReferences: unresolved },
  };
}

export function isStepEnabled(step: CampaignStep, options: { leagueStart: boolean; bandit: string; showOptional: boolean }): boolean {
  if (!options.showOptional && step.tags.includes('optional')) return false;
  if (!step.condition) return true;
  const values = Array.isArray(step.condition.value) ? step.condition.value : [step.condition.value];
  if (step.condition.key === 'league-start') return values.includes(options.leagueStart ? 'yes' : 'no');
  if (step.condition.key === 'bandit') return values.includes(options.bandit);
  return true;
}

export function findProgressForZone(
  steps: CampaignStep[],
  currentProgress: number,
  event: { areaName?: string; areaId?: string },
): number | null {
  return decideProgression(steps, currentProgress, event)?.to ?? null;
}
