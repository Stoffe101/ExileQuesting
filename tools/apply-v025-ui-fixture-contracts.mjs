import { readFile, writeFile } from 'node:fs/promises';

async function edit(file, mutator) {
  let text = (await readFile(file, 'utf8')).replace(/\r\n/g, '\n');
  const replaceOnce = (from, to) => {
    const count = text.split(from).length - 1;
    if (count !== 1) throw new Error(`${file}: expected exactly one match, found ${count}: ${from.slice(0, 100)}`);
    text = text.replace(from, to);
  };
  await mutator({ replaceOnce, get text() { return text; }, set text(value) { text = value; } });
  await writeFile(file, text, 'utf8');
}

const tracking = ({ id, runId, name, className, level, progressExpr, actExpr, buildId, buildName, nowExpr = 'now' }) => `characterTracking: {\n      activeProfileId: '${id}',\n      active: {\n        id: '${id}', runId: '${runId}', characterName: '${name}', characterClass: '${className}', characterLevel: ${level}, progress: ${progressExpr}, act: ${actExpr},\n        provisional: false, freshStart: false, archived: false,${buildId ? ` buildProfileId: '${buildId}', buildProfileName: '${buildName}',` : ''}\n        identitySource: 'manual', identityConfidence: 'manual', identityReason: 'Visual/smoke fixture: exact character identity is explicitly known.', updatedAt: ${nowExpr}, lastSeenAt: ${nowExpr},\n      },\n      profiles: [{\n        id: '${id}', runId: '${runId}', characterName: '${name}', characterClass: '${className}', characterLevel: ${level}, progress: ${progressExpr}, act: ${actExpr},\n        provisional: false, freshStart: false, archived: false,${buildId ? ` buildProfileId: '${buildId}', buildProfileName: '${buildName}',` : ''}\n        identitySource: 'manual', identityConfidence: 'manual', identityReason: 'Visual/smoke fixture: exact character identity is explicitly known.', updatedAt: ${nowExpr}, lastSeenAt: ${nowExpr},\n      }],\n    }`;

await edit('tools/visual-gear-coach.ts', async ({ replaceOnce }) => {
  replaceOnce('  passiveTreeHudEnabled: true, passiveTreeHudPathPreview: true,', '  passiveTreeHudEnabled: false, passiveTreeHudPathPreview: false,');
  replaceOnce(
    `  const passiveData = validatePassiveTreeSnapshot(rawPassives);\n  const buildProfile = profile();`,
    `  const passiveData = validatePassiveTreeSnapshot(rawPassives);\n  if (!gemData || !passiveData) throw new Error('Visual Gear Coach fixture requires valid bundled gem and passive snapshots.');\n  const buildProfile = profile();`
  );
  replaceOnce(
    `    currentZone: 'The City of Sarn', currentAreaId: '1_3_1', currentAreaLevel: 23, characterLevel: 30, xpGuidance: calculateXpGuidance(30, 23),`,
    `    currentZone: 'The City of Sarn', currentAreaId: '1_3_1', currentAreaLevel: 23, characterLevel: 30,\n    ${tracking({ id: 'visual-gear-character', runId: 'visual-gear-run', name: 'VisualRanger', className: 'Ranger', level: 30, progressExpr: 'progress', actExpr: 'dataset.steps[progress]?.act', buildId: 'visual-ranger', buildName: 'Caustic Arrow Ranger' })},\n    xpGuidance: calculateXpGuidance(30, 23),`
  );
  replaceOnce(
    `    runStats: runStatsFor(emptyRunSession(), []), appUpdate: { status: 'up-to-date', currentVersion: '0.2.0', latestVersion: '0.2.0', message: 'ExileQuesting 0.2.0 is up to date.' },`,
    `    runStats: runStatsFor(emptyRunSession(), []), appUpdate: { status: 'up-to-date', currentVersion: '0.2.5', latestVersion: '0.2.5', message: 'ExileQuesting 0.2.5 is up to date.' },`
  );
  replaceOnce(`    passiveTreeHud: passiveTreeHudIdle(true), appVersion: '0.2.0',`, `    passiveTreeHud: passiveTreeHudIdle(false), appVersion: '0.2.5',`);
});

