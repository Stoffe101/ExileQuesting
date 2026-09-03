import { isMobalyticsBuildUrl } from '../../src/core/mobalytics';
import { describePobInput, parsePobInput, parsePobXml, type PobBuildSummary, type PobInputKind } from '../../src/core/pob';
import { isAllowedDataUrl, MAX_POBBIN_RAW_BYTES, readBoundedResponseText } from '../../src/core/security';

export interface ImportedPobBuild {
  id: string;
  importedAt: string;
  sourceKind: PobInputKind;
  source?: string;
  build: PobBuildSummary;
}

export const MOBALYTICS_POB_BRIDGE_MESSAGE = 'Mobalytics currently blocks reliable direct app fetching. Open the build in your browser, copy its Path of Building or POBb.in export, then paste that export into ExileQuesting. It will use the normal hardened PoB importer.';

export async function importPobBuild(input: string, appVersion: string): Promise<ImportedPobBuild> {
  if (isMobalyticsBuildUrl(input.trim())) throw new Error(MOBALYTICS_POB_BRIDGE_MESSAGE);
  const descriptor = describePobInput(input);
  let build: PobBuildSummary;
  if (descriptor.kind === 'pobbin') {
    if (!descriptor.pobbinRawUrl || !isAllowedDataUrl(descriptor.pobbinRawUrl)) throw new Error('The pobb.in raw URL failed the data-source allowlist.');
    const response = await fetch(descriptor.pobbinRawUrl, {
      headers: { 'User-Agent': `ExileQuesting/${appVersion} (github.com/Stoffe101/ExileQuesting)` },
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) throw new Error(`pobb.in returned HTTP ${response.status}.`);
    const raw = (await readBoundedResponseText(response, MAX_POBBIN_RAW_BYTES)).trim();
    if (!raw) throw new Error('pobb.in returned an empty build.');
    const parsed = await parsePobInput(raw);
    if (!parsed.build) throw new Error('pobb.in raw data did not resolve to a Path of Building build.');
    build = parsed.build;
  } else if (descriptor.kind === 'xml') {
    build = parsePobXml(descriptor.value);
  } else {
    const parsed = await parsePobInput(descriptor.value);
    if (!parsed.build) throw new Error('PoB export code did not produce a build.');
    build = parsed.build;
  }
  const importedAt = new Date().toISOString();
  const identity = `${build.className ?? 'Unknown'}:${build.ascendancy ?? ''}:${build.level ?? 0}:${importedAt}`;
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) { hash ^= identity.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return {
    id: `pob-${(hash >>> 0).toString(36)}`,
    importedAt,
    sourceKind: descriptor.kind,
    source: descriptor.kind === 'pobbin' ? descriptor.value : undefined,
    build,
  };
}
