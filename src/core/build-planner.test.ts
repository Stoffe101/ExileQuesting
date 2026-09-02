import { describe, expect, it } from 'vitest';
import type { BuildProfile } from './build-profiles';
import { activateBuildProfile, activateBuildStage, buildPlannerSnapshot, defaultActiveStageId, normalizeBuildPlannerState } from './build-planner';
import type { PobBuildSummary } from './pob';

function build(): PobBuildSummary {
  return {
    root: 'PathOfBuilding',
    className: 'Witch',
    ascendancy: 'Elementalist',
    level: 42,
    treeStages: [
      { id: 'tree:1', title: 'Level 12', kind: 'tree', active: false, ordinal: 1 },
      { id: 'tree:2', title: 'Level 28', kind: 'tree', active: true, ordinal: 2 },
    ],
    skillStages: [
      { id: 'skills:1', sourceId: '7', title: 'Level 12', kind: 'skills', active: false, ordinal: 1 },
      { id: 'skills:2', sourceId: '9', title: 'Level 28', kind: 'skills', active: true, ordinal: 2 },
    ],
    itemStages: [
      { id: 'items:1', sourceId: '3', title: 'Level 12', kind: 'items', active: false, ordinal: 1 },
      { id: 'items:2', sourceId: '8', title: 'Level 28', kind: 'items', active: true, ordinal: 2 },
    ],
    configStages: [{ id: 'config:1', sourceId: '1', title: 'Default', kind: 'config', active: true, ordinal: 1 }],
    activeSkillGroups: [],
    warnings: [],
  };
}

function profile(id: string, importedAt = '2026-09-02T01:00:00.000Z'): BuildProfile {
  return { id, name: id, importedAt, sourceKind: 'xml', build: build() };
}

describe('build planner state', () => {
  it('defaults to PoB-selected stage members rather than the first stage', () => {
    const selected = defaultActiveStageId(profile('one'));
    expect(selected).toContain('level-28');
  });

  it('migrates missing or stale state to valid profile and stage selections', () => {
    const profiles = [profile('new', '2026-09-02T02:00:00.000Z'), profile('old')];
    const normalized = normalizeBuildPlannerState({
      activeProfileId: 'missing',
      activeStageByProfile: { new: 'also-missing', old: 'garbage' },
    }, profiles);
    expect(normalized.schemaVersion).toBe(1);
    expect(normalized.activeProfileId).toBe('new');
    expect(normalized.activeStageByProfile.new).toContain('level-28');
    expect(normalized.activeStageByProfile.old).toContain('level-28');
  });

  it('activates a profile and a validated aligned stage without trusting arbitrary ids', () => {
    const profiles = [profile('one'), profile('two')];
    let state = normalizeBuildPlannerState(undefined, profiles);
    state = activateBuildProfile(state, profiles, 'two');
    expect(state.activeProfileId).toBe('two');

    const snapshot = buildPlannerSnapshot(profiles, state);
    const firstStage = snapshot.profiles.find((entry) => entry.profile.id === 'one')!.stages[0];
    state = activateBuildStage(state, profiles, 'one', firstStage.id);
    expect(state.activeProfileId).toBe('one');
    expect(state.activeStageByProfile.one).toBe(firstStage.id);

    const protectedState = activateBuildStage(state, profiles, 'one', 'not-a-real-stage');
    expect(protectedState.activeStageByProfile.one).toBe(firstStage.id);
  });
});
