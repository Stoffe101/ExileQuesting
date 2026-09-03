import { app, BrowserWindow, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalizeCampaign } from '../src/core/campaign';
import { buildPlannerSnapshot, normalizeBuildPlannerState } from '../src/core/build-planner';
import { readyBuildDoctorSnapshot } from '../src/core/build-doctor';
import { buildRewardAudit, rewardProgressFor } from '../src/core/rewards';
import { emptyRunSession, runStatsFor } from '../src/core/run';
import { calculateXpGuidance } from '../src/core/xp';
import { passiveTreeHudIdle } from '../src/core/passive-tree-hud-state';
import type { BuildProfile } from '../src/core/build-profiles';
import type { PobCalculationResult, PobFlaskInspectionResult } from '../src/core/pob-calculation';
import type { AppSettings, GuidanceAnnotation, LayoutHint, RawAreas, RawGuide, RuntimeState } from '../src/core/types';

const output = path.resolve(process.argv[2] || 'artifacts/manager-visual/build-doctor');

const settings: AppSettings = {
  logPath: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile\\logs\\LatestClient.txt', guidanceMode: 'beginner', leagueStart: false, bandit: 'none', showOptional: true,
  autoAdvance: true, autoShowOnZoneChange: true, overlayOpacity: 0.94, overlayScale: 1, overlayClickThrough: false, overlayMode: 'focus',
  overlayTypography: { preset: 'default', objective: 21, actions: 15, guidance: 13, labels: 10, status: 10, density: 'comfortable' },
  overlayPosition: { preset: 'top-right', locked: false, snapToEdges: true }, overlayAutoCollapse: true, overlayAutoCollapseSeconds: 5,
  passiveTreeHudEnabled: true, passiveTreeHudPathPreview: true,
  reducedMotion: false, reducedTransparency: false, onboardingComplete: true, launchMinimized: false, autoCheckAppUpdates: true, autoDownloadAppUpdates: false,
  autoStartRunTimer: true, showRunTimerInOverlay: true,
  hotkeys: { toggleOverlay: 'CommandOrControl+Shift+H', nextStep: 'Alt+Shift+Right', previousStep: 'Alt+Shift+Left', toggleInteraction: 'CommandOrControl+Shift+I', cycleOverlayMode: 'CommandOrControl+Shift+M' },
};

async function json<T>(file: string): Promise<T> { return JSON.parse(await fs.readFile(path.resolve(file), 'utf8')) as T; }

function profile(): BuildProfile {
  return {
    id: 'visual-build-doctor',
    name: 'Level 96 Trickster · Build Doctor fixture',
    importedAt: '2026-09-03T10:00:00.000Z',
    sourceKind: 'xml',
    source: 'C:\\Users\\Visual\\Builds\\doctor-fixture.xml',
    calculation: { schemaVersion: 1, kind: 'pob-xml', bytes: 4096, sha256: 'a'.repeat(64) },
    build: {
      root: 'PathOfBuilding', className: 'Shadow', ascendancy: 'Trickster', level: 96, targetVersion: '3_29',
      notes: 'Visual fixture for deterministic Build Doctor rendering.', warnings: [], treeStages: [], skillStages: [], itemStages: [], configStages: [], activeSkillGroups: [],
    },
  };
}

const kernel = {
  protocolVersion: 1,
  pobRepository: 'PathOfBuildingCommunity/PathOfBuilding',
  pobCommit: 'ed354c2f8c42e148bc904c7508dbe851fb2cf952',
  runtime: 'LuaJIT 2.1',
  runtimeRevision: '2460b3ff93a1c955de3d62cfc825de7d68dc272e',
  adapterVersion: '0.5.0',
};

function baseline(): PobCalculationResult {
  return {
    protocolVersion: 1, requestId: 'visual-doctor-baseline', kernel,
    scenario: { scenario: 'imported', label: 'Imported PoB state', notes: ['Visual deterministic fixture.'] },
    offence: { mainSkill: 'Power Siphon', totalDps: 7_842_320, fullDps: 7_842_320, averageHit: 412_500, speed: 5.82, hitChance: 100, critChance: 78.4, critMultiplier: 4.62 },
    defence: {
      life: 3_860, energyShield: 4_920, mana: 1_170, effectiveHitPool: 182_440, armour: 13_800, evasion: 42_700, spellSuppressionChance: 100,
      fireResistance: 75, coldResistance: 75, lightningResistance: 75, chaosResistance: 42,
      maximumHit: { physical: 28_940, fire: 61_200, cold: 63_840, lightning: 60_770, chaos: 31_420 },
      totalNetRecovery: 2_180,
    },
    warnings: [{ code: 'guard-skill-active', message: 'PoB maximum-hit/EHP outputs include an active guard skill in this calculation state.', confidence: 'verified' }],
    elapsedMs: 731,
  };
}

