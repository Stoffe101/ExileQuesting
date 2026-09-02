import { promises as fs } from 'node:fs';
import path from 'node:path';
import { validateGemAcquisitionSnapshot } from '../src/core/gem-data';

const FILE = path.resolve('assets/game-data/gem-acquisition-3.29.json');
const EXPECTED = {
  gameVersion: '3.29',
  repository: 'HeartofPhos/exile-leveling',
  commit: 'b7b2dd0ed62ae25cf55c74085fa64a1f4d7cf4ba',
  license: 'MIT',
};

async function main(): Promise<void> {
  const raw = await fs.readFile(FILE, 'utf8');
  const snapshot = validateGemAcquisitionSnapshot(JSON.parse(raw) as unknown);
  if (!snapshot) throw new Error('Bundled gem acquisition snapshot failed schema validation.');
  if (snapshot.gameVersion !== EXPECTED.gameVersion) throw new Error(`Expected PoE ${EXPECTED.gameVersion} gem data, found ${snapshot.gameVersion}.`);
  if (snapshot.source.repository !== EXPECTED.repository) throw new Error(`Unexpected gem-data source repository: ${snapshot.source.repository}`);
  if (snapshot.source.commit !== EXPECTED.commit) throw new Error(`Unexpected gem-data source commit: ${snapshot.source.commit}`);
  if (snapshot.source.license !== EXPECTED.license) throw new Error(`Unexpected gem-data license: ${snapshot.source.license}`);
  if (snapshot.gems.length < 100) throw new Error(`Gem snapshot is implausibly small (${snapshot.gems.length} records).`);
  if (snapshot.offers.length < 100) throw new Error(`Gem acquisition snapshot is implausibly small (${snapshot.offers.length} offers).`);

  const gemIds = new Set<string>();
  for (const gem of snapshot.gems) {
    if (gemIds.has(gem.id)) throw new Error(`Duplicate gem id in bundled snapshot: ${gem.id}`);
    gemIds.add(gem.id);
    if (/^\[(?:DNT|UNUSED)\]/i.test(gem.name.trim())) throw new Error(`Internal/non-player gem leaked into bundled snapshot: ${gem.name}`);
  }

  const offerKeys = new Set<string>();
  for (const offer of snapshot.offers) {
    if (!gemIds.has(offer.gemId)) throw new Error(`Acquisition offer references missing gem: ${offer.gemId}`);
    const key = [offer.gemId, offer.kind, offer.questId, offer.rewardOfferId, offer.npc, [...offer.classes].sort().join(',')].join('|');
    if (offerKeys.has(key)) throw new Error(`Duplicate gem acquisition offer: ${key}`);
    offerKeys.add(key);
  }

  for (const [className, starts] of Object.entries(snapshot.startingGems)) {
    for (const gemId of starts) if (!gemIds.has(gemId)) throw new Error(`${className} starting gem is missing from bundled gem records: ${gemId}`);
  }

  console.log(`Bundled PoE ${snapshot.gameVersion} gem data is valid.`);
  console.log(`${snapshot.gems.length} player-acquirable gems · ${snapshot.offers.length} acquisition offers · ${Object.keys(snapshot.startingGems).length} character classes`);
  console.log(`Source ${snapshot.source.repository}@${snapshot.source.commit}`);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
