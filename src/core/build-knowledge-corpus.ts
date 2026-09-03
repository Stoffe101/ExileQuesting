import type { BuildKnowledgeCorpus } from './build-knowledge';

export interface BuildKnowledgeCorpusShard {
  path: string;
  corpus: BuildKnowledgeCorpus;
}

export interface MergedBuildKnowledgeCorpus {
  corpus: BuildKnowledgeCorpus;
  shardPaths: string[];
}

function newestIso(values: string[]): string {
  return values.reduce((latest, value) => value > latest ? value : latest, values[0] ?? '1970-01-01T00:00:00Z');
}

export function mergeBuildKnowledgeCorpusShards(shards: BuildKnowledgeCorpusShard[]): MergedBuildKnowledgeCorpus {
  if (!shards.length) throw new Error('At least one build-knowledge corpus shard is required.');

  const schemaVersion = shards[0].corpus.schemaVersion;
  for (const shard of shards) {
    if (shard.corpus.schemaVersion !== schemaVersion) {
      throw new Error(`Build-knowledge shard ${shard.path} uses schema ${shard.corpus.schemaVersion}; expected ${schemaVersion}.`);
    }
  }

  return {
    corpus: {
      schemaVersion,
      generatedAt: newestIso(shards.map((shard) => shard.corpus.generatedAt)),
      sources: shards.flatMap((shard) => shard.corpus.sources),
      cases: shards.flatMap((shard) => shard.corpus.cases),
      assertions: shards.flatMap((shard) => shard.corpus.assertions),
    },
    shardPaths: shards.map((shard) => shard.path).sort(),
  };
}