function utilityInspection(): PobFlaskInspectionResult {
  const modifiers = {
    durationIncrease: 36, chargesUsedIncrease: -10, chargesGainedIncrease: 20, effectIncrease: 18, magicUtilityEffectIncrease: 0,
    genericChargesGeneratedPerSecond: 0, lifeChargesGeneratedPerSecond: 0, manaChargesGeneratedPerSecond: 0, utilityChargesGeneratedPerSecond: 0,
    chargesGeneratedPerEmptyFlaskPerSecond: 0, chanceNotConsumeCharges: 0, ironFlaskChargesGeneratedOnWardBreak: 0,
  };
  return {
    protocolVersion: 1, requestId: 'visual-doctor-utility', kernel,
    scenario: { scenario: 'imported', label: 'Imported PoB state' }, emptyFlaskSlots: 2, elapsedMs: 344,
    flasks: [
      { slot: 'Flask 1', name: 'Diamond Flask', baseName: 'Diamond Flask', rarity: 'MAGIC', active: true, life: false, mana: false, utility: true, local: { duration: 8.2, chargesMax: 60, chargesUsed: 20 }, buildModifiers: modifiers },
      { slot: 'Flask 2', name: 'Granite Flask', baseName: 'Granite Flask', rarity: 'MAGIC', active: true, life: false, mana: false, utility: true, local: { duration: 7.1, chargesMax: 60, chargesUsed: 30 }, buildModifiers: modifiers },
      { slot: 'Flask 3', name: 'Quicksilver Flask', baseName: 'Quicksilver Flask', rarity: 'MAGIC', active: false, life: false, mana: false, utility: true, local: { duration: 6.4, chargesMax: 60, chargesUsed: 30 }, buildModifiers: modifiers },
    ],
  };
}

async function waitFor(window: BrowserWindow, expression: string, label: string): Promise<void> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    try {
      if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    } catch { /* renderer is still settling */ }
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

async function inspectLayout(window: BrowserWindow) {
  return window.webContents.executeJavaScript(`(() => {
    const panel = document.querySelector('.build-doctor-panel');
    const metrics = [...document.querySelectorAll('.build-doctor-metrics article')];
    const provenance = document.querySelector('.build-doctor-provenance');
    if (!panel || metrics.length !== 4 || !provenance) throw new Error('Build Doctor ready-state structure is incomplete.');
    return {
      viewportWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      panelWidth: panel.getBoundingClientRect().width,
      metricCount: metrics.length,
      text: panel.textContent || '',
    };
  })()`);
}

