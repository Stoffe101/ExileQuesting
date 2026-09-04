import { app, BrowserWindow, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalizeCampaign } from '../src/core/campaign';
import { buildRewardAudit, rewardProgressFor } from '../src/core/rewards';
import { emptyRunSession, runStatsFor } from '../src/core/run';
import { calculateXpGuidance } from '../src/core/xp';
import { buildPlannerSnapshot, normalizeBuildPlannerState } from '../src/core/build-planner';
import { buildGemAcquisitionPlan } from '../src/core/gem-acquisition';
import { validateGemAcquisitionSnapshot } from '../src/core/gem-data';
import { validatePassiveTreeSnapshot } from '../src/core/passive-data';
import { passiveTreeHudIdle } from '../src/core/passive-tree-hud-state';
import { buildCoachSnapshot } from '../src/core/build-coach';
import { analyzeGearItem } from '../src/core/gear-coach';
import type { BuildProfile } from '../src/core/build-profiles';
import type { AppSettings, GuidanceAnnotation, LayoutHint, RawAreas, RawGuide, RuntimeState } from '../src/core/types';

const output = path.resolve(process.argv[2] || 'artifacts/manager-visual/gear-coach');
const copiedBoots = `Item Class: Boots
Rarity: Rare
Storm Pace
Sharkskin Boots
--------
Requirements:
Level: 27
Dex: 44
--------
Sockets: G-G-G-G
--------
Item Level: 38
--------
+72 to maximum Life
+34% to Fire Resistance
+29% to Cold Resistance
+25% to Lightning Resistance
25% increased Movement Speed`;

const settings: AppSettings = {
  logPath: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile\\logs\\LatestClient.txt', guidanceMode: 'beginner', leagueStart: true, bandit: 'none', showOptional: true,
  autoAdvance: true, autoShowOnZoneChange: true, overlayOpacity: 0.94, overlayScale: 1, overlayClickThrough: false, overlayMode: 'focus',
  overlayTypography: { preset: 'default', objective: 21, actions: 15, guidance: 13, labels: 10, status: 10, density: 'comfortable' },
  overlayPosition: { preset: 'top-right', locked: false, snapToEdges: true }, overlayAutoCollapse: true, overlayAutoCollapseSeconds: 5,
  passiveTreeHudEnabled: false, passiveTreeHudPathPreview: false,
  reducedMotion: false, reducedTransparency: false, onboardingComplete: true, launchMinimized: false, autoCheckAppUpdates: true, autoDownloadAppUpdates: false,
  autoStartRunTimer: true, showRunTimerInOverlay: true,
  hotkeys: { toggleOverlay: 'CommandOrControl+Shift+H', nextStep: 'Alt+Shift+Right', previousStep: 'Alt+Shift+Left', toggleInteraction: 'CommandOrControl+Shift+I', cycleOverlayMode: 'CommandOrControl+Shift+M' },
};

async function json<T>(file: string): Promise<T> { return JSON.parse(await fs.readFile(path.resolve(file), 'utf8')) as T; }

function targetBoots() {
  return {
    raw: 'Rarity: Rare\nTarget Pace\nSharkskin Boots', rarity: 'Rare', name: 'Target Pace', baseType: 'Sharkskin Boots', slot: 'boots' as const, slotName: 'Boots', itemId: '17',
    requirements: { level: 28 }, sockets: 4, maxLinks: 4, socketText: 'G-G-G-G', corrupted: false, mirrored: false, unidentified: false,
    stats: { maximumLife: 60, maximumMana: 0, fireResistance: 30, coldResistance: 30, lightningResistance: 0, chaosResistance: 0, allElementalResistance: 0, strength: 0, dexterity: 0, intelligence: 0, allAttributes: 0, movementSpeed: 20, attackSpeed: 0, castSpeed: 0, increasedDamage: 0, gemLevels: 0, armour: 0, evasion: 210, energyShield: 0, ward: 0 },
    modifierLines: ['+60 to maximum Life', '20% increased Movement Speed'],
  };
}

function profile(): BuildProfile {
  return {
    id: 'visual-ranger', name: 'Caustic Arrow Ranger', importedAt: '2026-09-02T15:00:00.000Z', sourceKind: 'xml', source: 'C:\\Users\\Visual\\Builds\\caustic-arrow.xml',
    build: {
      root: 'PathOfBuilding', className: 'Ranger', level: 28, targetVersion: '3_29', notes: 'Level with Caustic Arrow. Prioritise movement speed and keep elemental resistances healthy.', warnings: [],
      treeStages: [{ id: 'tree:1', title: 'Level 28', kind: 'tree', active: true, ordinal: 1 }], configStages: [], activeSkillGroups: [],
      skillStages: [{ id: 'skills:1', sourceId: '1', title: 'Level 28', kind: 'skills', active: true, ordinal: 1, skillGroups: [{ label: 'Caustic Arrow', enabled: true, gems: [
        { name: 'Caustic Arrow', skillId: 'Metadata/Items/Gems/SkillGemPoisonArrow', enabled: true },
        { name: 'Volley Support', skillId: 'Metadata/Items/Gems/SupportGemParallelProjectiles', enabled: true },
        { name: 'Void Manipulation Support', skillId: 'Metadata/Items/Gems/SupportGemVoidManipulation', enabled: true },
        { name: 'Efficacy Support', skillId: 'Metadata/Items/Gems/SupportGemEfficacy', enabled: true },
      ] }] }],
      itemStages: [{ id: 'items:1', sourceId: '1', title: 'Level 28', kind: 'items', active: true, ordinal: 1, equipment: [targetBoots()] }],
    },
  };
}

