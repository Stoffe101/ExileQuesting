import { readFile, writeFile } from 'node:fs/promises';

async function replaceOnce(path, from, to, label) {
  let source = await readFile(path, 'utf8');
  if (source.includes(to)) return false;
  const first = source.indexOf(from);
  if (first < 0) throw new Error(`Missing patch anchor: ${label}`);
  if (source.indexOf(from, first + from.length) >= 0) throw new Error(`Patch anchor is not unique: ${label}`);
  source = source.slice(0, first) + to + source.slice(first + from.length);
  await writeFile(path, source, 'utf8');
  return true;
}

await replaceOnce(
  'electron/main.ts',
  "const imported = await importMaxrollGuide(input.trim(), app.getVersion(), passiveData.snapshot);",
  "const imported = await importMaxrollGuide(input.trim(), app.getVersion(), passiveData.snapshot, gemData.snapshot);",
  'Maxroll import callsite',
).catch(async (error) => {
  const source = await readFile('electron/main.ts', 'utf8');
  if (!source.includes('importMaxrollGuide(input.trim(), app.getVersion(), passiveData.snapshot, gemData.snapshot)')) throw error;
});

await replaceOnce(
  'docs/ROADMAP.md',
  '- [x] paste export code or pobb.in URL in the manager\n',
  '- [x] paste export code or pobb.in URL in the manager\n- [x] import public Maxroll PoE leveling-guide URLs as first-class Build Profiles\n- [x] support normal and Twink Maxroll planner schemas with bounded public fetches\n',
  'roadmap import support',
);

await replaceOnce(
  'docs/ROADMAP.md',
  '- [x] concise BUILD block in Compact/Focus/Coach overlays\n',
  '- [x] concise BUILD block in Compact/Focus/Coach overlays\n- [x] exact Maxroll next-passive/refund coaching with persisted manual cursor\n- [x] character-level-driven Maxroll skill/gem stage activation\n- [x] canonicalize Maxroll gem IDs/names through bundled PoE game data\n- [x] preserve Twink equipment slot/item/base/unique references for future Gear Coach resolution\n',
  'roadmap leveling support',
);

await replaceOnce(
  'docs/POB_TO_PLAY.md',
  '## Safety boundary\n',
  `## Maxroll leveling sources\n\nMaxroll leveling guides are also accepted as first-class Build Profile sources when they expose a public structured PoE planner. The importer keeps Maxroll provenance instead of pretending the source is a PoB.\n\nFor supported guides ExileQuesting normalizes level-labelled skill/gem stages, ordered passive allocation/refund history, class/ascendancy metadata and Twink equipment references. Character level may advance the active Maxroll skill stage, while passive progress uses a separate persisted manual cursor because quest passive rewards and refunds make level-to-passive inference unsafe.\n\nEvery referenced Maxroll passive node ID is checked against the bundled current passive snapshot before exact node coaching is allowed. Older planner versions may be marked compatible only when all IDs still resolve. Missing IDs disable exact passive coaching rather than guessing. Maxroll gem metadata IDs are resolved through the bundled current gem snapshot so the acquisition planner and overlay receive canonical game-facing names such as \`Volley Support\` instead of metadata-derived labels.\n\nSee \`MAXROLL_LEVELING.md\` for the complete source, Twink, compatibility, persistence and failure-behaviour contract.\n\n## Safety boundary\n`,
  'PoB to Play Maxroll section',
);

console.log('Applied final Maxroll runtime/documentation patches.');
