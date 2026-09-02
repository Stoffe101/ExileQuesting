import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateGameDataManifest, type GameDataManifest, type GameDataManifestEntry } from '../src/core/game-data-manifest';
import { validateGemAcquisitionSnapshot } from '../src/core/gem-data';
import { validatePassiveTreeSnapshot } from '../src/core/passive-data';

const ROOT = path.resolve('assets/game-data');
const MANIFEST_FILE = path.join(ROOT, 'manifest.json');
const GEM_FILE = 'gem-acquisition-3.29.json';
const PASSIVE_FILE = 'passive-tree-3.29.json';

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex');
}

async function existingManifest(): Promise<GameDataManifest | undefined> {
  try {
    return validateGameDataManifest(JSON.parse(await fs.readFile(MANIFEST_FILE, 'utf8')) as unknown) ?? undefined;
  } catch {
    return undefined;
  }
}

function nextRevision(existing: GameDataManifest | undefined, id: GameDataManifestEntry['id'], checksum: string): number {
  const previous = existing?.datasets.find((entry) => entry.id === id);
  if (!previous) return 1;
  return previous.checksum.value === checksum ? previous.datasetRevision : previous.datasetRevision + 1;
}

async function gemEntry(existing: GameDataManifest | undefined): Promise<GameDataManifestEntry> {
  const raw = await fs.readFile(path.join(ROOT, GEM_FILE), 'utf8');
  const snapshot = validateGemAcquisitionSnapshot(JSON.parse(raw) as unknown);
  if (!snapshot) throw new Error('Cannot generate manifest: bundled gem acquisition data is invalid.');
  const checksum = sha256(raw);
  return {
    id: 'gem-acquisition',
    datasetRevision: nextRevision(existing, 'gem-acquisition', checksum),
    file: GEM_FILE,
    schemaVersion: snapshot.schemaVersion,
    gameVersion: snapshot.gameVersion,
    generatedAt: snapshot.generatedAt,
    sizeBytes: Buffer.byteLength(raw, 'utf8'),
    checksum: { algorithm: 'sha256', scope: 'file', value: checksum },
    source: {
      kind: 'git',
      url: `https://github.com/${snapshot.source.repository}`,
      repository: snapshot.source.repository,
      revision: snapshot.source.commit,
      license: snapshot.source.license,
      paths: [snapshot.source.gemsPath, snapshot.source.questsPath, snapshot.source.charactersPath],
    },
  };
}

async function passiveEntry(existing: GameDataManifest | undefined): Promise<GameDataManifestEntry> {
  const raw = await fs.readFile(path.join(ROOT, PASSIVE_FILE), 'utf8');
  const snapshot = validatePassiveTreeSnapshot(JSON.parse(raw) as unknown);
  if (!snapshot) throw new Error('Cannot generate manifest: bundled passive tree data is invalid.');
  const checksum = sha256(raw);
  return {
    id: 'passive-tree',
    datasetRevision: nextRevision(existing, 'passive-tree', checksum),
    file: PASSIVE_FILE,
    schemaVersion: snapshot.schemaVersion,
    gameVersion: snapshot.gameVersion,
    generatedAt: snapshot.generatedAt,
    sizeBytes: Buffer.byteLength(raw, 'utf8'),
    checksum: { algorithm: 'sha256', scope: 'file', value: checksum },
    source: {
      kind: 'url',
      url: snapshot.source.url,
      revision: snapshot.source.sha256,
      paths: [],
    },
  };
}

async function main(): Promise<void> {
  const checkOnly = process.argv.includes('--check');
  const existing = await existingManifest();
  const manifest: GameDataManifest = {
    schemaVersion: 1,
    datasets: [await gemEntry(existing), await passiveEntry(existing)],
  };
  if (!validateGameDataManifest(manifest)) throw new Error('Generated game-data manifest failed its own schema validation.');
  const content = `${JSON.stringify(manifest, null, 2)}\n`;

  if (checkOnly) {
    let current = '';
    try { current = await fs.readFile(MANIFEST_FILE, 'utf8'); } catch { /* reported below */ }
    if (current !== content) {
      const expected = manifest.datasets.map((entry) => `${entry.id}=r${entry.datasetRevision}:${entry.checksum.value}`).join(', ');
      throw new Error(`Bundled game-data manifest is stale or missing. Run npm run data:manifest. Expected ${expected}`);
    }
    console.log(`Game-data manifest verified: ${manifest.datasets.map((entry) => `${entry.id} r${entry.datasetRevision} ${entry.checksum.value.slice(0, 12)}`).join(' · ')}`);
    return;
  }

  await fs.writeFile(MANIFEST_FILE, content, 'utf8');
  console.log(`Wrote ${MANIFEST_FILE}`);
  for (const entry of manifest.datasets) {
    console.log(`${entry.id} r${entry.datasetRevision} · PoE ${entry.gameVersion} · ${entry.sizeBytes} bytes · SHA-256 ${entry.checksum.value}`);
  }
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
