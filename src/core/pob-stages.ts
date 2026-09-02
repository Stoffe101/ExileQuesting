import type { PobBuildSummary, PobStageKind, PobStageSummary } from './pob';

export type PobStageAlignmentConfidence = 'high' | 'medium' | 'low' | 'ambiguous';
export type PobMilestoneKind = 'level' | 'act' | 'phase' | 'unknown';

export interface PobStageMilestone {
  kind: PobMilestoneKind;
  value?: number | string;
  key?: string;
  label?: string;
  startLevel?: number;
  endLevel?: number;
  qualifier?: 'minor-respec' | 'respec' | 'swap' | 'transition';
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

function stripPobFormatting(value: string): string {
  return value
    .replace(/\^[xX][0-9A-Fa-f]{6}/g, '')
    .replace(/\^\d/g, '')
    .trim();
}

export function normalizePobStageTitle(value: string): string {
  return stripPobFormatting(value)
    .toLowerCase()
    .replace(/[\s_\-–—:/|]+/g, ' ')
    .replace(/[^a-z0-9{} ]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function milestoneSource(value: string): string {
  return stripPobFormatting(value)
    .toLowerCase()
    .replace(/[–—]/g, '-')
    .replace(/_/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function linkedToken(title: string): string | undefined {
  return title.match(/\{([A-Za-z0-9_]+)\}/)?.[1]?.toLowerCase();
}

function validLevel(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= 100;
}

function milestoneQualifier(value: string): PobStageMilestone['qualifier'] {
  if (/\bminor\s+respec\b/i.test(value)) return 'minor-respec';
  if (/\brespec\b/i.test(value)) return 'respec';
  if (/\b(?:swap|switch)\b/i.test(value)) return 'swap';
  if (/\btransition\b/i.test(value)) return 'transition';
  return undefined;
}

function qualifierLabel(qualifier: PobStageMilestone['qualifier']): string | undefined {
  if (qualifier === 'minor-respec') return 'Minor respec';
  if (qualifier === 'respec') return 'Respec';
  if (qualifier === 'swap') return 'Swap';
  if (qualifier === 'transition') return 'Transition';
  return undefined;
}

export function parsePobStageMilestone(title: string): PobStageMilestone {
  const source = milestoneSource(title);
  const normalized = normalizePobStageTitle(title);
  const qualifier = milestoneQualifier(source);

  const range = source.match(/\b(?:level|lvl|lev)\s*(\d{1,3})\s*(?:-|to)\s*(\d{1,3})\b/i)
    ?? source.match(/^(\d{1,3})\s*(?:-|to)\s*(\d{1,3})\b/i);
  if (range) {
    const startLevel = Number(range[1]);
    const endLevel = Number(range[2]);
    if (validLevel(startLevel) && validLevel(endLevel) && startLevel <= endLevel) {
      const extra = qualifierLabel(qualifier);
      return {
        kind: 'level',
        value: startLevel,
        key: `level-range:${startLevel}-${endLevel}`,
        label: `Levels ${startLevel}-${endLevel}${extra ? ` (${extra})` : ''}`,
        startLevel,
        endLevel,
        qualifier,
      };
    }
  }

  const level = normalized.match(/\b(?:level|lvl|lev)\s*(\d{1,3})\b/i) ?? normalized.match(/^(\d{1,3})(?:\s|$)/);
  if (level) {
    const value = Number(level[1]);
    if (validLevel(value)) {
      const extra = qualifierLabel(qualifier);
      return {
        kind: 'level',
        value,
        key: `level:${value}`,
        label: `Level ${value}${extra ? ` (${extra})` : ''}`,
        startLevel: value,
        endLevel: value,
        qualifier,
      };
    }
  }

  const act = normalized.match(/\bact\s*(10|[1-9])\b/i);
  if (act) {
    const value = Number(act[1]);
    const extra = qualifierLabel(qualifier);
    return { kind: 'act', value, key: `act:${value}`, label: `Act ${value}${extra ? ` (${extra})` : ''}`, qualifier };
  }

  for (const [pattern, value, label] of PHASE_PATTERNS) {
    if (pattern.test(normalized)) return { kind: 'phase', value, key: `phase:${value}`, label, qualifier };
  }
  return { kind: 'unknown', qualifier };
}

export function milestoneStartLevel(milestone: PobStageMilestone): number | undefined {
  if (milestone.kind !== 'level') return undefined;
  const candidate = milestone.startLevel ?? (typeof milestone.value === 'number' ? milestone.value : undefined);
  return candidate !== undefined && validLevel(candidate) ? candidate : undefined;
}

export function milestoneContainsLevel(milestone: PobStageMilestone, level: number): boolean {
  const start = milestoneStartLevel(milestone);
  if (start === undefined || !Number.isFinite(level)) return false;
  const end = milestone.endLevel ?? start;
  return level >= start && level <= end;
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

function semanticRank(milestone: PobStageMilestone): [number, number] {
  if (milestone.kind === 'level') return [0, milestoneStartLevel(milestone) ?? 999];
  if (milestone.kind === 'act') return [1, Number(milestone.value) || 999];
  if (milestone.kind === 'phase') {
    const phaseOrder: Record<string, number> = { start: 0, early: 10, mid: 20, 'lab-1': 30, late: 40, 'lab-2': 50, 'lab-3': 60, maps: 70, 'lab-4': 80, endgame: 90 };
    return [2, phaseOrder[String(milestone.value)] ?? 999];
  }
  return [3, 999];
}

function sortAlignedStages(stages: PobAlignedStage[]): PobAlignedStage[] {
  return [...stages].sort((left, right) => {
    if (left.ordinalHint !== right.ordinalHint) return left.ordinalHint - right.ordinalHint;
    const leftRank = semanticRank(left.milestone);
    const rightRank = semanticRank(right.milestone);
    if (leftRank[0] !== rightRank[0]) return leftRank[0] - rightRank[0];
    if (leftRank[1] !== rightRank[1]) return leftRank[1] - rightRank[1];
    return left.title.localeCompare(right.title);
  });
}

function ordinalFallbackCompatible(stages: PobStageSummary[]): boolean {
  const tokens = stages.map((stage) => linkedToken(stage.title)).filter((value): value is string => Boolean(value));
  if (tokens.length && (tokens.length !== stages.length || new Set(tokens).size !== 1)) return false;
  const milestones = stages.map((stage) => parsePobStageMilestone(stage.title)).filter((milestone) => milestone.key);
  return new Set(milestones.map((milestone) => milestone.key)).size <= 1;
}

function unresolvedReasons(stage: PobStageSummary, families: Record<PobStageKind, PobStageSummary[]>): string[] {
  const reasons: string[] = [];
  const milestone = parsePobStageMilestone(stage.title);
  if (milestone.key) {
    const duplicates = families[stage.kind].filter((candidate) => parsePobStageMilestone(candidate.title).key === milestone.key);
    if (duplicates.length > 1) reasons.push(`${stage.kind} contains ${duplicates.length} sets for ${milestone.label ?? milestone.key}; the milestone is not unique enough to align safely.`);
  }

  const token = linkedToken(stage.title);
  if (token) {
    const counterpart = FAMILY_ORDER.some((family) => family !== stage.kind && families[family].some((candidate) => linkedToken(candidate.title) === token));
    if (!counterpart) reasons.push(`Linked-title token {${token}} has no matching set in another PoB family.`);
  }

  const multiFamilies = FAMILY_ORDER.filter((family) => families[family].length > 1);
  const counts = new Set(multiFamilies.map((family) => families[family].length));
  if (multiFamilies.length >= 2 && counts.size > 1) {
    reasons.push(`Ordinal fallback is disabled because multi-stage family counts differ (${multiFamilies.map((family) => `${family} ${families[family].length}`).join(', ')}).`);
  } else if (multiFamilies.length >= 2 && counts.size === 1) {
    const sameOrdinal = multiFamilies.map((family) => families[family][stage.ordinal - 1]).filter((candidate): candidate is PobStageSummary => Boolean(candidate));
    if (sameOrdinal.length >= 2 && !ordinalFallbackCompatible(sameOrdinal)) reasons.push(`Ordinal ${stage.ordinal} contains conflicting explicit milestones or linked-title tokens, so ExileQuesting refused to pair them.`);
  }

  reasons.push('No safe cross-family alignment was found for this PoB set.');
  return reasons;
}

/**
 * Aligns independent PoB tree/skill/item/config sets without assuming their numeric IDs match.
 *
 * Confidence ladder:
 *  - high: exact normalized title or PoB's explicit {token} convention matches across families;
 *  - medium: a unique level, level-range, act, or phase milestone matches across families;
 *  - low: same ordinal only when every multi-stage family has the same stage count and explicit semantics do not conflict;
 *  - ambiguous: no safe cross-family relationship could be established.
 *
 * A family containing exactly one set is treated as globally applicable and attached to each
 * aligned stage. It is never used as evidence that unrelated multi-stage families align.
 */
export function alignPobStages(build: PobBuildSummary): PobAlignedStage[] {
  const families = familyStages(build);
  const all = stageEntries(families);
  if (!all.length) return [];

  if (FAMILY_ORDER.every((family) => families[family].length <= 1)) {
    const members: Partial<Record<PobStageKind, PobStageSummary>> = {};
    for (const family of FAMILY_ORDER) if (families[family][0]) members[family] = families[family][0];
    const first = firstStage(members);
    return [alignedStage('single-build-state', members, 'high', parsePobStageMilestone(first.title), ['Each PoB family contains at most one set, so there is only one build state.'], first.title)];
  }

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
    const title = key.startsWith('token:') ? milestone.label : stripPobFormatting(stages[0].title);
    result.push(alignedStage(key, members, 'high', milestone, [reason], title));
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
    if (!members || stages.length < 2 || new Set(stages.map((stage) => stage.kind)).size < 2) continue;
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
      if (stages.length < 2 || !ordinalFallbackCompatible(stages)) continue;
      const milestone = stages.map((stage) => parsePobStageMilestone(stage.title)).find((value) => value.kind !== 'unknown') ?? { kind: 'unknown' as const };
      result.push(alignedStage(`ordinal:${ordinal}`, members, 'low', milestone, ['Ordinal fallback used because multi-stage family counts match and no explicit milestone or token conflict was found.']));
      stages.forEach((stage) => assigned.add(keyOf(stage)));
    }
  }

  addSingletonFamilies(result, families);

  for (const stage of candidates) {
    if (assigned.has(keyOf(stage))) continue;
    const members: Partial<Record<PobStageKind, PobStageSummary>> = { [stage.kind]: stage };
    result.push(alignedStage(`ambiguous:${stage.kind}:${stage.ordinal}`, members, 'ambiguous', parsePobStageMilestone(stage.title), unresolvedReasons(stage, families), stripPobFormatting(stage.title)));
  }

  return sortAlignedStages(result);
}