async function main(): Promise<void> {
  await app.whenReady();
  await fs.mkdir(output, { recursive: true });
  const [guide, areas, annotations, layouts, manifest] = await Promise.all([
    json<RawGuide>('assets/campaign/guide.json'), json<RawAreas>('assets/campaign/areas.json'), json<GuidanceAnnotation[]>('assets/campaign/annotations.json'),
    json<LayoutHint[]>('assets/campaign/layouts.json'), json<{ commit: string; fetchedAt: string }>('assets/campaign/manifest.json'),
  ]);
  const buildProfile = profile();
  const plannerState = normalizeBuildPlannerState({ schemaVersion: 1, activeProfileId: buildProfile.id, activeStageByProfile: {}, passiveCursorByProfile: {} }, [buildProfile]);
  const workspace = {
    planner: buildPlannerSnapshot([buildProfile], plannerState),
    gemData: { status: 'ready' as const, message: 'Visual gem data ready.', gameVersion: '3.29', sourceCommit: 'visual' },
    passiveData: { status: 'ready' as const, message: 'Visual passive data ready.', gameVersion: '3.29', sha256: 'b'.repeat(64) },
    characterLevel: 96,
    lootFilter: { status: 'unconfigured' as const, needsReload: false, message: 'Build-aware loot filter is not configured in this visual fixture.' },
    campaign: { resolved: 0, unresolved: 0, actionSteps: 0 },
  };
  const dataset = normalizeCampaign(guide, areas, annotations, { repository: 'Lailloken/Exile-UI', commit: manifest.commit, fetchedAt: manifest.fetchedAt, license: 'MIT' }, layouts);
  const now = new Date().toISOString();
  const progress = Math.min(6, dataset.steps.length - 1);
  const state: RuntimeState = {
    settings, dataset, sourceStatus: { state: 'current', activeCommit: manifest.commit, checkedAt: now, message: 'Campaign data is current and verified.' }, progress,
    currentZone: "Karui Shores", currentAreaId: '2_11_endgame_town', currentAreaLevel: 83, characterLevel: 96, xpGuidance: calculateXpGuidance(96, 83),
    rewardProgress: rewardProgressFor(dataset, progress), rewardAudit: buildRewardAudit(dataset, progress, new Set()), progressHistory: [], startupReconciliation: { state: 'none' }, logConnected: true,
    logDiagnostics: { path: settings.logPath, fileExists: true, watcherActive: true, pollingActive: true, lastParsedEventAt: now, characterLevel: 96, areaLevel: 83 }, detectionTrace: [],
    runStats: runStatsFor(emptyRunSession(), []), appUpdate: { status: 'up-to-date', currentVersion: '0.2.3', latestVersion: '0.2.3', message: 'ExileQuesting is up to date.' },
    recovery: { previousSessionUnclean: false, acknowledged: true }, lootFilter: workspace.lootFilter, passiveTreeHud: passiveTreeHudIdle(true), appVersion: '0.2.3',
    diagnosticsPath: 'C:\\Users\\Visual\\AppData\\Roaming\\ExileQuesting\\logs\\main.log',
  };
  const snapshot = readyBuildDoctorSnapshot({ profileId: buildProfile.id, profileName: buildProfile.name, generatedAt: now, baseline: baseline(), flaskInspection: utilityInspection() });

  ipcMain.handle('app:bootstrap', () => state);
  ipcMain.handle('pob:workspace', () => workspace);
  ipcMain.handle('build-doctor:analyze', () => snapshot);

  const window = new BrowserWindow({ show: false, width: 1920, height: 1080, backgroundColor: '#090b10', webPreferences: { preload: path.resolve('dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true } });
  await window.loadFile(path.resolve('dist/index.html'));
  await waitFor(window, `document.querySelector('.sidebar nav button')`, 'manager navigation');
  const clicked = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('.sidebar nav button')].find((node) => node.textContent?.includes('Build')); if (!(button instanceof HTMLButtonElement)) return false; button.click(); return true; })()`);
  if (!clicked) throw new Error('Build navigation button is missing.');
  await waitFor(window, `document.querySelector('.build-doctor-panel button')`, 'Build Doctor panel');
  const ran = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('.build-doctor-panel button')].find((node) => node.textContent?.includes('Run Build Doctor')); if (!(button instanceof HTMLButtonElement)) return false; button.click(); return true; })()`);
  if (!ran) throw new Error('Build Doctor run button is missing.');
  await waitFor(window, `document.querySelector('.build-doctor-metrics')`, 'Build Doctor ready metrics');
  await window.webContents.executeJavaScript(`document.querySelector('.build-doctor-panel')?.scrollIntoView({ block: 'start' })`);
  await new Promise((resolve) => setTimeout(resolve, 140));

  const desktop = await inspectLayout(window);
  if (desktop.scrollWidth > desktop.viewportWidth + 2) throw new Error(`Build Doctor causes desktop horizontal overflow (${desktop.scrollWidth} > ${desktop.viewportWidth}).`);
  if (!desktop.text.includes('7.84M') || !desktop.text.includes('guard skill') || !desktop.text.includes('ed354c2f8c42')) throw new Error('Build Doctor desktop fixture is missing deterministic metric/caveat/provenance text.');
  const desktopBytes = await capture(window, 'build-doctor-ready-1920x1080.png');

  window.setSize(1280, 720, false);
  await new Promise((resolve) => setTimeout(resolve, 180));
  await window.webContents.executeJavaScript(`document.querySelector('.build-doctor-panel')?.scrollIntoView({ block: 'start' })`);
  const compact = await inspectLayout(window);
  if (compact.scrollWidth > compact.viewportWidth + 2) throw new Error(`Build Doctor causes compact horizontal overflow (${compact.scrollWidth} > ${compact.viewportWidth}).`);
  if (compact.panelWidth > compact.viewportWidth + 2) throw new Error(`Build Doctor panel exceeds compact viewport (${compact.panelWidth} > ${compact.viewportWidth}).`);
  const compactBytes = await capture(window, 'build-doctor-ready-1280x720.png');

  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ generatedAt: now, desktopBytes, compactBytes, desktop, compact }, null, 2), 'utf8');
  window.destroy();
  for (const channel of ['app:bootstrap', 'pob:workspace', 'build-doctor:analyze']) ipcMain.removeHandler(channel);
  app.quit();
}

void main().catch((error) => { console.error(error); app.exit(1); });
