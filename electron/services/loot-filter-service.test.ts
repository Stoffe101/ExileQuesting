import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { LootFilterPlan } from '../../src/core/loot-filter';
import { validateBaseFilterPath, writeBuildAwareLootFilter } from './loot-filter-service';

const roots: string[] = [];

async function tempRoot(): Promise<string> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'exilequesting-loot-'));
  roots.push(root);
  return root;
}

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => fs.rm(root, { recursive: true, force: true })));
});

function plan(): LootFilterPlan {
  return {
    profileId: 'witch',
    profileName: 'Fireball Witch',
    gameVersion: '3.29',
    stageId: 'stage:act2',
    stageTitle: 'Act 2',
    linkTargets: [{
      stageId: 'stage:act2',
      stageTitle: 'Act 2',
      label: 'Main skill',
      links: 3,
      qualityBonusColours: ['R', 'B', 'B'],
      gems: ['Added Fire Damage', 'Fireball', 'Faster Casting'],
    }],
    baseTargets: [],
    showChromaticRecipe: true,
    showSixSockets: true,
    warnings: [],
  };
}

describe('loot filter service', () => {
  it('rejects non-filter files and its own generated wrapper as a base', async () => {
    const root = await tempRoot();
    const text = path.join(root, 'notes.txt');
    const generated = path.join(root, 'ExileQuesting.filter');
    await fs.writeFile(text, 'Show\n', 'utf8');
    await fs.writeFile(generated, 'Show\n', 'utf8');
    await expect(validateBaseFilterPath(text)).rejects.toThrow('.filter');
    await expect(validateBaseFilterPath(generated)).rejects.toThrow('base filter');
  });

  it('writes a 3.29 link-first wrapper next to the selected base without modifying the base filter', async () => {
    const root = await tempRoot();
    const basePath = path.join(root, 'NeverSink.filter');
    const baseContent = 'Show\n    Class "Currency"\n';
    await fs.writeFile(basePath, baseContent, 'utf8');

    const result = await writeBuildAwareLootFilter(basePath, plan());
    expect(result.status).toBe('ready');
    expect(result.needsReload).toBe(true);
    expect(result.outputPath).toBe(path.join(root, 'ExileQuesting.filter'));
    expect(await fs.readFile(basePath, 'utf8')).toBe(baseContent);
    const wrapper = await fs.readFile(result.outputPath!, 'utf8');
    expect(wrapper).toContain('SocketGroup >= 3RBB');
    expect(wrapper).toContain('LinkedSockets >= 3');
    expect(wrapper).toContain('AreaLevel <= 67');
    expect(wrapper.trimEnd().endsWith('Import "NeverSink.filter"')).toBe(true);
  });

  it('keeps a stable fingerprint when the build-aware rules did not change', async () => {
    const root = await tempRoot();
    const basePath = path.join(root, 'Base.filter');
    await fs.writeFile(basePath, 'Show\n', 'utf8');
    const first = await writeBuildAwareLootFilter(basePath, plan());
    const second = await writeBuildAwareLootFilter(basePath, plan(), first.fingerprint);
    expect(first.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(second.fingerprint).toBe(first.fingerprint);
    expect(second.needsReload).toBe(false);
    expect(second.message).toContain('already current');
  });
});
