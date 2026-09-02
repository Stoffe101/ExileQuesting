import { describe, expect, it } from 'vitest';
import type { PobBuildSummary, PobStageKind, PobStageSummary } from './pob';
import { alignPobStages, milestoneContainsLevel, normalizePobStageTitle, parsePobStageMilestone } from './pob-stages';

function stage(kind: PobStageKind, ordinal: number, title: string, sourceId?: string): PobStageSummary {
  return { id: `${kind}:${ordinal}`, sourceId, title, kind, ordinal, active: ordinal === 1 };
}

function build(overrides: Partial<PobBuildSummary>): PobBuildSummary {
  return {
    root: 'PathOfBuilding',
    treeStages: [],
    skillStages: [],
    itemStages: [],
    configStages: [],
    activeSkillGroups: [],
    warnings: [],
    ...overrides,
  };
}

describe('PoB stage milestone parsing', () => {
  it('normalizes display noise and extracts common milestones', () => {
    expect(normalizePobStageTitle('  ^7Level_28 / TREE  ')).toBe('level 28 tree');
    expect(parsePobStageMilestone('Lvl 28 gems')).toMatchObject({ kind: 'level', value: 28, key: 'level:28', startLevel: 28, endLevel: 28 });
    expect(parsePobStageMilestone('Act 6 swap')).toMatchObject({ kind: 'act', value: 6, key: 'act:6', qualifier: 'swap' });
    expect(parsePobStageMilestone('First Lab')).toMatchObject({ kind: 'phase', value: 'lab-1' });
    expect(parsePobStageMilestone('Mapping setup')).toMatchObject({ kind: 'phase', value: 'maps' });
  });

  it('recognizes current real-world level-range naming without flattening it to the first level', () => {
    expect(parsePobStageMilestone('Lvl 1-12')).toMatchObject({ kind: 'level', key: 'level-range:1-12', startLevel: 1, endLevel: 12, label: 'Levels 1-12' });
    expect(parsePobStageMilestone('12-32 Static Strike')).toMatchObject({ kind: 'level', key: 'level-range:12-32', startLevel: 12, endLevel: 32 });
    expect(parsePobStageMilestone('Level 56 to 67')).toMatchObject({ kind: 'level', key: 'level-range:56-67', startLevel: 56, endLevel: 67 });
  });

  it('preserves same-level transition intent separately from a following range', () => {
    expect(parsePobStageMilestone('Lvl 56 (Minor Respec)')).toMatchObject({ kind: 'level', key: 'level:56', qualifier: 'minor-respec', startLevel: 56, endLevel: 56 });
    expect(parsePobStageMilestone('Lvl 56-67')).toMatchObject({ kind: 'level', key: 'level-range:56-67', startLevel: 56, endLevel: 67 });
  });

  it('reports whether a character level is inside a parsed range', () => {
    const milestone = parsePobStageMilestone('Lvl 56-67');
    expect(milestoneContainsLevel(milestone, 55)).toBe(false);
    expect(milestoneContainsLevel(milestone, 56)).toBe(true);
    expect(milestoneContainsLevel(milestone, 67)).toBe(true);
    expect(milestoneContainsLevel(milestone, 68)).toBe(false);
  });
});

