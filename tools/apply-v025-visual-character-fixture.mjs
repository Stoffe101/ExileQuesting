import { readFile, writeFile } from 'node:fs/promises';

const target = 'tools/visual-manager.ts';
let text = (await readFile(target, 'utf8')).replace(/\r\n/g, '\n');

function replaceOnce(from, to) {
  const count = text.split(from).length - 1;
  if (count !== 1) throw new Error(`Expected exactly one match, found ${count}: ${from.slice(0, 80)}`);
  text = text.replace(from, to);
}

replaceOnce(
  `    characterLevel: 93,\n    xpGuidance: calculateXpGuidance(93, 83),`,
  `    characterLevel: 93,\n    characterTracking: {\n      activeProfileId: 'visual-character-main',\n      active: {\n        id: 'visual-character-main', runId: 'visual-run-main', characterName: 'VisualWitch', characterClass: 'Witch', characterLevel: 93, progress, act: dataset.steps[progress]?.act,\n        provisional: false, freshStart: false, archived: false, buildProfileId: 'visual-maxroll', buildProfileName: 'Visual League Starter',\n        identitySource: 'manual', identityConfidence: 'manual', identityReason: 'Visual fixture: exact character name confirmed by the user.', updatedAt: now, lastSeenAt: now,\n      },\n      profiles: [\n        {\n          id: 'visual-character-main', runId: 'visual-run-main', characterName: 'VisualWitch', characterClass: 'Witch', characterLevel: 93, progress, act: dataset.steps[progress]?.act,\n          provisional: false, freshStart: false, archived: false, buildProfileId: 'visual-maxroll', buildProfileName: 'Visual League Starter',\n          identitySource: 'manual', identityConfidence: 'manual', identityReason: 'Visual fixture: exact character name confirmed by the user.', updatedAt: now, lastSeenAt: now,\n        },\n        {\n          id: 'visual-character-alt', runId: 'visual-run-alt', characterName: 'VisualRanger', characterClass: 'Ranger', characterLevel: 38, progress: Math.min(72, dataset.steps.length - 1), act: 4,\n          provisional: false, freshStart: false, archived: false, identitySource: 'route-match', identityConfidence: 'inferred',\n          identityReason: 'Visual fixture: saved route context matched this character conservatively.', updatedAt: now, lastSeenAt: '2026-09-03T17:00:00.000Z',\n        },\n      ],\n    },\n    xpGuidance: calculateXpGuidance(93, 83),`
);

replaceOnce(
  `    appUpdate: { status: 'up-to-date', currentVersion: '0.2.0', latestVersion: '0.2.0', message: 'ExileQuesting 0.2.0 is up to date.' },`,
  `    appUpdate: { status: 'up-to-date', currentVersion: '0.2.5', latestVersion: '0.2.5', message: 'ExileQuesting 0.2.5 is up to date.' },`
);
replaceOnce(`    appVersion: '0.2.0',`, `    appVersion: '0.2.5',`);

replaceOnce(
  `  { name: 'campaign-1920x1080', width: 1920, height: 1080, tab: 'Campaign' },\n  { name: 'settings-1920x1080',`,
  `  { name: 'campaign-1920x1080', width: 1920, height: 1080, tab: 'Campaign' },\n  { name: 'characters-1920x1080', width: 1920, height: 1080, tab: 'Characters' },\n  { name: 'settings-1920x1080',`
);
replaceOnce(
  `  { name: 'diagnostics-1000x700', width: 1000, height: 700, tab: 'Diagnostics', expectScrollable: true, expectCompactSidebar: true },`,
  `  { name: 'diagnostics-1000x700', width: 1000, height: 700, tab: 'Diagnostics', expectScrollable: true, expectCompactSidebar: true },\n  { name: 'characters-1000x700', width: 1000, height: 700, tab: 'Characters', expectCompactSidebar: true },`
);

replaceOnce(
  `  await waitForManager(window);\n\n  const captures: unknown[] = [];`,
  `  await waitForManager(window);\n  const trackingText = await window.webContents.executeJavaScript(\`document.querySelector('.topbar')?.textContent ?? ''\`);\n  if (!trackingText.includes('VisualWitch')) throw new Error('Manager visual fixture did not render active character tracking in the top bar.');\n\n  const captures: unknown[] = [];`
);

await writeFile(target, text, 'utf8');
console.log('Updated visual-manager character-aware fixture and coverage.');
