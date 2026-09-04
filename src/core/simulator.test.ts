import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeCampaign } from './campaign';
import { decideProgression } from './progression';
import { simulateCanonicalCampaign } from './simulator';
import type { GuidanceAnnotation, LayoutHint, RawAreas, RawGuide } from './types';

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(process.cwd(), 'assets', 'campaign', name), 'utf8')) as T;
}

async function bundledDataset() {
  const [guide, areas, annotations, layouts] = await Promise.all([
    fixture<RawGuide>('guide.json'),
    fixture<RawAreas>('areas.json'),
    fixture<GuidanceAnnotation[]>('annotations.json'),
    fixture<LayoutHint[]>('layouts.json'),
  ]);
  return normalizeCampaign(guide, areas, annotations, {
    repository: 'Lailloken/Exile-UI', commit: 'simulation', fetchedAt: 'simulation', license: 'MIT',
  }, layouts);
}

describe('offline Acts 1-10 campaign simulator', () => {
  it('replays the default league-start route without unsafe progression', async () => {
    const report = simulateCanonicalCampaign(await bundledDataset());
    expect(report.routePages).toBe(228);
    expect(report.actsVisited).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(report.issues.filter((issue) => issue.severity === 'error'), report.issues.map((issue) => issue.message).join('\n')).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it.each(['none', 'alira', 'kraityn', 'oak'] as const)('replays the %s bandit route', async (bandit) => {
    const report = simulateCanonicalCampaign(await bundledDataset(), { bandit });
    expect(report.issues.filter((issue) => issue.severity === 'error'), report.issues.map((issue) => issue.message).join('\n')).toEqual([]);
    expect(report.passed).toBe(true);
  });

  it('replays non-league-start and optional-disabled variants', async () => {
    const dataset = await bundledDataset();
    for (const options of [
      { leagueStart: false },
      { showOptional: false },
      { leagueStart: false, showOptional: false },
    ]) {
      const report = simulateCanonicalCampaign(dataset, options);
      expect(report.issues.filter((issue) => issue.severity === 'error'), JSON.stringify(options)).toEqual([]);
      expect(report.passed).toBe(true);
    }
  });

  it('never moves backwards for a recently revisited zone', () => {
    const steps = [
      { id: 'a', targetAreaId: 'coast', targetArea: 'The Coast' },
      { id: 'b', targetAreaId: 'mud', targetArea: 'Mud Flats' },
      { id: 'c', targetAreaId: 'passage', targetArea: 'Submerged Passage' },
      { id: 'd', targetAreaId: 'ledge', targetArea: 'The Ledge' },
    ] as any[];
    expect(decideProgression(steps, 3, { areaId: 'coast' })).toBeNull();
  });

  it('suppresses a stale backtrack when the same area only reappears several pages ahead', () => {
    const steps = [
      { id: 'a', targetAreaId: 'parent', targetArea: 'Parent' },
      { id: 'b', targetAreaId: 'side', targetArea: 'Side' },
      { id: 'c' },
      { id: 'd' },
      { id: 'e', targetAreaId: 'parent', targetArea: 'Parent' },
      { id: 'f', targetAreaId: 'next', targetArea: 'Next' },
    ] as any[];
    expect(decideProgression(steps, 2, { areaId: 'parent' })).toBeNull();
  });

  it('keeps intentional one-page catch-up available only when explicitly requested', () => {
    const steps = [
      { id: 'a', targetAreaId: 'parent', targetArea: 'Parent' },
      { id: 'b', targetAreaId: 'side', targetArea: 'Side' },
      { id: 'c', targetAreaId: 'parent', targetArea: 'Parent' },
      { id: 'd', targetAreaId: 'next', targetArea: 'Next' },
    ] as any[];
    expect(decideProgression(steps, 1, { areaId: 'parent' })).toBeNull();
    expect(decideProgression(steps, 1, { areaId: 'parent' }, { allowAheadMatch: true })).toMatchObject({ to: 3 });
  });

  it('never auto-completes passive rewards, Ascendancy Trials or Labyrinth pages', () => {
    const protectedPages = [
      { permanentReward: 'passive', tags: ['passive'] },
      { permanentReward: 'trial', tags: ['trial'] },
      { tags: ['labyrinth'] },
    ] as const;

    for (const [index, protectedPage] of protectedPages.entries()) {
      const steps = [
        { id: `protected-${index}`, targetAreaId: 'next-zone', targetArea: 'Next Zone', ...protectedPage },
        { id: `after-${index}`, targetAreaId: 'after-zone', targetArea: 'After Zone', tags: [] },
      ] as any[];
      expect(decideProgression(steps, 0, { areaId: 'next-zone' })).toBeNull();
      expect(decideProgression(steps, 0, { areaId: 'next-zone' }, { allowAheadMatch: true })).toBeNull();
    }
  });
});
