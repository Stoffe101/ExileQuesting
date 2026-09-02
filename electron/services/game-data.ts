import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateGemAcquisitionSnapshot, type GemAcquisitionSnapshot } from '../../src/core/gem-data';
import { validatePassiveTreeSnapshot, type PassiveTreeSnapshot } from '../../src/core/passive-data';

export interface GameDataLoadResult {
  snapshot?: GemAcquisitionSnapshot;
  path: string;
  status: 'ready' | 'missing' | 'invalid';
  message: string;
}

export interface PassiveDataLoadResult {
  snapshot?: PassiveTreeSnapshot;
  path: string;
  status: 'ready' | 'missing' | 'invalid';
  message: string;
}

export interface GameDataLogger {
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
}

const GEM_SNAPSHOT_FILE = 'gem-acquisition-3.29.json';
const PASSIVE_SNAPSHOT_FILE = 'passive-tree-3.29.json';
const MAX_BUNDLED_GEM_DATA_BYTES = 4 * 1024 * 1024;
const MAX_BUNDLED_PASSIVE_DATA_BYTES = 8 * 1024 * 1024;

export function bundledGemDataPath(options: { packaged: boolean; resourcesPath: string; appPath: string }): string {
  return options.packaged
    ? path.join(options.resourcesPath, 'game-data', GEM_SNAPSHOT_FILE)
    : path.join(options.appPath, 'assets', 'game-data', GEM_SNAPSHOT_FILE);
}

export function bundledPassiveDataPath(options: { packaged: boolean; resourcesPath: string; appPath: string }): string {
  return options.packaged
    ? path.join(options.resourcesPath, 'game-data', PASSIVE_SNAPSHOT_FILE)
    : path.join(options.appPath, 'assets', 'game-data', PASSIVE_SNAPSHOT_FILE);
}

export async function loadGemAcquisitionSnapshot(filePath: string, log?: GameDataLogger): Promise<GameDataLoadResult> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'ENOENT') {
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
    const raw = await fs.readFile(filePath, 'utf8');
    const snapshot = validateGemAcquisitionSnapshot(JSON.parse(raw) as unknown);
    if (!snapshot) throw new Error('schema validation failed');
    log?.info('Loaded bundled gem acquisition data.', {
      path: filePath,
      gameVersion: snapshot.gameVersion,
      sourceRepository: snapshot.source.repository,
      sourceCommit: snapshot.source.commit,
      gems: snapshot.gems.length,
      offers: snapshot.offers.length,
    });
    return {
      snapshot,
      path: filePath,
      status: 'ready',
      message: `PoE ${snapshot.gameVersion} gem data ready from ${snapshot.source.repository}@${snapshot.source.commit.slice(0, 12)}.`,
    };
  } catch (error) {
    const result: GameDataLoadResult = { path: filePath, status: 'invalid', message: `Bundled gem acquisition data is corrupt or incompatible: ${String(error)}` };
    log?.warn(result.message, { path: filePath });
    return result;
  }
}

export async function loadPassiveTreeSnapshot(filePath: string, log?: GameDataLogger): Promise<PassiveDataLoadResult> {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
    if (code === 'ENOENT') {
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
    const snapshot = validatePassiveTreeSnapshot(JSON.parse(await fs.readFile(filePath, 'utf8')) as unknown);
    if (!snapshot) throw new Error('schema validation failed');
    log?.info('Loaded bundled passive tree data.', { path: filePath, gameVersion: snapshot.gameVersion, nodes: snapshot.nodes.length, sha256: snapshot.source.sha256 });
    return {
      snapshot,
      path: filePath,
      status: 'ready',
      message: `PoE ${snapshot.gameVersion} passive tree ready with ${snapshot.nodes.length} named nodes.`,
    };
  } catch (error) {
    const result: PassiveDataLoadResult = { path: filePath, status: 'invalid', message: `Bundled passive tree data is corrupt or incompatible: ${String(error)}` };
    log?.warn(result.message, { path: filePath });
    return result;
  }
}
