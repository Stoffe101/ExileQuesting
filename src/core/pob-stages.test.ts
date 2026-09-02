import { describe, expect, it } from 'vitest';
import type { PobBuildSummary, PobStageKind, PobStageSummary } from './pob';
import { alignPobStages, normalizePobStageTitle, parsePobStageMilestone } from './pob-stages';

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

describe('PoB stage alignment', () => {
  it('normalizes display noise and extracts common milestones', () => {
    expect(normalizePobStageTitle('  ^7Level_28 / TREE  ')).toBe('level 28 tree');
    expect(parsePobStageMilestone('Lvl 28 gems')).toMatchObject({ kind: 'level', value: 28, key: 'level:28' });
    expect(parsePobStageMilestone('Act 6 swap')).toMatchObject({ kind: 'act', value: 6, key: 'act:6' });
    expect(parsePobStageMilestone('First Lab')).toMatchObject({ kind: 'phase', value: 'lab-1' });
    expect(parsePobStageMilestone('Mapping setup')).toMatchObject({ kind: 'phase', value: 'maps' });
  });

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

  it('uses ordinal alignment only when every multi-stage family has the same count', () => {
    const aligned = alignPobStages(build({
      treeStages: [stage('tree', 1, 'Starter tree'), stage('tree', 2, 'Final tree')],
      skillStages: [stage('skills', 1, 'Initial gems', '77'), stage('skills', 2, 'Swap gems', '88')],
    }));

    expect(aligned).toHaveLength(2);
    expect(aligned.every((value) => value.confidence === 'low')).toBe(true);
  });

  it('surfaces ambiguity instead of pairing unrelated IDs or unequal stage counts', () => {
    const aligned = alignPobStages(build({
      treeStages: [stage('tree', 1, 'Starter tree'), stage('tree', 2, 'Transition tree'), stage('tree', 3, 'Final tree')],
      skillStages: [stage('skills', 1, 'Early gems', '2'), stage('skills', 2, 'Late gems', '3')],
    }));

    expect(aligned).toHaveLength(5);
    expect(aligned.every((value) => value.confidence === 'ambiguous')).toBe(true);
    expect(aligned.some((value) => value.tree?.ordinal === 2)).toBe(true);
    expect(aligned.some((value) => value.skills?.sourceId === '2')).toBe(true);
  });

  it('collapses a one-set build into a single high-confidence state', () => {
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
