import { describe, expect, it } from 'vitest';
import { defaultBuildProfileName, normalizeBuildProfiles, upsertBuildProfile, type BuildProfile } from './build-profiles';
import type { PobBuildSummary } from './pob';

const build: PobBuildSummary = {
  root: 'PathOfBuilding', className: 'Witch', ascendancy: 'Elementalist', level: 38,
  treeStages: [], skillStages: [], itemStages: [], configStages: [], activeSkillGroups: [], warnings: [],
};

function profile(id: string, importedAt = '2026-09-01T10:00:00Z'): BuildProfile {
  return { id, name: defaultBuildProfileName(build), importedAt, sourceKind: 'export-code', build };
}

describe('build profiles', () => {
  it('uses class and ascendancy as a readable default name', () => {
    expect(defaultBuildProfileName(build)).toBe('Witch · Elementalist');
  });

  it('upserts and bounds local build profiles', () => {
    let profiles: BuildProfile[] = [];
    for (let index = 0; index < 30; index += 1) profiles = upsertBuildProfile(profiles, profile(String(index), `2026-09-01T10:${String(index).padStart(2, '0')}:00Z`));
    expect(profiles).toHaveLength(20);
  });

  it('drops malformed persisted profiles', () => {
    const normalized = normalizeBuildProfiles([profile('good'), { id: 42 }, { id: 'bad', importedAt: 'x', sourceKind: 'wat', build }]);
    expect(normalized.map((item) => item.id)).toEqual(['good']);
  });

  it('migrates v0.1 Build Profiles that predate configuration-stage parsing', () => {
    const legacyBuild = { ...build } as Record<string, unknown>;
    delete legacyBuild.configStages;
    const normalized = normalizeBuildProfiles([{ ...profile('legacy'), build: legacyBuild }]);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].build.configStages).toEqual([]);
  });
});
