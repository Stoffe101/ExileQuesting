import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { gameDataManifestEntry, validateGameDataManifest, type GameDataManifest, type GameDataManifestEntry, type GameDataDatasetId } from '../../src/core/game-data-manifest';
import { validateGemAcquisitionSnapshot, type GemAcquisitionSnapshot } from '../../src/core/gem-data';
import { validatePassiveTreeSnapshot, type PassiveTreeSnapshot } from '../../src/core/passive-data';

export interface GameDataLoadResult {
  snapshot?: GemAcquisitionSnapshot;
  path: string;
  status: 'ready' | 'missing' | 'invalid';
  message: string;
  datasetRevision?: number;
  checksum?: string;
}

export interface PassiveDataLoadResult {
  snapshot?: PassiveTreeSnapshot;
  path: string;
  status: 'ready' | 'missing' | 'invalid';
  message: string;
  datasetRevision?: number;
  checksum?: string;
}

export interface GameDataManifestLoadResult {
  manifest?: GameDataManifest;
  path: string;
  status: 'ready' | 'missing' | 'invalid';
  message: string;
}

export interface BundledGameDataResult {
  manifest: GameDataManifestLoadResult;
  gems: GameDataLoadResult;
  passives: PassiveDataLoadResult;
}

export interface GameDataLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

export interface BundledGameDataPaths {
  manifest: string;
  gems: string;
  passives: string;
}

const GAME_DATA_MANIFEST_FILE = 'manifest.json';
const GEM_SNAPSHOT_FILE = 'gem-acquisition-3.29.json';
const PASSIVE_SNAPSHOT_FILE = 'passive-tree-3.29.json';
const MAX_GAME_DATA_MANIFEST_BYTES = 64 * 1024;
const MAX_BUNDLED_GEM_DATA_BYTES = 4 * 1024 * 1024;
const MAX_BUNDLED_PASSIVE_DATA_BYTES = 8 * 1024 * 1024;

type ResourceOptions = { packaged: boolean; resourcesPath: string; appPath: string };

function gameDataRoot(options: ResourceOptions): string {
  return options.packaged ? path.join(options.resourcesPath, 'game-data') : path.join(options.appPath, 'assets', 'game-data');
}

export function bundledGameDataManifestPath(options: ResourceOptions): string {
  return path.join(gameDataRoot(options), GAME_DATA_MANIFEST_FILE);
}

export function bundledGemDataPath(options: ResourceOptions): string {
  return path.join(gameDataRoot(options), GEM_SNAPSHOT_FILE);
}

export function bundledPassiveDataPath(options: ResourceOptions): string {
  return path.join(gameDataRoot(options), PASSIVE_SNAPSHOT_FILE);
}

export function bundledGameDataPaths(options: ResourceOptions): BundledGameDataPaths {
  return {
    manifest: bundledGameDataManifestPath(options),
    gems: bundledGemDataPath(options),
    passives: bundledPassiveDataPath(options),
  };
}

function errorCode(error: unknown): string {
  return error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
}

function fileSha256(raw: string): string {
  return createHash('sha256').update(raw, 'utf8').digest('hex');
}

function verifyManifestFile(entry: GameDataManifestEntry, filePath: string, raw: string, sizeBytes: number): void {
  if (path.basename(filePath) !== entry.file) throw new Error(`manifest file mismatch (expected ${entry.file}, received ${path.basename(filePath)})`);
  if (sizeBytes !== entry.sizeBytes || Buffer.byteLength(raw, 'utf8') !== entry.sizeBytes) {
    throw new Error(`manifest size mismatch (expected ${entry.sizeBytes} bytes, received ${sizeBytes})`);
  }
  const checksum = fileSha256(raw);
  if (checksum !== entry.checksum.value) throw new Error(`manifest checksum mismatch (expected ${entry.checksum.value}, calculated ${checksum})`);
}

function verifyCommonMetadata(entry: GameDataManifestEntry, snapshot: { schemaVersion: number; gameVersion: string; generatedAt: string }): void {
  if (snapshot.schemaVersion !== entry.schemaVersion) throw new Error(`manifest schema mismatch (expected ${entry.schemaVersion}, received ${snapshot.schemaVersion})`);
  if (snapshot.gameVersion !== entry.gameVersion) throw new Error(`manifest game-version mismatch (expected ${entry.gameVersion}, received ${snapshot.gameVersion})`);
  if (snapshot.generatedAt !== entry.generatedAt) throw new Error(`manifest generated-at mismatch (expected ${entry.generatedAt}, received ${snapshot.generatedAt})`);
}