async function waitFor(window: BrowserWindow, expression: string, label: string): Promise<void> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function capture(window: BrowserWindow, name: string): Promise<number> {
  const image = await window.webContents.capturePage();
  const png = image.toPNG();
  if (!png.length) throw new Error(`${name}: empty screenshot.`);
  await fs.writeFile(path.join(output, name), png);
  return png.length;
}

async function main(): Promise<void> {
  await app.whenReady();
  await fs.mkdir(output, { recursive: true });
  const [guide, areas, annotations, layouts, manifest, rawGems, rawPassives] = await Promise.all([
    json<RawGuide>('assets/campaign/guide.json'), json<RawAreas>('assets/campaign/areas.json'), json<GuidanceAnnotation[]>('assets/campaign/annotations.json'), json<LayoutHint[]>('assets/campaign/layouts.json'),
    json<{ commit: string; fetchedAt: string }>('assets/campaign/manifest.json'), json<unknown>('assets/game-data/gem-acquisition-3.29.json'), json<unknown>('assets/game-data/passive-tree-3.29.json'),
  ]);
  const gemData = validateGemAcquisitionSnapshot(rawGems);
  const passiveData = validatePassiveTreeSnapshot(rawPassives);
  if (!gemData || !passiveData) throw new Error('Visual Gear Coach fixture requires valid bundled gem and passive snapshots.');
  const buildProfile = profile();
  const plannerState = normalizeBuildPlannerState({ schemaVersion: 1, activeProfileId: buildProfile.id, activeStageByProfile: {}, passiveCursorByProfile: {} }, [buildProfile]);
  const planner = buildPlannerSnapshot([buildProfile], plannerState);
  const activeStageId = planner.profiles[0].activeStageId;
  const plan = buildGemAcquisitionPlan(buildProfile, gemData);
  const coach = buildCoachSnapshot(buildProfile, activeStageId, plan, gemData, passiveData);
  const workspace = {
    planner,
    gemData: { status: 'ready' as const, message: 'Bundled gem data ready.', gameVersion: gemData.gameVersion, sourceCommit: gemData.source.commit },
    passiveData: { status: 'ready' as const, message: 'Bundled passive data ready.', gameVersion: passiveData.gameVersion, sha256: passiveData.source.sha256 },
    plan,
    coach,
    characterLevel: 30,
    lootFilter: { status: 'unconfigured' as const, needsReload: false, message: 'Choose a base filter to enable build-aware loot intelligence.' },
    campaign: { resolved: 0, unresolved: 0, actionSteps: 0 },
  };

  const dataset = normalizeCampaign(guide, areas, annotations, { repository: 'Lailloken/Exile-UI', commit: manifest.commit, fetchedAt: manifest.fetchedAt, license: 'MIT' }, layouts);
  const now = new Date().toISOString();
  const progress = Math.min(6, dataset.steps.length - 1);
  const state: RuntimeState = {
    settings, dataset, sourceStatus: { state: 'current', activeCommit: manifest.commit, checkedAt: now, message: 'Campaign data is current and verified.' }, progress,
    currentZone: 'The City of Sarn', currentAreaId: '1_3_1', currentAreaLevel: 23, characterLevel: 30,
    characterTracking: {
      activeProfileId: 'visual-gear-character',
      active: {
        id: 'visual-gear-character', runId: 'visual-gear-run', characterName: 'VisualRanger', characterClass: 'Ranger', characterLevel: 30, progress: progress, act: dataset.steps[progress]?.act,
        provisional: false, freshStart: false, archived: false, buildProfileId: 'visual-ranger', buildProfileName: 'Caustic Arrow Ranger',
        identitySource: 'manual', identityConfidence: 'manual', identityReason: 'Visual/smoke fixture: exact character identity is explicitly known.', updatedAt: now, lastSeenAt: now,
      },
      profiles: [{
        id: 'visual-gear-character', runId: 'visual-gear-run', characterName: 'VisualRanger', characterClass: 'Ranger', characterLevel: 30, progress: progress, act: dataset.steps[progress]?.act,
        provisional: false, freshStart: false, archived: false, buildProfileId: 'visual-ranger', buildProfileName: 'Caustic Arrow Ranger',
        identitySource: 'manual', identityConfidence: 'manual', identityReason: 'Visual/smoke fixture: exact character identity is explicitly known.', updatedAt: now, lastSeenAt: now,
      }],
    },
    xpGuidance: calculateXpGuidance(30, 23), rewardProgress: rewardProgressFor(dataset, progress),
    rewardAudit: buildRewardAudit(dataset, progress, new Set()), progressHistory: [], startupReconciliation: { state: 'none' }, logConnected: true,
    logDiagnostics: { path: settings.logPath, fileExists: true, watcherActive: true, pollingActive: true, lastParsedEventAt: now, characterLevel: 30, areaLevel: 23 }, detectionTrace: [],
    runStats: runStatsFor(emptyRunSession(), []), appUpdate: { status: 'up-to-date', currentVersion: '0.2.5', latestVersion: '0.2.5', message: 'ExileQuesting 0.2.5 is up to date.' },
    recovery: { previousSessionUnclean: false, acknowledged: true }, buildCoach: coach, lootFilter: workspace.lootFilter,
    passiveTreeHud: passiveTreeHudIdle(false), appVersion: '0.2.5', diagnosticsPath: 'C:\\Users\\Visual\\AppData\\Roaming\\ExileQuesting\\logs\\main.log',
  };

  ipcMain.handle('app:bootstrap', () => state);
  ipcMain.handle('pob:workspace', () => workspace);
  ipcMain.handle('gear:analyze', (_event, input: string) => analyzeGearItem(input, buildProfile, activeStageId, gemData, 30));
  ipcMain.handle('gear:analyze-clipboard', () => analyzeGearItem(copiedBoots, buildProfile, activeStageId, gemData, 30));

  const window = new BrowserWindow({ show: false, width: 1920, height: 1080, backgroundColor: '#090b10', webPreferences: { preload: path.resolve('dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true } });
  await window.loadFile(path.resolve('dist/index.html'));
  await waitFor(window, `document.querySelector('.sidebar nav button')`, 'manager navigation');
  const clicked = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('.sidebar nav button')].find((node) => node.textContent?.includes('Build')); if (!button) return false; button.click(); return true; })()`);
  if (!clicked) throw new Error('Build navigation button is missing.');
  await waitFor(window, `document.querySelector('.gear-coach-panel')`, 'Gear Coach panel');
  await window.webContents.executeJavaScript(`document.querySelector('.gear-coach-panel')?.scrollIntoView({ block: 'start' })`);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const emptyBytes = await capture(window, 'gear-coach-empty-1920x1080.png');

  const encoded = JSON.stringify(copiedBoots);
  const submitted = await window.webContents.executeJavaScript(`(() => {
    const textarea = document.querySelector('.gear-coach-textarea');
    if (!(textarea instanceof HTMLTextAreaElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(textarea, ${encoded});
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const button = [...document.querySelectorAll('.gear-coach-actions button')].find((node) => node.textContent?.includes('Analyze pasted text'));
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  if (!submitted) throw new Error('Could not submit Gear Coach copied-item fixture.');
  await waitFor(window, `document.querySelector('.gear-score-card')`, 'Gear Coach analysis result');
  await window.webContents.executeJavaScript(`document.querySelector('.gear-coach-panel')?.scrollIntoView({ block: 'start' })`);
  await new Promise((resolve) => setTimeout(resolve, 120));

  const metrics = await window.webContents.executeJavaScript(`(() => {
    const panel = document.querySelector('.gear-coach-panel');
    const score = document.querySelector('.gear-score-number strong');
    const verdict = document.querySelector('.gear-score-card > div:last-child > span');
    if (!panel || !score || !verdict) throw new Error('Gear Coach result structure is incomplete.');
    return { viewportWidth: document.documentElement.clientWidth, documentScrollWidth: document.documentElement.scrollWidth, panelWidth: panel.getBoundingClientRect().width, score: score.textContent, verdict: verdict.textContent };
  })()`);
  if (metrics.documentScrollWidth > metrics.viewportWidth + 2) throw new Error(`Gear Coach causes horizontal document overflow (${metrics.documentScrollWidth} > ${metrics.viewportWidth}).`);
  if (Number(metrics.score) < 60) throw new Error(`Visual fixture should score as a useful upgrade, got ${metrics.score}.`);
  const resultBytes = await capture(window, 'gear-coach-result-1920x1080.png');
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), emptyBytes, resultBytes, ...metrics }, null, 2), 'utf8');
  window.destroy();
  for (const channel of ['app:bootstrap', 'pob:workspace', 'gear:analyze', 'gear:analyze-clipboard']) ipcMain.removeHandler(channel);
  app.quit();
}

void main().catch((error) => { console.error(error); app.exit(1); });