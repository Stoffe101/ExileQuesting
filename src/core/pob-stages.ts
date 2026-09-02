import type { PobBuildSummary, PobStageKind, PobStageSummary } from './pob';

export type PobStageAlignmentConfidence = 'high' | 'medium' | 'low' | 'ambiguous';
export type PobMilestoneKind = 'level' | 'act' | 'phase' | 'unknown';

export interface PobStageMilestone {
  kind: PobMilestoneKind;
  value?: number | string;
  key?: string;
  label?: string;
}

export interface PobAlignedStage {
  id: string;
  title: string;
  confidence: PobStageAlignmentConfidence;
  milestone: PobStageMilestone;
  tree?: PobStageSummary;
  skills?: PobStageSummary;
  items?: PobStageSummary;
  config?: PobStageSummary;
  reasons: string[];
  ordinalHint: number;
}

const FAMILY_ORDER: PobStageKind[] = ['tree', 'skills', 'items', 'config'];
const PHASE_PATTERNS: Array<[RegExp, string, string]> = [
  [/\b(?:league\s*start|starter|starting)\b/i, 'start', 'League start'],
  [/\b(?:early|early\s*game)\b/i, 'early', 'Early leveling'],
  [/\b(?:mid|mid\s*game)\b/i, 'mid', 'Mid leveling'],
  [/\b(?:late|late\s*game)\b/i, 'late', 'Late leveling'],
  [/\b(?:first\s*lab|normal\s*lab)\b/i, 'lab-1', 'First Lab'],
  [/\b(?:second\s*lab|cruel\s*lab)\b/i, 'lab-2', 'Second Lab'],
  [/\b(?:third\s*lab|merciless\s*lab)\b/i, 'lab-3', 'Third Lab'],
  [/\b(?:uber\s*lab|eternal\s*lab|fourth\s*lab)\b/i, 'lab-4', 'Uber Lab'],
  [/\b(?:maps?|mapping)\b/i, 'maps', 'Maps'],
  [/\b(?:end\s*game|endgame)\b/i, 'endgame', 'Endgame'],
];

function slug(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'stage';
}