function samePaths(left: string[], right: string[]): boolean {
  if (left.length !== right.length) return false;
  const expected = [...left].sort();
  const actual = [...right].sort();
  return expected.every((value, index) => value === actual[index]);
}

function canonicalFileFor(id: GameDataDatasetId): string {
  return id === 'gem-acquisition' ? GEM_SNAPSHOT_FILE : PASSIVE_SNAPSHOT_FILE;
}

function verifyPassiveSourceProvenance(entry: GameDataManifestEntry, snapshot: PassiveTreeSnapshot): void {
  const repository = snapshot.source.repository;
  const commit = snapshot.source.commit;
  const sourcePath = snapshot.source.path;
  const carriesGitIdentity = Boolean(repository || commit || sourcePath);

  if (carriesGitIdentity) {
    if (!repository || !commit || !sourcePath) throw new Error('passive snapshot contains incomplete git provenance');
    const expectedRepositoryUrl = new URL(`https://github.com/${repository}`).toString();
    const expectedRawUrl = new URL(`https://raw.githubusercontent.com/${repository}/${commit}/${sourcePath}`).toString();
    if (new URL(snapshot.source.url).toString() !== expectedRawUrl) throw new Error('passive snapshot source URL does not match its git provenance');
    if (entry.source.kind !== 'git'
      || entry.source.url !== expectedRepositoryUrl
      || entry.source.repository !== repository
      || entry.source.revision !== commit
      || !samePaths(entry.source.paths, [sourcePath])) {
      throw new Error('manifest source provenance does not match the passive snapshot git source');
    }
    return;
  }

  if (entry.source.kind !== 'url'
    || entry.source.url !== new URL(snapshot.source.url).toString()
    || (entry.source.revision && entry.source.revision !== snapshot.source.sha256)
    || entry.source.paths.length !== 0) {
    throw new Error('manifest source provenance does not match the passive snapshot URL source');
  }
}

export async function loadGameDataManifest(filePath: string, log?: GameDataLogger): Promise<GameDataManifestLoadResult> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      const result: GameDataManifestLoadResult = { path: filePath, status: 'missing', message: 'Bundled game-data manifest is missing.' };
      log?.warn(result.message, { path: filePath });
      return result;
    }
    const result: GameDataManifestLoadResult = { path: filePath, status: 'invalid', message: `Could not inspect bundled game-data manifest: ${String(error)}` };
    log?.warn(result.message, { path: filePath });
    return result;
  }

  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_GAME_DATA_MANIFEST_BYTES) {
    const result: GameDataManifestLoadResult = { path: filePath, status: 'invalid', message: `Bundled game-data manifest has an invalid file size (${stat.size} bytes).` };
    log?.warn(result.message, { path: filePath });
    return result;
  }

  try {
    const manifest = validateGameDataManifest(JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown);
    if (!manifest) throw new Error('schema validation failed');
    if (!gameDataManifestEntry(manifest, 'gem-acquisition') || !gameDataManifestEntry(manifest, 'passive-tree')) throw new Error('required dataset entries are missing');
    log?.info('Loaded bundled game-data manifest.', {
      path: filePath,
      datasets: manifest.datasets.map((entry) => ({ id: entry.id, revision: entry.datasetRevision, checksum: entry.checksum.value })),
    });
    return { manifest, path: filePath, status: 'ready', message: `Game-data manifest ready with ${manifest.datasets.length} verified dataset definitions.` };
  } catch (error) {
    const result: GameDataManifestLoadResult = { path: filePath, status: 'invalid', message: `Bundled game-data manifest is corrupt or incompatible: ${String(error)}` };
    log?.warn(result.message, { path: filePath });
    return result;
  }
}

