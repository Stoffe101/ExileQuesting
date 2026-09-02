import { describe, expect, it } from 'vitest';
import { gameDataManifestEntry, validateGameDataManifest, type GameDataManifest } from './game-data-manifest';

const sha = 'a'.repeat(64);

function manifest(): GameDataManifest {
  return {
    schemaVersion: 1,
    datasets: [
      {
        id: 'gem-acquisition', datasetRevision: 1, file: 'gem-acquisition-3.29.json', schemaVersion: 1, gameVersion: '3.29',
        generatedAt: '2026-09-02T00:00:00.000Z', sizeBytes: 590486,
        checksum: { algorithm: 'sha256', scope: 'file', value: sha },
        source: {
          kind: 'git', url: 'https://github.com/HeartofPhos/exile-leveling', repository: 'HeartofPhos/exile-leveling', revision: 'b7b2dd0', license: 'MIT',
          paths: ['common/data/json/gems.json', 'common/data/json/quests.json'],
        },
      },
      {
        id: 'passive-tree', datasetRevision: 1, file: 'passive-tree-3.29.json', schemaVersion: 2, gameVersion: '3.29',
        generatedAt: '2026-09-02T00:00:00.000Z', sizeBytes: 1001907,
        checksum: { algorithm: 'sha256', scope: 'file', value: 'b'.repeat(64) },
        source: { kind: 'url', url: 'https://www.pathofexile.com/passive-skill-tree', paths: [] },
      },
    ],
  };
}

describe('game-data manifest', () => {
  it('accepts bounded versioned datasets and normalizes checksum case', () => {
    const input = manifest();
    input.datasets[0].checksum.value = 'A'.repeat(64);
    const parsed = validateGameDataManifest(input);
    expect(parsed).not.toBeNull();
    expect(parsed?.datasets[0].checksum.value).toBe(sha);
    expect(gameDataManifestEntry(parsed!, 'passive-tree')?.schemaVersion).toBe(2);
  });

  it('rejects duplicate dataset identities and files', () => {
    const duplicateId = manifest();
    duplicateId.datasets[1] = { ...duplicateId.datasets[1], id: 'gem-acquisition' };
    expect(validateGameDataManifest(duplicateId)).toBeNull();

    const duplicateFile = manifest();
    duplicateFile.datasets[1] = { ...duplicateFile.datasets[1], file: duplicateFile.datasets[0].file };
    expect(validateGameDataManifest(duplicateFile)).toBeNull();
  });

  it('rejects traversal, absolute paths, malformed checksums, and unsafe source URLs', () => {
    const traversal = manifest();
    traversal.datasets[0].file = '../gems.json';
    expect(validateGameDataManifest(traversal)).toBeNull();

    const absolute = manifest();
    absolute.datasets[0].source.paths = ['C:\\temp\\gems.json'];
    expect(validateGameDataManifest(absolute)).toBeNull();

    const checksum = manifest();
    checksum.datasets[0].checksum.value = '1234';
    expect(validateGameDataManifest(checksum)).toBeNull();

    const url = manifest();
    url.datasets[0].source.url = 'http://example.com/data';
    expect(validateGameDataManifest(url)).toBeNull();
  });

  it('requires git sources to carry a repository and revision while allowing official URL exports without a declared license', () => {
    const missingRevision = manifest();
    missingRevision.datasets[0].source.revision = undefined;
    expect(validateGameDataManifest(missingRevision)).toBeNull();

    const official = manifest();
    official.datasets[1].source = { kind: 'url', url: 'https://www.pathofexile.com/passive-skill-tree', paths: [] };
    expect(validateGameDataManifest(official)).not.toBeNull();
  });

  it('rejects invalid timestamps, zero revisions, and impossible sizes', () => {
    const timestamp = manifest();
    timestamp.datasets[0].generatedAt = 'not-a-date';
    expect(validateGameDataManifest(timestamp)).toBeNull();

    const revision = manifest();
    revision.datasets[0].datasetRevision = 0;
    expect(validateGameDataManifest(revision)).toBeNull();

    const size = manifest();
    size.datasets[0].sizeBytes = 0;
    expect(validateGameDataManifest(size)).toBeNull();
  });
});