export function normalizePobStageTitle(value: string): string {
  return value
    .replace(/\^[xX][0-9A-Fa-f]{6}/g, '')
    .replace(/\^\d/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_\-–—:/|]+/g, ' ')
    .replace(/[^a-z0-9{} ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function linkedToken(title: string): string | undefined {
  return title.match(/\{([A-Za-z0-9_]+)\}/)?.[1]?.toLowerCase();
}

export function parsePobStageMilestone(title: string): PobStageMilestone {
  const normalized = normalizePobStageTitle(title);
  const level = normalized.match(/\b(?:level|lvl|lev)\s*(\d{1,3})\b/i) ?? normalized.match(/^(\d{1,3})$/);
  if (level) {
    const value = Number(level[1]);
    if (Number.isInteger(value) && value >= 1 && value <= 100) return { kind: 'level', value, key: `level:${value}`, label: `Level ${value}` };
  }
  const act = normalized.match(/\bact\s*(10|[1-9])\b/i);
  if (act) {
    const value = Number(act[1]);
    return { kind: 'act', value, key: `act:${value}`, label: `Act ${value}` };
  }
  for (const [pattern, value, label] of PHASE_PATTERNS) if (pattern.test(normalized)) return { kind: 'phase', value, key: `phase:${value}`, label };
  return { kind: 'unknown' };
}

function familyStages(build: PobBuildSummary): Record<PobStageKind, PobStageSummary[]> {
  return {
    tree: build.treeStages,
    skills: build.skillStages,
    items: build.itemStages,
    config: build.configStages,
  };
}

function stageMap(stages: PobStageSummary[]): Partial<Record<PobStageKind, PobStageSummary>> | null {
  const result: Partial<Record<PobStageKind, PobStageSummary>> = {};
  for (const stage of stages) {
    if (result[stage.kind]) return null;
    result[stage.kind] = stage;
  }
  return result;
}

function firstStage(group: Partial<Record<PobStageKind, PobStageSummary>>): PobStageSummary {
  for (const family of FAMILY_ORDER) if (group[family]) return group[family]!;
  throw new Error('Aligned PoB stage unexpectedly has no members.');
}

function ordinalHint(group: Partial<Record<PobStageKind, PobStageSummary>>): number {
  const ordinals = FAMILY_ORDER.map((family) => group[family]?.ordinal).filter((value): value is number => typeof value === 'number');
  return ordinals.length ? Math.min(...ordinals) : Number.MAX_SAFE_INTEGER;
}

function alignedStage(
  idSeed: string,
  group: Partial<Record<PobStageKind, PobStageSummary>>,
  confidence: PobStageAlignmentConfidence,
  milestone: PobStageMilestone,
  reasons: string[],
  title?: string,
): PobAlignedStage {
  const first = firstStage(group);
  return {
    id: `aligned:${slug(idSeed)}`,
    title: title || milestone.label || first.title,
    confidence,
    milestone,
    tree: group.tree,
    skills: group.skills,
    items: group.items,
    config: group.config,
    reasons,
    ordinalHint: ordinalHint(group),
  };
}

function stageEntries(families: Record<PobStageKind, PobStageSummary[]>): PobStageSummary[] {
  return FAMILY_ORDER.flatMap((family) => families[family]);
}

function addSingletonFamilies(stages: PobAlignedStage[], families: Record<PobStageKind, PobStageSummary[]>): void {
  for (const family of FAMILY_ORDER) {
    if (families[family].length !== 1) continue;
    const singleton = families[family][0];
    for (const stage of stages) {
      if (!stage[family]) {
        stage[family] = singleton;
        stage.reasons.push(`${family} has one PoB set, so it applies across aligned stages.`);
      }
    }
  }
}

function sortAlignedStages(stages: PobAlignedStage[]): PobAlignedStage[] {
  const rank = (stage: PobAlignedStage): [number, number, number, string] => {
    const milestone = stage.milestone;
    if (milestone.kind === 'level') return [0, Number(milestone.value), stage.ordinalHint, stage.title];
    if (milestone.kind === 'act') return [1, Number(milestone.value), stage.ordinalHint, stage.title];
    if (milestone.kind === 'phase') {
      const phaseOrder: Record<string, number> = { start: 0, early: 10, mid: 20, 'lab-1': 30, late: 40, 'lab-2': 50, 'lab-3': 60, maps: 70, 'lab-4': 80, endgame: 90 };
      return [2, phaseOrder[String(milestone.value)] ?? 999, stage.ordinalHint, stage.title];
    }
    return [3, stage.ordinalHint, stage.ordinalHint, stage.title];
  };
  return [...stages].sort((a, b) => {
    const left = rank(a); const right = rank(b);
    for (let index = 0; index < 3; index += 1) if (left[index] !== right[index]) return Number(left[index]) - Number(right[index]);
    return String(left[3]).localeCompare(String(right[3]));
  });
}

/**
 * Aligns independent PoB tree/skill/item/config sets without assuming their numeric IDs match.
 *
 * Confidence ladder:
 *  - high: exact normalized title (or PoB's explicit {token} convention) matches across families;
 *  - medium: level/act/phase semantics match across families;
 *  - low: same ordinal only when every multi-stage family has the same stage count;
 *  - ambiguous: no safe cross-family relationship could be established.
 *
 * A family containing exactly one set is treated as globally applicable and attached to each
 * aligned stage. It is never used as evidence that unrelated multi-stage families align.
 */
export function alignPobStages(build: PobBuildSummary): PobAlignedStage[] {
  const families = familyStages(build);
  const all = stageEntries(families);
  if (!all.length) return [];

  const multiFamilyStages = all.filter((stage) => families[stage.kind].length > 1);
  const candidates = multiFamilyStages.length ? multiFamilyStages : all;
  const assigned = new Set<string>();
  const result: PobAlignedStage[] = [];
  const keyOf = (stage: PobStageSummary) => `${stage.kind}:${stage.ordinal}`;

  const titleBuckets = new Map<string, PobStageSummary[]>();
  for (const stage of candidates) {
    const token = linkedToken(stage.title);
    const normalized = normalizePobStageTitle(stage.title);
    if (!token && !normalized) continue;
    const key = token ? `token:${token}` : `title:${normalized}`;
    titleBuckets.set(key, [...(titleBuckets.get(key) ?? []), stage]);
  }
  for (const [key, stages] of titleBuckets) {
    const members = stageMap(stages);
    if (!members || stages.length < 2 || new Set(stages.map((stage) => stage.kind)).size < 2) continue;
    const milestone = parsePobStageMilestone(stages[0].title);
    const reason = key.startsWith('token:') ? `PoB linked-title token ${key.slice(6)} matches across set families.` : 'Exact normalized PoB stage title matches across set families.';
    result.push(alignedStage(key, members, 'high', milestone, [reason]));
    stages.forEach((stage) => assigned.add(keyOf(stage)));
  }

  const milestoneBuckets = new Map<string, PobStageSummary[]>();
  for (const stage of candidates) {
    if (assigned.has(keyOf(stage))) continue;
    const milestone = parsePobStageMilestone(stage.title);
    if (!milestone.key) continue;
    milestoneBuckets.set(milestone.key, [...(milestoneBuckets.get(milestone.key) ?? []), stage]);
  }
  for (const [key, stages] of milestoneBuckets) {
    const members = stageMap(stages);
    if (!members || stages.length < 2) continue;
    const milestone = parsePobStageMilestone(stages[0].title);
    result.push(alignedStage(key, members, 'medium', milestone, [`Shared ${milestone.label ?? key} milestone inferred from PoB titles.`], milestone.label));
    stages.forEach((stage) => assigned.add(keyOf(stage)));
  }

  const multiFamilies = FAMILY_ORDER.filter((family) => families[family].length > 1);
  const multiCounts = new Set(multiFamilies.map((family) => families[family].length));
  if (multiFamilies.length >= 2 && multiCounts.size === 1) {
    const count = families[multiFamilies[0]].length;
    for (let ordinal = 1; ordinal <= count; ordinal += 1) {
      const members: Partial<Record<PobStageKind, PobStageSummary>> = {};
      for (const family of multiFamilies) {
        const stage = families[family][ordinal - 1];
        if (stage && !assigned.has(keyOf(stage))) members[family] = stage;
      }
      const stages = Object.values(members).filter((stage): stage is PobStageSummary => Boolean(stage));
      if (stages.length < 2) continue;
      const milestone = stages.map((stage) => parsePobStageMilestone(stage.title)).find((value) => value.kind !== 'unknown') ?? { kind: 'unknown' as const };
      result.push(alignedStage(`ordinal:${ordinal}`, members, 'low', milestone, ['Ordinal fallback used because every multi-stage PoB family has the same stage count.']));
      stages.forEach((stage) => assigned.add(keyOf(stage)));
    }
  }

  if (!result.length && FAMILY_ORDER.every((family) => families[family].length <= 1)) {
    const members: Partial<Record<PobStageKind, PobStageSummary>> = {};
    for (const family of FAMILY_ORDER) if (families[family][0]) members[family] = families[family][0];
    const first = firstStage(members);
    result.push(alignedStage('single-build-state', members, 'high', parsePobStageMilestone(first.title), ['Each PoB family contains at most one set, so there is only one build state.']));
    Object.values(members).forEach((stage) => { if (stage) assigned.add(keyOf(stage)); });
  }

  addSingletonFamilies(result, families);

  for (const stage of candidates) {
    if (assigned.has(keyOf(stage))) continue;
    const members: Partial<Record<PobStageKind, PobStageSummary>> = { [stage.kind]: stage };
    result.push(alignedStage(`ambiguous:${stage.kind}:${stage.ordinal}`, members, 'ambiguous', parsePobStageMilestone(stage.title), ['No safe cross-family alignment was found for this PoB set.'], stage.title));
  }

  return sortAlignedStages(result);
}