async function manifestEntryFor(filePath: string, id: GameDataDatasetId, provided: GameDataManifestEntry | undefined, log?: GameDataLogger): Promise<GameDataManifestEntry | undefined> {
  if (provided) return provided;
  if (path.basename(filePath) !== canonicalFileFor(id)) return undefined;
  const manifestPath = path.join(path.dirname(filePath), GAME_DATA_MANIFEST_FILE);
  const result = await loadGameDataManifest(manifestPath, log);
  if (!result.manifest) throw new Error(`required adjacent game-data manifest unavailable: ${result.message}`);
  const entry = gameDataManifestEntry(result.manifest, id);
  if (!entry) throw new Error(`required ${id} entry is missing from the adjacent game-data manifest`);
  return entry;
}

export async function loadGemAcquisitionSnapshot(filePath: string, log?: GameDataLogger, manifestEntry?: GameDataManifestEntry): Promise<GameDataLoadResult> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      const result: GameDataLoadResult = { path: filePath, status: 'missing', message: 'Bundled gem acquisition data is missing.' };
      log?.warn(result.message, { path: filePath });
      return result;
    }
    const result: GameDataLoadResult = { path: filePath, status: 'invalid', message: `Could not inspect bundled gem acquisition data: ${String(error)}` };
    log?.warn(result.message, { path: filePath });
    return result;
  }

  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BUNDLED_GEM_DATA_BYTES) {
    const result: GameDataLoadResult = { path: filePath, status: 'invalid', message: `Bundled gem acquisition data has an invalid file size (${stat.size} bytes).` };
    log?.warn(result.message, { path: filePath });
    return result;
  }

  try {
    const effectiveManifestEntry = await manifestEntryFor(filePath, 'gem-acquisition', manifestEntry, log);
    const raw = await fs.readFile(filePath, 'utf8');
    if (effectiveManifestEntry) {
      if (effectiveManifestEntry.id !== 'gem-acquisition') throw new Error(`wrong manifest dataset id ${effectiveManifestEntry.id}`);
      verifyManifestFile(effectiveManifestEntry, filePath, raw, stat.size);
    }
    const snapshot = validateGemAcquisitionSnapshot(JSON.parse(raw) as unknown);
    if (!snapshot) throw new Error('schema validation failed');
    if (effectiveManifestEntry) {
      verifyCommonMetadata(effectiveManifestEntry, snapshot);
      if (effectiveManifestEntry.source.kind !== 'git'
        || effectiveManifestEntry.source.repository !== snapshot.source.repository
        || effectiveManifestEntry.source.revision !== snapshot.source.commit
        || effectiveManifestEntry.source.license !== snapshot.source.license
        || !samePaths(effectiveManifestEntry.source.paths, [snapshot.source.gemsPath, snapshot.source.questsPath, snapshot.source.charactersPath])) {
        throw new Error('manifest source provenance does not match the gem snapshot');
      }
    }
    log?.info('Loaded bundled gem acquisition data.', {
      path: filePath,
      gameVersion: snapshot.gameVersion,
      datasetRevision: effectiveManifestEntry?.datasetRevision,
      checksum: effectiveManifestEntry?.checksum.value,
      sourceRepository: snapshot.source.repository,
      sourceCommit: snapshot.source.commit,
      gems: snapshot.gems.length,
      offers: snapshot.offers.length,
    });
    return {
      snapshot,
      path: filePath,
      status: 'ready',
      message: `PoE ${snapshot.gameVersion} gem data${effectiveManifestEntry ? ` r${effectiveManifestEntry.datasetRevision}` : ''} ready from ${snapshot.source.repository}@${snapshot.source.commit.slice(0, 12)}.`,
      datasetRevision: effectiveManifestEntry?.datasetRevision,
      checksum: effectiveManifestEntry?.checksum.value,
    };
  } catch (error) {
    const result: GameDataLoadResult = { path: filePath, status: 'invalid', message: `Bundled gem acquisition data is corrupt or incompatible: ${String(error)}` };
    log?.warn(result.message, { path: filePath });
    return result;
  }
}

function passiveChecksum(snapshot: PassiveTreeSnapshot): string {
  return createHash('sha256').update(JSON.stringify(snapshot.nodes)).digest('hex');
}

