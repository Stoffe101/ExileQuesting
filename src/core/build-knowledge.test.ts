import { describe, expect, it } from 'vitest';
import {
  buildKnowledgeCoverage,
  uncoveredKnowledgeDimensions,
  validateBuildKnowledgeCorpus,
  type BuildKnowledgeCorpus,
} from './build-knowledge';

const corpus: BuildKnowledgeCorpus = {
  schemaVersion: 1,
  generatedAt: '2026-09-03T01:30:00Z',
  sources: [
    {
      id: 'pob',
      kind: 'calculation-engine',
      title: 'Path of Building Community',
      url: 'https://github.com/PathOfBuildingCommunity/PathOfBuilding',
      patches: ['3.29'],
      usePolicy: 'redistributable',
      firstReviewedAt: '2026-09-03T01:00:00Z',
      lastReviewedAt: '2026-09-03T01:00:00Z',
    },
    {
      id: 'creator',
      kind: 'creator-guide',
      title: 'Example expert guide',
      url: 'https://example.com/build',
      creator: 'Example',
      patches: ['3.29'],
      usePolicy: 'derived-facts-only',
      firstReviewedAt: '2026-09-03T01:00:00Z',
      lastReviewedAt: '2026-09-03T01:00:00Z',
    },
  ],
  cases: [
    {
      id: 'crit-bow',
      kind: 'build',
      label: 'Crit bow mapper',
      patch: '3.29',
      sourceIds: ['creator', 'pob'],
      className: 'Ranger',
      ascendancy: 'Deadeye',
      mainSkills: ['Lightning Arrow'],
      deliveryMethods: ['direct-hit'],
      scalingAxes: ['weapon-damage', 'crit', 'attack-speed', 'projectile-count', 'projectile-behaviour'],
      defenceLayers: ['life', 'evasion', 'suppression'],
      playstyleTraits: ['ranged', 'mobile', 'instant-damage', 'high-coverage', 'offscreen-capable'],
      contentTargets: ['general-mapping', 'eight-mod-mapping'],
      budgetTier: 'high-investment',
    },
    {
      id: 'crit-bow-broken-suppression',
      kind: 'mutation',
      label: 'Crit bow with broken suppression',
      patch: '3.29',
      sourceIds: ['pob'],
      parentCaseId: 'crit-bow',
      mainSkills: ['Lightning Arrow'],
      deliveryMethods: ['direct-hit'],
      scalingAxes: ['weapon-damage', 'crit'],
      defenceLayers: ['life', 'evasion', 'suppression'],
      playstyleTraits: ['ranged', 'mobile'],
      contentTargets: ['eight-mod-mapping'],
      mutation: {
        category: 'defence-breakpoint',
        expectedFailure: 'Loss of suppression materially increases incoming spell hit damage.',
      },
    },
  ],
  assertions: [
    {
      id: 'crit-bow-projectiles',
      summary: 'Projectile count and projectile behaviour can be central clear and single-target scaling dimensions for bow builds.',
      sourceIds: ['creator', 'pob'],
      patches: ['3.29'],
      confidence: 'corroborated',
      mainSkills: ['Lightning Arrow'],
      scalingAxes: ['projectile-count', 'projectile-behaviour'],
    },
  ],
};

describe('build knowledge corpus', () => {
  it('validates a provenance-linked corpus and reports coverage', () => {
    expect(validateBuildKnowledgeCorpus(corpus)).toEqual([]);
    const coverage = buildKnowledgeCoverage(corpus);
    expect(coverage.totalSources).toBe(2);
    expect(coverage.totalCases).toBe(2);
    expect(coverage.caseKinds.mutation).toBe(1);
    expect(coverage.scalingAxes.crit).toBe(2);
    expect(coverage.contentTargets['eight-mod-mapping']).toBe(2);
    expect(uncoveredKnowledgeDimensions(corpus)).toContain('delivery:trigger');
  });

  it('refuses dangling provenance and malformed mutation records', () => {
    const invalid: BuildKnowledgeCorpus = {
      ...corpus,
      cases: [{
        ...corpus.cases[1],
        id: 'broken',
        sourceIds: ['missing-source'],
        parentCaseId: 'missing-parent',
        mutation: undefined,
      }],
    };
    const issues = validateBuildKnowledgeCorpus(invalid);
    expect(issues).toContain('Case broken references unknown source missing-source.');
    expect(issues).toContain('Case broken references unknown parent case missing-parent.');
    expect(issues).toContain('Mutation case broken requires mutation metadata.');
  });

  it('rejects duplicate ids and non-HTTPS research references', () => {
    const invalid: BuildKnowledgeCorpus = {
      ...corpus,
      sources: [
        ...corpus.sources,
        { ...corpus.sources[0], url: 'http://example.com/pob' },
      ],
    };
    const issues = validateBuildKnowledgeCorpus(invalid);
    expect(issues).toContain('Duplicate source id: pob');
    expect(issues).toContain('Source pob must use an HTTPS URL.');
  });
});
