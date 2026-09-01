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
    const build = record(item?.build);
    if (!item || !build || typeof item.id !== 'string' || item.id.length > 256 || typeof item.importedAt !== 'string') continue;
    if (!['xml', 'export-code', 'pobbin'].includes(String(item.sourceKind))) continue;
    const root = build.root;
    if (root !== 'PathOfBuilding') continue;
    result.push({
      id: item.id,
      name: typeof item.name === 'string' && item.name.trim() ? item.name.trim().slice(0, 160) : `${String(build.className ?? 'Unknown class')}`,
      importedAt: item.importedAt,
      sourceKind: item.sourceKind as PobInputKind,
      source: typeof item.source === 'string' ? item.source.slice(0, 1000) : undefined,
      build: build as unknown as PobBuildSummary,
    });
  }
  return result.sort((a, b) => b.importedAt.localeCompare(a.importedAt)).slice(0, MAX_BUILD_PROFILES);
}