export async function loadPassiveTreeSnapshot(filePath: string, log?: GameDataLogger, manifestEntry?: GameDataManifestEntry): Promise<PassiveDataLoadResult> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    if (errorCode(error) === 'ENOENT') {
      const result: PassiveDataLoadResult = { path: filePath, status: 'missing', message: 'Bundled passive tree data is missing.' };
      log?.warn(result.message, { path: filePath });
      return result;
    }
    const result: PassiveDataLoadResult = { path: filePath, status: 'invalid', message: `Could not inspect bundled passive tree data: ${String(error)}` };
    log?.warn(result.message, { path: filePath });
    return result;
  }

  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BUNDLED_PASSIVE_DATA_BYTES) {
    const result: PassiveDataLoadResult = { path: filePath, status: 'invalid', message: `Bundled passive tree data has an invalid file size (${stat.size} bytes).` };
    log?.warn(result.message, { path: filePath });
    return result;
  }

  try {
    const effectiveManifestEntry = await manifestEntryFor(filePath, 'passive-tree', manifestEntry, log);
    const raw = await fs.readFile(filePath, 'utf8');
    if (effectiveManifestEntry) {
      if (effectiveManifestEntry.id !== 'passive-tree') throw new Error(`wrong manifest dataset id ${effectiveManifestEntry.id}`);
      verifyManifestFile(effectiveManifestEntry, filePath, raw, stat.size);
    }
    const snapshot = validatePassiveTreeSnapshot(JSON.parse(raw) as unknown);
    if (!snapshot) throw new Error('schema validation failed');
    const calculatedChecksum = passiveChecksum(snapshot);
    if (calculatedChecksum !== snapshot.source.sha256) throw new Error(`payload checksum mismatch (expected ${snapshot.source.sha256}, calculated ${calculatedChecksum})`);
    if (effectiveManifestEntry) {
      verifyCommonMetadata(effectiveManifestEntry, snapshot);
      verifyPassiveSourceProvenance(effectiveManifestEntry, snapshot);
    }
    log?.info('Loaded bundled passive tree data.', {
      path: filePath,
      gameVersion: snapshot.gameVersion,
      datasetRevision: effectiveManifestEntry?.datasetRevision,
      fileChecksum: effectiveManifestEntry?.checksum.value,
      payloadChecksum: snapshot.source.sha256,
      nodes: snapshot.nodes.length,
    });
    return {
      snapshot,
      path: filePath,
      status: 'ready',
      message: `PoE ${snapshot.gameVersion} passive tree${effectiveManifestEntry ? ` r${effectiveManifestEntry.datasetRevision}` : ''} ready with ${snapshot.nodes.length} named nodes.`,
      datasetRevision: effectiveManifestEntry?.datasetRevision,
      checksum: effectiveManifestEntry?.checksum.value,
    };
  } catch (error) {
    const result: PassiveDataLoadResult = { path: filePath, status: 'invalid', message: `Bundled passive tree data is corrupt or incompatible: ${String(error)}` };
    log?.warn(result.message, { path: filePath });
    return result;
  }
}

export async function loadBundledGameData(options: ResourceOptions, log?: GameDataLogger): Promise<BundledGameDataResult> {
  const paths = bundledGameDataPaths(options);
  const manifest = await loadGameDataManifest(paths.manifest, log);
  if (!manifest.manifest) {
    const reason = `Game-data manifest unavailable: ${manifest.message}`;
    return {
      manifest,
      gems: { path: paths.gems, status: 'invalid', message: reason },
      passives: { path: paths.passives, status: 'invalid', message: reason },
    };
  }
  const gemEntry = gameDataManifestEntry(manifest.manifest, 'gem-acquisition');
  const passiveEntry = gameDataManifestEntry(manifest.manifest, 'passive-tree');
  if (!gemEntry || !passiveEntry) {
    const reason = 'Game-data manifest is missing one or more required dataset definitions.';
    return {
      manifest: { ...manifest, status: 'invalid', message: reason },
      gems: { path: paths.gems, status: 'invalid', message: reason },
      passives: { path: paths.passives, status: 'invalid', message: reason },
    };
  }
  const [gems, passives] = await Promise.all([
    loadGemAcquisitionSnapshot(paths.gems, log, gemEntry),
    loadPassiveTreeSnapshot(paths.passives, log, passiveEntry),
  ]);
  return { manifest, gems, passives };
}
