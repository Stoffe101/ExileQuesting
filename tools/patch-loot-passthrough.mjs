import { promises as fs } from 'node:fs';

const file = 'electron/main.ts';
const before = `async function refreshBuildLootFilter(): Promise<void> {
  if (!lootFilter.basePath || !activeBuildCoach) return;
  const pendingReload = lootFilter.needsReload;
  const generated = await writeBuildAwareLootFilter(lootFilter.basePath, activeBuildCoach.loot, lootFilter.fingerprint);
  lootFilter = { ...generated, needsReload: pendingReload || generated.needsReload };
  await saveLootFilterState();
}`;
const after = `async function refreshBuildLootFilter(): Promise<void> {
  if (!lootFilter.basePath) return;
  const pendingReload = lootFilter.needsReload;
  const generated = await writeBuildAwareLootFilter(lootFilter.basePath, activeBuildCoach?.loot, lootFilter.fingerprint);
  lootFilter = { ...generated, needsReload: pendingReload || generated.needsReload };
  await saveLootFilterState();
}`;

const source = await fs.readFile(file, 'utf8');
const first = source.indexOf(before);
if (first < 0) throw new Error('Expected refreshBuildLootFilter implementation was not found.');
if (source.indexOf(before, first + before.length) >= 0) throw new Error('refreshBuildLootFilter patch anchor is not unique.');
await fs.writeFile(file, source.slice(0, first) + after + source.slice(first + before.length), 'utf8');
console.log('Patched refreshBuildLootFilter to emit a safe passthrough wrapper without an active Build Profile.');