await edit('tools/visual-build-doctor.ts', async ({ replaceOnce }) => {
  replaceOnce('  passiveTreeHudEnabled: true, passiveTreeHudPathPreview: true,', '  passiveTreeHudEnabled: false, passiveTreeHudPathPreview: false,');
  replaceOnce(
    `    currentZone: 'Karui Shores', currentAreaId: '2_11_endgame_town', currentAreaLevel: 83, characterLevel: 96, xpGuidance: calculateXpGuidance(96, 83),`,
    `    currentZone: 'Karui Shores', currentAreaId: '2_11_endgame_town', currentAreaLevel: 83, characterLevel: 96,\n    ${tracking({ id: 'visual-doctor-character', runId: 'visual-doctor-run', name: 'VisualTrickster', className: 'Shadow', level: 96, progressExpr: 'progress', actExpr: 'dataset.steps[progress]?.act', buildId: 'visual-build-doctor', buildName: 'Level 96 Trickster · Build Doctor fixture' })},\n    xpGuidance: calculateXpGuidance(96, 83),`
  );
  replaceOnce(
    `    runStats: runStatsFor(emptyRunSession(), []), appUpdate: { status: 'up-to-date', currentVersion: '0.2.3', latestVersion: '0.2.3', message: 'ExileQuesting is up to date.' },`,
    `    runStats: runStatsFor(emptyRunSession(), []), appUpdate: { status: 'up-to-date', currentVersion: '0.2.5', latestVersion: '0.2.5', message: 'ExileQuesting 0.2.5 is up to date.' },`
  );
  replaceOnce(`    recovery: { previousSessionUnclean: false, acknowledged: true }, lootFilter: workspace.lootFilter, passiveTreeHud: passiveTreeHudIdle(true), appVersion: '0.2.3',`, `    recovery: { previousSessionUnclean: false, acknowledged: true }, lootFilter: workspace.lootFilter, passiveTreeHud: passiveTreeHudIdle(false), appVersion: '0.2.5',`);
});

await edit('tools/smoke-lab.ts', async ({ replaceOnce }) => {
  replaceOnce(`import { calculateXpGuidance } from '../src/core/xp';`, `import { calculateXpGuidance } from '../src/core/xp';\nimport { passiveTreeHudIdle } from '../src/core/passive-tree-hud-state';`);
  replaceOnce(
    `  overlayAutoCollapse: true, overlayAutoCollapseSeconds: 5, reducedMotion: false, reducedTransparency: false,`,
    `  overlayAutoCollapse: true, overlayAutoCollapseSeconds: 5, passiveTreeHudEnabled: false, passiveTreeHudPathPreview: false, reducedMotion: false, reducedTransparency: false,`
  );
  replaceOnce(
    `  const progress = 0;\n  return {`,
    `  const progress = 0;\n  const now = new Date().toISOString();\n  return {`
  );
  replaceOnce(
    `    progress,\n    rewardProgress: rewardProgressFor(dataset, progress),`,
    `    progress,\n    ${tracking({ id: 'lab-smoke-character', runId: 'lab-smoke-run', name: 'LabSmokeWitch', className: 'Witch', level: 1, progressExpr: 'progress', actExpr: 'dataset.steps[progress]?.act' })},\n    xpGuidance: calculateXpGuidance(1, 1),\n    rewardProgress: rewardProgressFor(dataset, progress),`
  );
  replaceOnce(
    `    detectionTrace: [], runStats: runStatsFor(emptyRunSession(), []),`,
    `    detectionTrace: [], runStats: runStatsFor(emptyRunSession(), []),\n    lootFilter: { status: 'unconfigured', needsReload: false, message: 'Build-aware loot filter is not configured in Lab smoke.' },`
  );
  replaceOnce(
    `    appUpdate: { status: 'disabled', currentVersion: '0.1.4', message: 'Disabled in Lab smoke.' },\n    recovery: { previousSessionUnclean: false, acknowledged: true }, appVersion: '0.1.4', diagnosticsPath: '',`,
    `    appUpdate: { status: 'disabled', currentVersion: '0.2.5', message: 'Disabled in Lab smoke.' },\n    recovery: { previousSessionUnclean: false, acknowledged: true }, passiveTreeHud: passiveTreeHudIdle(false), appVersion: '0.2.5', diagnosticsPath: '',`
  );
});

await edit('tools/visual-manager.ts', async ({ replaceOnce }) => {
  replaceOnce(
    `      if (!(bottomScrollTop > 0)) throw new Error(\`${'${scenario.name}'}: page reports overflow but cannot actually scroll.\`);`,
    `      if ((bottomScrollTop ?? 0) <= 0) throw new Error(\`${'${scenario.name}'}: page reports overflow but cannot actually scroll.\`);`
  );
});

await edit('tsconfig.json', async ({ replaceOnce }) => {
  replaceOnce(
    `  "include": ["src", "electron", "vite.config.ts"]`,
    `  "include": ["src", "electron", "vite.config.ts", "tools/visual-manager.ts", "tools/visual-gear-coach.ts", "tools/visual-build-doctor.ts", "tools/smoke-lab.ts"]`
  );
});

console.log('Updated standalone UI fixtures to the current RuntimeState contract and added them to strict typecheck.');
