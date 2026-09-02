import type { BuildProfile } from './build-profiles';
import { alignPobStages, milestoneContainsLevel, milestoneStartLevel, type PobAlignedStage } from './pob-stages';

export interface BuildPlannerState {
  schemaVersion: 1;
  activeProfileId?: string;
  activeStageByProfile: Record<string, string>;
  /** Number of Maxroll passive operations the player has explicitly acknowledged. */
  passiveCursorByProfile: Record<string, number>;
}

export interface BuildPlannerProfileView {
  profile: BuildProfile;
  stages: PobAlignedStage[];
  activeStageId?: string;
  passiveCursor: number;
}

export interface BuildPlannerSnapshot {
  activeProfileId?: string;
  profiles: BuildPlannerProfileView[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function safeCursor(value: unknown, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.max(0, Math.min(maximum, Math.trunc(parsed)));
}

export function defaultBuildPlannerState(): BuildPlannerState {
  return { schemaVersion: 1, activeStageByProfile: {}, passiveCursorByProfile: {} };
}

export function alignedStagesForProfile(profile: BuildProfile): PobAlignedStage[] {
  return alignPobStages(profile.build);
}

export function defaultActiveStageId(profile: BuildProfile): string | undefined {
  const stages = alignedStagesForProfile(profile);
  if (!stages.length) return undefined;

  const score = (stage: PobAlignedStage): number => {
    const members = [stage.tree, stage.skills, stage.items, stage.config].filter(Boolean);
    const active = members.filter((member) => member?.active).length;
    return active * 100 + (stage.confidence === 'high' ? 4 : stage.confidence === 'medium' ? 3 : stage.confidence === 'low' ? 2 : 1);
  };

  return [...stages].sort((left, right) => score(right) - score(left) || left.ordinalHint - right.ordinalHint)[0]?.id;
}

export function normalizeBuildPlannerState(value: unknown, profiles: BuildProfile[]): BuildPlannerState {
  const source = record(value);
  const knownProfiles = new Map(profiles.map((profile) => [profile.id, profile]));
  const requestedActiveProfile = typeof source?.activeProfileId === 'string' ? source.activeProfileId : undefined;
  const activeProfileId = requestedActiveProfile && knownProfiles.has(requestedActiveProfile)
    ? requestedActiveProfile
    : profiles[0]?.id;

  const requestedStages = record(source?.activeStageByProfile) ?? {};
  const requestedCursors = record(source?.passiveCursorByProfile) ?? {};
  const activeStageByProfile: Record<string, string> = {};
  const passiveCursorByProfile: Record<string, number> = {};
  for (const profile of profiles) {
    const stages = alignedStagesForProfile(profile);
    const stageIds = new Set(stages.map((stage) => stage.id));
    const requested = typeof requestedStages[profile.id] === 'string' ? requestedStages[profile.id] as string : undefined;
    const selected = requested && stageIds.has(requested) ? requested : defaultActiveStageId(profile);
    if (selected) activeStageByProfile[profile.id] = selected;
    const maximum = profile.maxroll?.passiveOperations.length ?? 0;
    passiveCursorByProfile[profile.id] = safeCursor(requestedCursors[profile.id], maximum);
  }

  return { schemaVersion: 1, activeProfileId, activeStageByProfile, passiveCursorByProfile };
}

export function buildPlannerSnapshot(profiles: BuildProfile[], state: BuildPlannerState): BuildPlannerSnapshot {
  const normalized = normalizeBuildPlannerState(state, profiles);
  return {
    activeProfileId: normalized.activeProfileId,
    profiles: profiles.map((profile) => ({
      profile,
      stages: alignedStagesForProfile(profile),
      activeStageId: normalized.activeStageByProfile[profile.id],
      passiveCursor: normalized.passiveCursorByProfile[profile.id] ?? 0,
    })),
  };
}

export function activateBuildProfile(state: BuildPlannerState, profiles: BuildProfile[], profileId: string): BuildPlannerState {
  if (!profiles.some((profile) => profile.id === profileId)) return normalizeBuildPlannerState(state, profiles);
  return normalizeBuildPlannerState({ ...state, activeProfileId: profileId }, profiles);
}

export function activateBuildStage(state: BuildPlannerState, profiles: BuildProfile[], profileId: string, stageId: string): BuildPlannerState {
  const profile = profiles.find((candidate) => candidate.id === profileId);
  if (!profile) return normalizeBuildPlannerState(state, profiles);
  if (!alignedStagesForProfile(profile).some((stage) => stage.id === stageId)) return normalizeBuildPlannerState(state, profiles);
  return normalizeBuildPlannerState({
    ...state,
    activeProfileId: profileId,
    activeStageByProfile: { ...state.activeStageByProfile, [profileId]: stageId },
  }, profiles);
}

export function setBuildPassiveCursor(state: BuildPlannerState, profiles: BuildProfile[], profileId: string, cursor: number): BuildPlannerState {
  const profile = profiles.find((candidate) => candidate.id === profileId);
  if (!profile?.maxroll) return normalizeBuildPlannerState(state, profiles);
  const next = safeCursor(cursor, profile.maxroll.passiveOperations.length);
  return normalizeBuildPlannerState({
    ...state,
    activeProfileId: profileId,
    passiveCursorByProfile: { ...state.passiveCursorByProfile, [profileId]: next },
  }, profiles);
}

export function stepBuildPassiveCursor(state: BuildPlannerState, profiles: BuildProfile[], profileId: string, delta: number): BuildPlannerState {
  const current = normalizeBuildPlannerState(state, profiles).passiveCursorByProfile[profileId] ?? 0;
  return setBuildPassiveCursor(state, profiles, profileId, current + Math.trunc(delta));
}

/**
 * Maxroll skill planners label their swap points with levels or level ranges. This keeps the active
 * gem stage synced to Client.txt character-level events while leaving passive clicks under explicit
 * player control. Exact one-level transitions win at that exact level, while a range takes over on
 * subsequent levels. Before the first known milestone, the earliest future stage is selected.
 */
export function activateMaxrollStageForLevel(state: BuildPlannerState, profiles: BuildProfile[], profileId: string, characterLevel: number): BuildPlannerState {
  const profile = profiles.find((candidate) => candidate.id === profileId);
  if (!profile?.maxroll || !Number.isFinite(characterLevel)) return normalizeBuildPlannerState(state, profiles);
  const candidates = alignedStagesForProfile(profile)
    .map((stage) => ({ stage, milestone: stage.milestone, startLevel: milestoneStartLevel(stage.milestone) }))
    .filter((entry): entry is typeof entry & { startLevel: number } => entry.startLevel !== undefined);
  if (!candidates.length) return normalizeBuildPlannerState(state, profiles);

  const level = Math.max(1, Math.min(100, Math.trunc(characterLevel)));
  const eligible = candidates.filter((entry) => entry.startLevel <= level);
  const selected = eligible.length
    ? [...eligible].sort((left, right) => {
      const leftExact = left.milestone.startLevel === level && left.milestone.endLevel === level ? 1 : 0;
      const rightExact = right.milestone.startLevel === level && right.milestone.endLevel === level ? 1 : 0;
      if (leftExact !== rightExact) return rightExact - leftExact;
      const leftContains = milestoneContainsLevel(left.milestone, level) ? 1 : 0;
      const rightContains = milestoneContainsLevel(right.milestone, level) ? 1 : 0;
      if (leftContains !== rightContains) return rightContains - leftContains;
      if (left.startLevel !== right.startLevel) return right.startLevel - left.startLevel;
      return right.stage.ordinalHint - left.stage.ordinalHint;
    })[0]?.stage
    : [...candidates].sort((left, right) => left.startLevel - right.startLevel || left.stage.ordinalHint - right.stage.ordinalHint)[0]?.stage;

  return selected ? activateBuildStage(state, profiles, profileId, selected.id) : normalizeBuildPlannerState(state, profiles);
}
