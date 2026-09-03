import { describe, expect, it } from 'vitest';
import { mergeBuildKnowledgeCorpusShards } from './build-knowledge-corpus';
import type { BuildKnowledgeCorpus } from './build-knowledge';

function emptyCorpus(generatedAt: string, schemaVersion = 1): BuildKnowledgeCorpus {
  return {
    schemaVersion,
    generatedAt,
    sources: [],
    cases: [],
    assertions: [],
  };
}

describe('build knowledge corpus shards', () => {
  it('merges shards deterministically and keeps the newest generation timestamp', () => {
    const first = emptyCorpus('2026-09-02T23:00:00Z');
    first.sources.push({
      id: 'source-a',
      kind: 'official-docs',
      title: 'A',
      patches: ['3.29'],
      usePolicy: 'official',
      firstReviewedAt: '2026-09-02T23:00:00Z',
      lastReviewedAt: '2026-09-02T23:00:00Z',
    });
    const second = emptyCorpus('2026-09-03T02:00:00Z');
    second.assertions.push({
      id: 'assertion-b',
      summary: 'B',
      sourceIds: ['source-a'],
      patches: ['3.29'],
      confidence: 'deterministic',
    });

    const merged = mergeBuildKnowledgeCorpusShards([
      { path: 'z.json', corpus: second },
      { path: 'a.json', corpus: first },
    ]);

    expect(merged.corpus.generatedAt).toBe('2026-09-03T02:00:00Z');
    expect(merged.corpus.sources).toHaveLength(1);
    expect(merged.corpus.assertions).toHaveLength(1);
    expect(merged.shardPaths).toEqual(['a.json', 'z.json']);
  });

  it('refuses mixed schema versions', () => {
    expect(() => mergeBuildKnowledgeCorpusShards([
      { path: 'one.json', corpus: emptyCorpus('2026-09-03T01:00:00Z', 1) },
      { path: 'two.json', corpus: emptyCorpus('2026-09-03T01:00:00Z', 2) },
    ])).toThrow(/uses schema 2; expected 1/);
  });

  it('requires at least one shard', () => {
    expect(() => mergeBuildKnowledgeCorpusShards([])).toThrow(/At least one/);
  });
});