describe('PoB stage alignment', () => {
  it('treats matching modern PoB loadout titles as high-confidence alignment', () => {
    const aligned = alignPobStages(build({
      treeStages: [stage('tree', 1, 'Level 12'), stage('tree', 2, 'Level 28')],
      skillStages: [stage('skills', 1, 'Level 12', '11'), stage('skills', 2, 'Level 28', '22')],
      itemStages: [stage('items', 1, 'Level 12', '101'), stage('items', 2, 'Level 28', '202')],
      configStages: [stage('config', 1, 'Level 12', '7'), stage('config', 2, 'Level 28', '8')],
    }));

    expect(aligned).toHaveLength(2);
    expect(aligned.map((value) => value.confidence)).toEqual(['high', 'high']);
    expect(aligned.map((value) => value.title)).toEqual(['Level 12', 'Level 28']);
    expect(aligned[1].tree?.sourceId).toBeUndefined();
    expect(aligned[1].skills?.sourceId).toBe('22');
    expect(aligned[1].items?.sourceId).toBe('202');
    expect(aligned[1].config?.sourceId).toBe('8');
  });

  it('aligns equivalent level semantics without requiring identical titles', () => {
    const aligned = alignPobStages(build({
      treeStages: [stage('tree', 1, 'Level 12 tree'), stage('tree', 2, 'Level 28 tree')],
      skillStages: [stage('skills', 1, 'Lvl 12 gems', '41'), stage('skills', 2, 'Lvl 28 gems', '42')],
      itemStages: [stage('items', 1, '12', '51'), stage('items', 2, '28', '52')],
    }));

    expect(aligned).toHaveLength(2);
    expect(aligned.map((value) => value.confidence)).toEqual(['medium', 'medium']);
    expect(aligned.map((value) => value.milestone.key)).toEqual(['level:12', 'level:28']);
  });

  it('aligns equivalent level ranges while keeping a same-start respec transition distinct', () => {
    const aligned = alignPobStages(build({
      treeStages: [stage('tree', 1, 'Level 56 Minor Respec'), stage('tree', 2, 'Level 56-67 tree')],
      skillStages: [stage('skills', 1, 'Lvl 56 respec', '11'), stage('skills', 2, 'Lvl 56-67 gems', '12')],
      itemStages: [stage('items', 1, 'Level 56 swap', '21'), stage('items', 2, '56-67 gear', '22')],
    }));

    expect(aligned).toHaveLength(2);
    expect(aligned[0].milestone.key).toBe('level:56');
    expect(aligned[1].milestone.key).toBe('level-range:56-67');
    expect(aligned.every((value) => value.confidence === 'medium')).toBe(true);
  });

  it('recognizes PoB linked-title tokens without comparing family IDs', () => {
    const aligned = alignPobStages(build({
      treeStages: [stage('tree', 1, 'Campaign {A1}'), stage('tree', 2, 'Maps {MAPS}')],
      skillStages: [stage('skills', 1, 'Skills {A1}', '900'), stage('skills', 2, 'Gems {MAPS}', '901')],
      itemStages: [stage('items', 1, 'Gear {A1}', '12'), stage('items', 2, 'Items {MAPS}', '13')],
    }));

    expect(aligned).toHaveLength(2);
    expect(aligned.every((value) => value.confidence === 'high')).toBe(true);
    expect(aligned.some((value) => value.reasons.some((reason) => reason.includes('linked-title token')))).toBe(true);
  });

  it('reuses a singleton family across otherwise aligned stages', () => {
    const aligned = alignPobStages(build({
      treeStages: [stage('tree', 1, 'Level 12'), stage('tree', 2, 'Level 28')],
      skillStages: [stage('skills', 1, 'Level 12', '1'), stage('skills', 2, 'Level 28', '2')],
      configStages: [stage('config', 1, 'Default', '99')],
    }));

    expect(aligned).toHaveLength(2);
    expect(aligned.every((value) => value.config?.sourceId === '99')).toBe(true);
    expect(aligned.every((value) => value.reasons.some((reason) => reason.includes('config has one PoB set')))).toBe(true);
  });

  it('uses ordinal alignment only when every multi-stage family has the same count and no explicit semantics conflict', () => {
    const aligned = alignPobStages(build({
      treeStages: [stage('tree', 1, 'Starter tree'), stage('tree', 2, 'Final tree')],
      skillStages: [stage('skills', 1, 'Initial gems', '77'), stage('skills', 2, 'End setup', '88')],
    }));

    expect(aligned).toHaveLength(2);
    expect(aligned.every((value) => value.confidence === 'low')).toBe(true);
  });

  it('refuses ordinal fallback when explicit level semantics disagree', () => {
    const aligned = alignPobStages(build({
      treeStages: [stage('tree', 1, 'Level 28 tree'), stage('tree', 2, 'Maps')],
      skillStages: [stage('skills', 1, 'Level 30 gems', '7'), stage('skills', 2, 'Maps', '8')],
    }));

    expect(aligned.find((value) => value.title === 'Maps')?.confidence).toBe('high');
    const unresolved = aligned.filter((value) => value.confidence === 'ambiguous');
    expect(unresolved).toHaveLength(2);
    expect(unresolved.every((value) => value.reasons.some((reason) => reason.includes('conflicting explicit milestones')))).toBe(true);
    expect(aligned.some((value) => value.confidence === 'low')).toBe(false);
  });

  it('refuses ordinal fallback when linked-title tokens explicitly disagree', () => {
    const aligned = alignPobStages(build({
      treeStages: [stage('tree', 1, 'Campaign {A1}'), stage('tree', 2, 'Maps {MAPS}')],
      skillStages: [stage('skills', 1, 'Skills {A2}', '1'), stage('skills', 2, 'Gems {MAPS}', '2')],
    }));

    expect(aligned.filter((value) => value.confidence === 'ambiguous')).toHaveLength(2);
    expect(aligned.some((value) => value.confidence === 'low')).toBe(false);
  });

  it('keeps mixed Act and Level milestones in the author-provided stage sequence', () => {
    const aligned = alignPobStages(build({
      treeStages: [stage('tree', 1, 'Act 1'), stage('tree', 2, 'Level 28'), stage('tree', 3, 'Act 6')],
      skillStages: [stage('skills', 1, 'Act 1', '1'), stage('skills', 2, 'Level 28', '2'), stage('skills', 3, 'Act 6', '3')],
    }));

    expect(aligned.map((value) => value.title)).toEqual(['Act 1', 'Level 28', 'Act 6']);
  });

  it('surfaces richer ambiguity when multi-stage family counts differ', () => {
    const aligned = alignPobStages(build({
      treeStages: [stage('tree', 1, 'Starter tree'), stage('tree', 2, 'Transition tree'), stage('tree', 3, 'Final tree')],
      skillStages: [stage('skills', 1, 'Early gems', '2'), stage('skills', 2, 'Late gems', '3')],
    }));

    expect(aligned).toHaveLength(5);
    expect(aligned.every((value) => value.confidence === 'ambiguous')).toBe(true);
    expect(aligned.some((value) => value.reasons.some((reason) => reason.includes('family counts differ')))).toBe(true);
    expect(aligned.some((value) => value.tree?.ordinal === 2)).toBe(true);
    expect(aligned.some((value) => value.skills?.sourceId === '2')).toBe(true);
  });

  it('collapses a one-set build into one high-confidence state even when family titles differ', () => {
    const aligned = alignPobStages(build({
      treeStages: [stage('tree', 1, 'Tree')],
      skillStages: [stage('skills', 1, 'Gems', '20')],
      itemStages: [stage('items', 1, 'Gear', '500')],
      configStages: [stage('config', 1, 'Boss config', '9')],
    }));

    expect(aligned).toHaveLength(1);
    expect(aligned[0].confidence).toBe('high');
    expect(aligned[0].tree).toBeTruthy();
    expect(aligned[0].skills).toBeTruthy();
    expect(aligned[0].items).toBeTruthy();
    expect(aligned[0].config).toBeTruthy();
  });
});
