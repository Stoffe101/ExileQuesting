import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeCampaign, validateCampaign } from './campaign';
import type { GuidanceAnnotation, RawAreas, RawGuide } from './types';

async function fixture<T>(name: string): Promise<T> {
  const content = await readFile(path.join(process.cwd(), 'assets', 'campaign', name), 'utf8');
  return JSON.parse(content) as T;
}

describe('bundled Exile-UI campaign snapshot', () => {
  it('passes the same structural checks used by runtime updates', async () => {
    const [guide, areas] = await Promise.all([
      fixture<RawGuide>('guide.json'),
      fixture<RawAreas>('areas.json'),
    ]);
    const validation = validateCampaign(guide, areas);
    expect(validation.valid, validation.errors.join('\n')).toBe(true);
    expect(validation.metrics.acts).toBe(10);
    expect(validation.metrics.steps).toBe(228);
    expect(validation.metrics.unresolvedAreaReferences).toBeLessThanOrEqual(8);
  });

  it('retains semantic guidance matches after normalization', async () => {
    const [guide, areas, annotations] = await Promise.all([
      fixture<RawGuide>('guide.json'),
      fixture<RawAreas>('areas.json'),
      fixture<GuidanceAnnotation[]>('annotations.json'),
    ]);
    const dataset = normalizeCampaign(guide, areas, annotations, {
      repository: 'Lailloken/Exile-UI', commit: 'test', fetchedAt: 'test', license: 'MIT',
    });
    const matched = dataset.steps.filter((step) => step.annotation).length;
    expect(matched).toBeGreaterThanOrEqual(18);
    expect(new Set(dataset.steps.map((step) => step.id)).size).toBe(dataset.steps.length);
  });
});

