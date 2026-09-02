import type { PobBuildSummary, PobInputKind } from './pob';

export interface BuildProfile {
  id: string;
  name: string;
  importedAt: string;
  sourceKind: PobInputKind;
  source?: string;
  build: PobBuildSummary;
}

export const MAX_BUILD_PROFILES = 20;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function normalizePersistedBuild(value: Record<string, unknown>): PobBuildSummary | null {
  if (value.root !== 'PathOfBuilding') return null;
  return {
    ...value,
    root: 'PathOfBuilding',
    treeStages: array(value.treeStages) as PobBuildSummary['treeStages'],
    skillStages: array(value.skillStages) as PobBuildSummary['skillStages'],
    itemStages: array(value.itemStages) as PobBuildSummary['itemStages'],
    // v0.1.x profiles predate configuration-set parsing. Missing means "not parsed yet",
    // not corrupt data, so migrate them to the safe empty-family representation.
    configStages: array(value.configStages) as PobBuildSummary['configStages'],
    activeSkillGroups: array(value.activeSkillGroups) as PobBuildSummary['activeSkillGroups'],
    warnings: array(value.warnings).filter((entry): entry is string => typeof entry === 'string').slice(0, 100),
  } as PobBuildSummary;
}

export function defaultBuildProfileName(build: PobBuildSummary): string {
  const className = build.className || 'Unknown class';
  return build.ascendancy ? `${className} · ${build.ascendancy}` : className;
}

export function upsertBuildProfile(profiles: BuildProfile[], profile: BuildProfile): BuildProfile[] {
  return [...profiles.filter((candidate) => candidate.id !== profile.id), profile]
    .sort((a, b) => b.importedAt.localeCompare(a.importedAt))
    .slice(0, MAX_BUILD_PROFILES);
}

export function normalizeBuildProfiles(value: unknown): BuildProfile[] {
  if (!Array.isArray(value)) return [];
  const result: BuildProfile[] = [];
  for (const candidate of value) {
    const item = record(candidate);
    const buildRecord = record(item?.build);
    if (!item || !buildRecord || typeof item.id !== 'string' || item.id.length > 256 || typeof item.importedAt !== 'string') continue;
    if (!['xml', 'export-code', 'pobbin'].includes(String(item.sourceKind))) continue;
    const build = normalizePersistedBuild(buildRecord);
    if (!build) continue;
    result.push({
      id: item.id,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 160) : `${build.className ?? 'Unknown class'}`,
      importedAt: item.importedAt,
      sourceKind: item.sourceKind as PobInputKind,
      source: typeof item.source === 'string' ? item.source.slice(0, 1000) : undefined,
      build,
    });
  }
  return result.sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, MAX_BUILD_PROFILES);
}
