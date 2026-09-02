import { describe, expect, it } from 'vitest';
import type { BuildProfile } from './build-profiles';
import {
  activateBuildProfile,
  activateBuildStage,
  activateMaxrollStageForLevel,
  buildPlannerSnapshot,
  defaultActiveStageId,
  normalizeBuildPlannerState,
  setBuildPassiveCursor,
  stepBuildPassiveCursor,
} from './build-planner';
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

function maxrollMetadata() {
  return {
    guideUrl: 'https://maxroll.gg/poe/build-guides/leveling-twink-ranger',
    guideTitle: 'Leveling Twink Ranger',
    guideSlug: 'leveling-twink-ranger',
    mode: 'twink' as const,
    compatibility: 'compatible-ids' as const,
    compatibilityMessage: 'fixture',
    passiveOperations: [
      { type: 'allocate' as const, nodeId: 10, checkpoint: 1 },
      { type: 'allocate' as const, nodeId: 20, checkpoint: 2 },
      { type: 'refund' as const, nodeId: 10, checkpoint: 3 },
    ],
    equipmentMilestones: [],
    alternateSkillPaths: [],
  };
}

function maxrollProfile(): BuildProfile {
  const buildSummary: PobBuildSummary = {
    root: 'PathOfBuilding',
    className: 'Ranger',
    skillStages: [
      { id: 'skills:1', title: 'Level 2', kind: 'skills', active: true, ordinal: 1, skillGroups: [] },
      { id: 'skills:2', title: 'Hollow Palm Swap (Level 12)', kind: 'skills', active: false, ordinal: 2, skillGroups: [] },
      { id: 'skills:3', title: 'Level 18', kind: 'skills', active: false, ordinal: 3, skillGroups: [] },
    ],
    treeStages: [], itemStages: [], configStages: [], activeSkillGroups: [], warnings: [],
  };
  return {
    id: 'maxroll-twink',
    name: 'Leveling Twink Ranger',
    importedAt: '2026-09-02T03:00:00.000Z',
    sourceKind: 'maxroll',
    source: 'https://maxroll.gg/poe/build-guides/leveling-twink-ranger',
    maxroll: { ...maxrollMetadata(), skillMilestones: ['Level 2', 'Hollow Palm Swap (Level 12)', 'Level 18'] },
    build: buildSummary,
  };
}

function rangeMaxrollProfile(): BuildProfile {
  const titles = ['Lvl 12-55', 'Lvl 56 (Minor Respec)', 'Lvl 56-67', 'Level 68'];
  return {
    id: 'maxroll-ranges',
    name: 'Range progression fixture',
    importedAt: '2026-09-02T04:00:00.000Z',
    sourceKind: 'maxroll',
    source: 'https://maxroll.gg/poe/build-guides/range-fixture',
    maxroll: { ...maxrollMetadata(), guideUrl: 'https://maxroll.gg/poe/build-guides/range-fixture', guideTitle: 'Range progression fixture', guideSlug: 'range-fixture', skillMilestones: titles },
    build: {
      root: 'PathOfBuilding',
      className: 'Ranger',
      treeStages: [], itemStages: [], configStages: [], activeSkillGroups: [], warnings: [],
      skillStages: titles.map((title, index) => ({ id: `skills:${index + 1}`, title, kind: 'skills' as const, active: index === 0, ordinal: index + 1, skillGroups: [] })),
    },
  };
}

