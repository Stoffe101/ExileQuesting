import { readdir, readFile } from 'node:fs/promises';
import { extname, join, relative, resolve } from 'node:path';
import {
  BUILD_CONTENT_TARGETS,
  BUILD_DEFENCE_LAYERS,
  BUILD_DELIVERY_METHODS,
  BUILD_PLAYSTYLE_TRAITS,
  BUILD_SCALING_AXES,
  buildKnowledgeCoverage,
  uncoveredKnowledgeDimensions,
  validateBuildKnowledgeCorpus,
  type BuildKnowledgeCorpus,
} from '../src/core/build-knowledge';
import { mergeBuildKnowledgeCorpusShards, type BuildKnowledgeCorpusShard } from '../src/core/build-knowledge-corpus';

const corpusRoot = resolve(process.cwd(), 'research/endgame-build-corpus');

function line(label: string, value: unknown): void {
  console.log(`${label}: ${value}`);
}

function formatCoverage(values: readonly string[], counts: Record<string, number>): string {
  return values.map((value) => `${value}=${counts[value] ?? 0}`).join(', ');
}

async function jsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const absolute = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await jsonFiles(absolute));
    else if (entry.isFile() && extname(entry.name).toLowerCase() === '.json') files.push(absolute);
  }
  return files;
}

async function loadShards(): Promise<BuildKnowledgeCorpusShard[]> {
  const files = await jsonFiles(corpusRoot);
  const shards: BuildKnowledgeCorpusShard[] = [];
  for (const file of files) {
    const raw = await readFile(file, 'utf8');
    const corpus = JSON.parse(raw) as BuildKnowledgeCorpus;
    shards.push({ path: relative(process.cwd(), file).replaceAll('\\', '/'), corpus });
  }
  return shards;
}

async function main(): Promise<void> {
  const shards = await loadShards();
  const merged = mergeBuildKnowledgeCorpusShards(shards);
  const corpus = merged.corpus;
  const issues = validateBuildKnowledgeCorpus(corpus);
  if (issues.length) {
    console.error(`Build knowledge corpus failed validation (${issues.length} issue${issues.length === 1 ? '' : 's'} across ${merged.shardPaths.length} shards):`);
    for (const issue of issues) console.error(`- ${issue}`);
    process.exitCode = 1;
    return;
  }

  const coverage = buildKnowledgeCoverage(corpus);
  const missing = uncoveredKnowledgeDimensions(corpus);

  console.log('Endgame build knowledge corpus audit');
  line('Schema', corpus.schemaVersion);
  line('Shards', merged.shardPaths.length);
  for (const path of merged.shardPaths) console.log(`  - ${path}`);
  line('Generated', corpus.generatedAt);
  line('Sources', coverage.totalSources);
  line('Cases', coverage.totalCases);
  line('Assertions', coverage.totalAssertions);
  line('Patches', Object.entries(coverage.patches).map(([patch, count]) => `${patch}=${count}`).join(', ') || 'none');
  line('Case kinds', Object.entries(coverage.caseKinds).map(([kind, count]) => `${kind}=${count}`).join(', ') || 'none');
  line('Delivery', formatCoverage(BUILD_DELIVERY_METHODS, coverage.deliveryMethods));
  line('Scaling', formatCoverage(BUILD_SCALING_AXES, coverage.scalingAxes));
  line('Defence', formatCoverage(BUILD_DEFENCE_LAYERS, coverage.defenceLayers));
  line('Playstyle', formatCoverage(BUILD_PLAYSTYLE_TRAITS, coverage.playstyleTraits));
  line('Content', formatCoverage(BUILD_CONTENT_TARGETS, coverage.contentTargets));
  line('Uncovered dimensions', missing.length);

  if (missing.length) {
    console.log('Research gaps (advisory, not a CI failure yet):');
    for (const gap of missing) console.log(`- ${gap}`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
