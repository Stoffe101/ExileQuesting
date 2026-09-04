import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { basename, relative, resolve } from 'node:path';

export const POB_PARITY_FIXTURES = [
  'spec/TestBuilds/3.13/OccVortex.xml',
  'spec/TestBuilds/3.13/Dual Wield Cospris CoC.xml',
  'spec/TestBuilds/3.13/Mirage Archer Toxic Rain.xml',
] as const;

export interface CurrentParityFixture {
  sourceFixture: string;
  relativePath: string;
  absolutePath: string;
  xml: string;
}

/**
 * Upstream PoB currently only ships its long-lived parity fixtures from older
 * passive-tree generations. ExileQuesting's embedded calculator intentionally
 * supports the standard 3.29 passive tree only. For parity we retain each
 * fixture's items, gems, flasks, configuration and passive node IDs, but ask
 * the same pinned PoB checkout to interpret every passive-tree spec against its
 * current 3.29 tree. Both the independent raw reference and the ExileQuesting
 * worker receive this exact same materialized XML, so the parity oracle remains
 * independent and apples-to-apples.
 *
 * Reports keep the upstream fixture name for provenance while calculations run
 * exclusively against the materialized standard 3.29 passive-tree version.
 */
export async function materializeCurrentParityFixture(
  pobRoot: string,
  sourceFixture: string,
): Promise<CurrentParityFixture> {
  const sourcePath = resolve(pobRoot, sourceFixture);
  const sourceXml = await readFile(sourcePath, 'utf8');
  const sourceVersions = [...sourceXml.matchAll(/treeVersion="([^"]+)"/g)].map((match) => match[1]);
  if (sourceVersions.length === 0) {
    throw new Error(`${sourceFixture}: PoB parity fixture contains no passive-tree version.`);
  }
  if (sourceVersions.some((version) => version === '3_29')) {
    throw new Error(`${sourceFixture}: source fixture unexpectedly already contains the shipped 3_29 tree; refresh the parity provenance instead of normalizing it again.`);
  }

  const xml = sourceXml.replace(/treeVersion="[^"]+"/g, 'treeVersion="3_29"');
  const currentVersions = [...xml.matchAll(/treeVersion="([^"]+)"/g)].map((match) => match[1]);
  if (currentVersions.length !== sourceVersions.length || currentVersions.some((version) => version !== '3_29')) {
    throw new Error(`${sourceFixture}: failed to materialize an exclusively 3.29 parity fixture.`);
  }

  const outputDir = resolve(pobRoot, '.exilequesting-parity');
  await mkdir(outputDir, { recursive: true });
  const absolutePath = resolve(outputDir, basename(sourceFixture));
  await writeFile(absolutePath, xml, 'utf8');

  return {
    sourceFixture,
    relativePath: relative(pobRoot, absolutePath).replaceAll('\\', '/'),
    absolutePath,
    xml,
  };
}
