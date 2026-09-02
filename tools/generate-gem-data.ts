import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { buildGemAcquisitionSnapshot } from '../src/core/gem-data-import';

const SOURCE_REPOSITORY = 'HeartofPhos/exile-leveling';
const SOURCE_COMMIT = 'b7b2dd0ed62ae25cf55c74085fa64a1f4d7cf4ba';
const GAME_VERSION = '3.29';
const GENERATED_AT = '2026-09-02T00:00:00.000Z';
const OUTPUT_PATH = path.resolve('assets/game-data/gem-acquisition-3.29.json');
const SOURCE_PATHS = {
  gems: 'common/data/json/gems.json',
  quests: 'common/data/json/quests.json',
  characters: 'common/data/json/characters.json',
};

async function fetchJson(relativePath: string, maxBytes: number): Promise<unknown> {
  const url = `https://raw.githubusercontent.com/${SOURCE_REPOSITORY}/${SOURCE_COMMIT}/${relativePath}`;
  const response = await fetch(url, {
    headers: { 'User-Agent': 'ExileQuesting-game-data-generator' },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} while fetching ${relativePath}`);
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`${relativePath} exceeds the ${maxBytes}-byte source limit.`);
  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.byteLength > maxBytes) throw new Error(`${relativePath} exceeds the ${maxBytes}-byte source limit.`);
  return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');
  const [gems, quests, characters] = await Promise.all([
    fetchJson(SOURCE_PATHS.gems, 2 * 1024 * 1024),
    fetchJson(SOURCE_PATHS.quests, 4 * 1024 * 1024),
    fetchJson(SOURCE_PATHS.characters, 64 * 1024),
  ]);

  // buildGemAcquisitionSnapshot intentionally keeps only player-acquirable gem records referenced
  // by real acquisition offers or character starts. The pinned upstream source also contains many
  // internal/DNT definitions that are useful to upstream tooling but not to ExileQuesting runtime.
  const snapshot = buildGemAcquisitionSnapshot(gems, quests, characters, {
    gameVersion: GAME_VERSION,
    generatedAt: GENERATED_AT,
    source: {
      repository: SOURCE_REPOSITORY,
      commit: SOURCE_COMMIT,
      license: 'MIT',
      gemsPath: SOURCE_PATHS.gems,
      questsPath: SOURCE_PATHS.quests,
      charactersPath: SOURCE_PATHS.characters,
    },
  });
  const content = `${JSON.stringify(snapshot, null, 2)}\n`;
  const digest = createHash('sha256').update(content).digest('hex');

  if (checkOnly) {
    const existing = await fs.readFile(OUTPUT_PATH, 'utf8');
    if (existing !== content) throw new Error(`Bundled gem snapshot is stale. Run npm run data:gems. Expected SHA-256 ${digest}.`);
    console.log(`Gem snapshot verified: ${snapshot.gems.length} player-acquirable gems, ${snapshot.offers.length} acquisition offers, SHA-256 ${digest}`);
    return;
  }

  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, content, 'utf8');
  console.log(`Wrote ${OUTPUT_PATH}`);
  console.log(`PoE ${GAME_VERSION}: ${snapshot.gems.length} player-acquirable gems, ${snapshot.offers.length} acquisition offers`);
  console.log(`Source ${SOURCE_REPOSITORY}@${SOURCE_COMMIT}`);
  console.log(`SHA-256 ${digest}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