describe('build planner state', () => {
  it('defaults to PoB-selected stage members rather than the first stage', () => {
    const selected = defaultActiveStageId(profile('one'));
    expect(selected).toContain('level-28');
  });

  it('migrates missing or stale state to valid profile, stage, and passive selections', () => {
    const profiles = [profile('new', '2026-09-02T02:00:00.000Z'), profile('old')];
    const normalized = normalizeBuildPlannerState({
      activeProfileId: 'missing',
      activeStageByProfile: { new: 'also-missing', old: 'garbage' },
      passiveCursorByProfile: { new: 999 },
    }, profiles);
    expect(normalized.schemaVersion).toBe(1);
    expect(normalized.activeProfileId).toBe('new');
    expect(normalized.activeStageByProfile.new).toContain('level-28');
    expect(normalized.activeStageByProfile.old).toContain('level-28');
    expect(normalized.passiveCursorByProfile).toEqual({ new: 0, old: 0 });
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

  it('keeps Maxroll passive acknowledgements explicit and clamps the cursor', () => {
    const twink = maxrollProfile();
    const profiles = [twink];
    let state = normalizeBuildPlannerState(undefined, profiles);
    expect(state.passiveCursorByProfile[twink.id]).toBe(0);
    state = stepBuildPassiveCursor(state, profiles, twink.id, 1);
    expect(state.passiveCursorByProfile[twink.id]).toBe(1);
    state = setBuildPassiveCursor(state, profiles, twink.id, 99);
    expect(state.passiveCursorByProfile[twink.id]).toBe(3);
    state = stepBuildPassiveCursor(state, profiles, twink.id, -99);
    expect(state.passiveCursorByProfile[twink.id]).toBe(0);
  });

  it('auto-selects Maxroll gem stages by character level without changing passive progress', () => {
    const twink = maxrollProfile();
    const profiles = [twink];
    let state = normalizeBuildPlannerState(undefined, profiles);
    state = setBuildPassiveCursor(state, profiles, twink.id, 2);

    state = activateMaxrollStageForLevel(state, profiles, twink.id, 4);
    let snapshot = buildPlannerSnapshot(profiles, state).profiles[0];
    expect(snapshot.stages.find((stage) => stage.id === snapshot.activeStageId)?.title).toBe('Level 2');
    expect(snapshot.passiveCursor).toBe(2);

    state = activateMaxrollStageForLevel(state, profiles, twink.id, 12);
    snapshot = buildPlannerSnapshot(profiles, state).profiles[0];
    expect(snapshot.stages.find((stage) => stage.id === snapshot.activeStageId)?.title).toBe('Hollow Palm Swap (Level 12)');
    expect(snapshot.passiveCursor).toBe(2);

    state = activateMaxrollStageForLevel(state, profiles, twink.id, 19);
    snapshot = buildPlannerSnapshot(profiles, state).profiles[0];
    expect(snapshot.stages.find((stage) => stage.id === snapshot.activeStageId)?.title).toBe('Level 18');
    expect(snapshot.passiveCursor).toBe(2);
  });

  it('uses the earliest future stage when character level is below every known milestone', () => {
    const ranged = rangeMaxrollProfile();
    const profiles = [ranged];
    const state = activateMaxrollStageForLevel(normalizeBuildPlannerState(undefined, profiles), profiles, ranged.id, 5);
    const snapshot = buildPlannerSnapshot(profiles, state).profiles[0];
    expect(snapshot.stages.find((stage) => stage.id === snapshot.activeStageId)?.title).toBe('Lvl 12-55');
  });

  it('shows an exact same-level respec transition before the following range takes over', () => {
    const ranged = rangeMaxrollProfile();
    const profiles = [ranged];
    let state = normalizeBuildPlannerState(undefined, profiles);

    state = activateMaxrollStageForLevel(state, profiles, ranged.id, 55);
    let snapshot = buildPlannerSnapshot(profiles, state).profiles[0];
    expect(snapshot.stages.find((stage) => stage.id === snapshot.activeStageId)?.title).toBe('Lvl 12-55');

    state = activateMaxrollStageForLevel(state, profiles, ranged.id, 56);
    snapshot = buildPlannerSnapshot(profiles, state).profiles[0];
    expect(snapshot.stages.find((stage) => stage.id === snapshot.activeStageId)?.title).toBe('Lvl 56 (Minor Respec)');

    state = activateMaxrollStageForLevel(state, profiles, ranged.id, 57);
    snapshot = buildPlannerSnapshot(profiles, state).profiles[0];
    expect(snapshot.stages.find((stage) => stage.id === snapshot.activeStageId)?.title).toBe('Lvl 56-67');

    state = activateMaxrollStageForLevel(state, profiles, ranged.id, 68);
    snapshot = buildPlannerSnapshot(profiles, state).profiles[0];
    expect(snapshot.stages.find((stage) => stage.id === snapshot.activeStageId)?.title).toBe('Level 68');
  });
});
