import { readFile } from 'node:fs/promises';
import { importMaxrollGuide } from '../electron/services/maxroll-service';
import { validatePassiveTreeSnapshot } from '../src/core/passive-data';

const passiveRaw = JSON.parse(await readFile('assets/game-data/passive-tree-3.29.json', 'utf8')) as unknown;
const passive = validatePassiveTreeSnapshot(passiveRaw);
if (!passive) throw new Error('Bundled passive snapshot did not validate.');

const targets = [
  {
    label: 'normal',
    url: 'https://maxroll.gg/poe/build-guides/explosive-concoction-deadeye-leveling-build-guide',
    expectedPlanner: 'zh1t10s5',
  },
  {
    label: 'twink',
    url: 'https://maxroll.gg/poe/build-guides/leveling-twink-ranger',
    expectedPlanner: 'gep906sn',
  },
] as const;

const summaries: unknown[] = [];
for (const target of targets) {
  const imported = await importMaxrollGuide(target.url, 'live-contract-smoke', passive);
  const metadata = imported.maxroll;
  if (metadata.plannerId !== target.expectedPlanner) throw new Error(`${target.label}: expected planner ${target.expectedPlanner}, got ${metadata.plannerId ?? 'none'}.`);
  if (!['current', 'compatible-ids'].includes(metadata.compatibility)) throw new Error(`${target.label}: exact passive coaching is not compatible: ${metadata.compatibilityMessage}`);
  if (metadata.passiveOperations.length < 70) throw new Error(`${target.label}: suspiciously small passive stream (${metadata.passiveOperations.length}).`);
  if (imported.build.skillStages.length < 2) throw new Error(`${target.label}: skill progression did not parse.`);
  if (target.label === 'normal') {
    if (!metadata.skillMilestones.some((name) => /Level 38/i.test(name))) throw new Error('normal: expected late leveling skill milestone is missing.');
  } else {
    if (metadata.mode !== 'twink') throw new Error('twink: guide mode was not detected as Twink.');
    if (!metadata.skillMilestones.some((name) => /Hollow Palm.*Level 12/i.test(name))) throw new Error('twink: Hollow Palm level-12 swap was not detected.');
    if (metadata.equipmentMilestones.length < 3) throw new Error(`twink: expected equipment progression, got ${metadata.equipmentMilestones.length} stages.`);
  }
  summaries.push({
    label: target.label,
    plannerId: metadata.plannerId,
    mode: metadata.mode,
    guideModified: metadata.guideModified,
    plannerTreeVersion: metadata.plannerTreeVersion,
    compatibility: metadata.compatibility,
    passiveOperations: metadata.passiveOperations.length,
    skillMilestones: metadata.skillMilestones,
    equipmentMilestones: metadata.equipmentMilestones.map((entry) => ({ name: entry.name, itemCount: entry.itemNames.length })),
  });
}
console.log(JSON.stringify(summaries, null, 2));
