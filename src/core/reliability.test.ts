import { describe, expect, it } from 'vitest';
import { buildRewardAudit } from './rewards';
import {
  appendRunHistory,
  elapsedRunMs,
  emptyRunSession,
  finishRun,
  recordActTransition,
  recordRunArea,
  startRun,
} from './run';
import { compareVersions, isNewerVersion, parseLatestRelease, parseSha256Digest } from './updates';
import type { CampaignDataset, CampaignStep } from './types';

function step(id: string, act: number, permanentReward?: 'passive' | 'trial'): CampaignStep {
  return {
    id,
    act,
    indexInAct: 0,
    title: id,
    lines: [id],
    rawLines: [id],
    tags: permanentReward ? [permanentReward] : [],
    actions: [{ id: `${id}:action`, type: permanentReward ?? 'travel', title: id, priority: 'now' }],
    permanentReward,
  };
}

const dataset: CampaignDataset = {
  schemaVersion: 2,
  source: { repository: 'test/repo', commit: 'abc', fetchedAt: '2026-09-01T00:00:00Z', license: 'MIT' },
  steps: [step('start', 1), step('passive-a', 1, 'passive'), step('trial-a', 2, 'trial'), step('passive-b', 10, 'passive')],
  acts: [],
  areas: [],
};

describe('campaign run timing', () => {
  it('does not double-count town time on duplicate area events', () => {
    let session = startRun(emptyRunSession(), 1, new Date('2026-09-01T10:00:00Z'));
    session = recordRunArea(session, '1_1_town', new Date('2026-09-01T10:01:00Z'));
    session = recordRunArea(session, '1_1_town', new Date('2026-09-01T10:02:00Z'));
    expect(session.townTimeMs).toBe(0);
    session = recordRunArea(session, '1_1_2', new Date('2026-09-01T10:03:00Z'));
    expect(session.townTimeMs).toBe(120_000);
  });

  it('records act splits using total elapsed run time', () => {
    let session = startRun(emptyRunSession(), 1, new Date('2026-09-01T10:00:00Z'));
    session = recordActTransition(session, 2, new Date('2026-09-01T10:20:00Z'));
    expect(session.splits).toHaveLength(1);
    expect(session.splits[0]).toMatchObject({ act: 1, elapsedMs: 1_200_000 });
  });

  it('finishes and keeps bounded run history', () => {
    const started = startRun(emptyRunSession(), 10, new Date('2026-09-01T10:00:00Z'));
    const result = finishRun(started, new Date('2026-09-01T10:10:00Z'));
    expect(result.session.state).toBe('finished');
    expect(result.history?.totalMs).toBe(600_000);
    let history = [] as NonNullable<typeof result.history>[];
    for (let index = 0; index < 30; index += 1) {
      history = appendRunHistory(history, { ...result.history!, id: String(index) });
    }
    expect(history).toHaveLength(20);
    expect(elapsedRunMs(result.session)).toBe(600_000);
  });
});

describe('application release parsing', () => {
  it('compares semantic versions', () => {
    expect(compareVersions('0.2.0', '0.1.9')).toBe(1);
    expect(isNewerVersion('1.0.0', '1.0.0')).toBe(false);
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(-1);
  });

  it('requires the exact NSIS setup asset', () => {
    const release = parseLatestRelease({
      tag_name: 'v0.2.0',
      name: 'ExileQuesting v0.2.0',
      body: 'Overlay improvements',
      draft: false,
      prerelease: false,
      published_at: '2026-09-01T10:00:00Z',
      assets: [{ id: 1, name: 'ExileQuesting-0.2.0-setup.exe', size: 123, browser_download_url: 'https://github.com/Stoffe101/ExileQuesting/releases/download/v0.2.0/ExileQuesting-0.2.0-setup.exe', digest: `sha256:${'a'.repeat(64)}` }],
    });
    expect(release?.version).toBe('0.2.0');
    expect(release?.setupAsset.name).toContain('setup.exe');
    expect(parseSha256Digest(release?.setupAsset.digest)).toBe('a'.repeat(64));
  });

  it('rejects releases without a setup installer', () => {
    expect(parseLatestRelease({ tag_name: 'v0.2.0', assets: [] })).toBeNull();
  });
});

describe('permanent reward audit', () => {
  it('distinguishes route-passed from explicitly confirmed rewards', () => {
    const audit = buildRewardAudit(dataset, 3, new Set(['passive-a']));
    const passiveA = audit.items.find((item) => item.stepId === 'passive-a');
    const trialA = audit.items.find((item) => item.stepId === 'trial-a');
    const passiveB = audit.items.find((item) => item.stepId === 'passive-b');
    expect(passiveA?.status).toBe('confirmed');
    expect(trialA?.status).toBe('route-passed');
    expect(passiveB?.status).toBe('pending');
    expect(audit.passive.confirmed).toBe(1);
  });
});
