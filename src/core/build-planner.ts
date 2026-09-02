import type { BuildProfile } from './build-profiles';
import { alignPobStages, type PobAlignedStage } from './pob-stages';

export interface BuildPlannerState {
  schemaVersion: 1;
  activeProfileId?: string;
  activeStageByProfile: Record<string, string>;
}

export interface BuildPlannerProfileView {
  profile: BuildProfile;
  stages: PobAlignedStage[];
  activeStageId?: string;
}

export interface BuildPlannerSnapshot {
  activeProfileId?: string;
  profiles: BuildPlannerProfileView[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function defaultBuildPlannerState(): BuildPlannerState {
  return { schemaVersion: 1, activeStageByProfile: {} };
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
  const activeStageByProfile: Record<string, string> = {};
  for (const profile of profiles) {
    const stages = alignedStagesForProfile(profile);
    const stageIds = new Set(stages.map((stage) => stage.id));
    const requested = typeof requestedStages[profile.id] === 'string' ? requestedStages[profile.id] as string : undefined;
    const selected = requested && stageIds.has(requested) ? requested : defaultActiveStageId(profile);
    if (selected) activeStageByProfile[profile.id] = selected;
  }

  return { schemaVersion: 1, activeProfileId, activeStageByProfile };
}

export function buildPlannerSnapshot(profiles: BuildProfile[], state: BuildPlannerState): BuildPlannerSnapshot {
  const normalized = normalizeBuildPlannerState(state, profiles);
  return {
    activeProfileId: normalized.activeProfileId,
    profiles: profiles.map((profile) => ({
      profile,
      stages: alignedStagesForProfile(profile),
      activeStageId: normalized.activeStageByProfile[profile.id],
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
