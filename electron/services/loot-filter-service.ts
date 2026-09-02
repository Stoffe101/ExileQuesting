import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { renderLootFilter, type LootFilterPlan } from '../../src/core/loot-filter';

export interface LootFilterRuntimeState {
  basePath?: string;
  outputPath?: string;
  generatedAt?: string;
  fingerprint?: string;
  needsReload: boolean;
  status: 'unconfigured' | 'ready' | 'error';
  message: string;
}

const OUTPUT_FILE = 'ExileQuesting.filter';
const MAX_BASE_FILTER_BYTES = 8 * 1024 * 1024;

function fingerprint(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export async function validateBaseFilterPath(basePath: string): Promise<string> {
  const resolved = path.resolve(basePath);
  if (!resolved.toLowerCase().endsWith('.filter')) throw new Error('Choose a Path of Exile .filter file.');
  if (path.basename(resolved).toLowerCase() === OUTPUT_FILE.toLowerCase()) throw new Error('Choose your normal base filter, not ExileQuesting.filter.');
  const stat = await fs.stat(resolved);
  if (!stat.isFile() || stat.size <= 0 || stat.size > MAX_BASE_FILTER_BYTES) throw new Error('The selected base filter has an invalid size.');
  return resolved;
}

export async function writeBuildAwareLootFilter(basePath: string, plan: LootFilterPlan, previousFingerprint?: string): Promise<LootFilterRuntimeState> {
  try {
    const resolvedBase = await validateBaseFilterPath(basePath);
    const outputPath = path.join(path.dirname(resolvedBase), OUTPUT_FILE);
    const content = renderLootFilter(plan, path.basename(resolvedBase));
    const nextFingerprint = fingerprint(content);
    let existing = '';
    try { existing = await fs.readFile(outputPath, 'utf8'); } catch { /* first generation */ }
    if (existing !== content) {
      const temporary = `${outputPath}.${process.pid}.tmp`;
      await fs.writeFile(temporary, content, 'utf8');
      await fs.rename(temporary, outputPath);
    }
    const changed = nextFingerprint !== previousFingerprint;
    return {
      basePath: resolvedBase,
      outputPath,
      generatedAt: new Date().toISOString(),
      fingerprint: nextFingerprint,
      needsReload: changed,
      status: 'ready',
      message: changed
        ? 'Build-aware loot filter updated. Reload ExileQuesting.filter once in Path of Exile.'
        : 'Build-aware loot filter is already current.',
    };
  } catch (error) {
    return {
      basePath,
      needsReload: false,
      status: 'error',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}

export function unconfiguredLootFilterState(): LootFilterRuntimeState {
  return { needsReload: false, status: 'unconfigured', message: 'Choose your existing local loot filter to enable build-aware loot intelligence.' };
}
