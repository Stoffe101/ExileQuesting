import { app, BrowserWindow, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalizeCampaign } from '../src/core/campaign';
import { buildPlannerSnapshot, normalizeBuildPlannerState } from '../src/core/build-planner';
import { readyBuildDoctorSnapshot } from '../src/core/build-doctor';
import { readyCandidateItemAnalysis } from '../src/core/build-doctor-candidate-item';
import { measuredConfigurationDependency, pobUptimeEvidence, readyDependencyScan } from '../src/core/build-doctor-dependencies';
import { readyPassiveContributionAnalysis, type BuildDoctorPassiveCandidateList } from '../src/core/build-doctor-passive-contribution';
import { buildRewardAudit, rewardProgressFor } from '../src/core/rewards';
import { emptyRunSession, runStatsFor } from '../src/core/run';
import { calculateXpGuidance } from '../src/core/xp';
import { passiveTreeHudIdle } from '../src/core/passive-tree-hud-state';
import type { BuildProfile } from '../src/core/build-profiles';
import type { PobCalculationResult, PobConstraintMetrics, PobFlaskInspectionResult, PobFlaskProfile, PobPerturbationComparison } from '../src/core/pob-calculation';
import type { AppSettings, GuidanceAnnotation, LayoutHint, RawAreas, RawGuide, RuntimeState } from '../src/core/types';

const output = path.resolve(process.argv[2] || 'artifacts/manager-visual/build-doctor');
const candidateItemText = `Item Class: Boots
Rarity: Rare
Storm Pace
Sharkskin Boots
--------
Requirements:
Level: 68
Dex: 120
--------
+95 to maximum Life
+22% to Fire Resistance
+35% to Cold Resistance
30% increased Movement Speed`;

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
  adapterVersion: '0.6.0',
};

const constraintKernel = { ...kernel, adapterVersion: 'constraint-0.1.0' };

function baseline(): PobCalculationResult {
  return {
    protocolVersion: 1, requestId: 'visual-doctor-baseline', kernel,
    scenario: { scenario: 'imported', label: 'Imported PoB state', notes: ['Visual deterministic fixture.'] },
    offence: { mainSkill: 'Power Siphon', totalDps: 7_842_320, fullDps: 7_842_320, averageHit: 412_500, speed: 5.82, hitChance: 100, critChance: 78.4, critMultiplier: 4.62 },
    defence: {
      life: 3_860, energyShield: 4_920, mana: 1_170, effectiveHitPool: 182_440, armour: 13_800, evasion: 42_700, spellSuppressionChance: 100,
      fireResistance: 75, coldResistance: 75, lightningResistance: 75, chaosResistance: 42,
      fireResistanceOverCap: 35, coldResistanceOverCap: 30, lightningResistanceOverCap: 28, chaosResistanceOverCap: 0,
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

function flaskComparison(flask: PobFlaskProfile, after: PobCalculationResult): PobPerturbationComparison {
  const before = baseline();
  before.requestId = `visual-dependency-before-${flask.slot}`;
  after.requestId = `visual-dependency-after-${flask.slot}`;
  return {
    perturbations: [{ kind: 'toggle-flask', slot: flask.slot }],
    stateTransition: { kind: 'flask-active', slot: flask.slot, fromActive: true, toActive: false },
    before,
    after,
  };
}

function dependencyScan(now: string) {
  const inspection = utilityInspection();
  const diamond = inspection.flasks[0];
  const granite = inspection.flasks[1];

  const diamondAfter = baseline();
  diamondAfter.offence = { ...diamondAfter.offence, totalDps: 6_420_000, fullDps: 6_420_000, critChance: 58.1 };

  const graniteAfter = baseline();
  graniteAfter.defence = {
    ...graniteAfter.defence,
    effectiveHitPool: 150_000,
    armour: 6_900,
    maximumHit: { ...graniteAfter.defence.maximumHit, physical: 21_000 },
  };

  const diamondUptime = pobUptimeEvidence({
    slot: 'Flask 1', name: 'Diamond Flask', baseName: 'Diamond Flask', active: true, supported: true,
    sourceLine: '^8Flask uptime: ^778%^8 average, ^760%^8 minimum', averagePercent: 78, minimumPercent: 60,
  });
  const graniteUptime = pobUptimeEvidence(undefined, 'Pinned PoB did not expose a supported uptime line for Granite Flask.');

  return readyDependencyScan({
    profileId: 'visual-build-doctor',
    profileName: 'Level 96 Trickster · Build Doctor fixture',
    generatedAt: now,
    kernel: {
      pobRepository: kernel.pobRepository,
      pobCommit: kernel.pobCommit,
      runtime: kernel.runtime,
      runtimeRevision: kernel.runtimeRevision,
      adapterVersion: kernel.adapterVersion,
    },
    dependencies: [
      measuredConfigurationDependency(diamond, flaskComparison(diamond, diamondAfter), diamondUptime),
      measuredConfigurationDependency(granite, flaskComparison(granite, graniteAfter), graniteUptime),
    ],
  });
}

function candidateConstraints(): { before: PobConstraintMetrics; after: PobConstraintMetrics } {
  const before: PobConstraintMetrics = {
    attributes: {
      strength: { current: 160, required: 155 },
      dexterity: { current: 180, required: 160 },
      intelligence: { current: 220, required: 200 },
    },
    reservation: { manaUnreserved: 120, manaUnreservedPercent: 10, lifeUnreserved: 3_860, lifeUnreservedPercent: 100 },
    spellSuppression: { chance: 100, effectiveChance: 100, overCap: 10, cap: 100 },
    resistances: {
      fire: { current: 75, total: 110, overCap: 35, missing: 0 },
      cold: { current: 75, total: 105, overCap: 30, missing: 0 },
      lightning: { current: 75, total: 103, overCap: 28, missing: 0 },
      chaos: { current: 42, total: 42, overCap: 0, missing: 33 },
    },
  };
  const after: PobConstraintMetrics = {
    attributes: {
      strength: { current: 150, required: 155 },
      dexterity: { current: 180, required: 160 },
      intelligence: { current: 220, required: 200 },
    },
    reservation: { manaUnreserved: 120, manaUnreservedPercent: 10, lifeUnreserved: 4_060, lifeUnreservedPercent: 100 },
    spellSuppression: { chance: 92, effectiveChance: 92, overCap: 0, cap: 100 },
    resistances: {
      fire: { current: 68, total: 68, overCap: 0, missing: 7 },
      cold: { current: 75, total: 83, overCap: 8, missing: 0 },
      lightning: { current: 75, total: 103, overCap: 28, missing: 0 },
      chaos: { current: 42, total: 42, overCap: 0, missing: 33 },
    },
  };
  return { before, after };
}

function candidateAnalysis(now: string) {
  const before = baseline();
  before.requestId = 'visual-candidate-before';
  const after = baseline();
  after.requestId = 'visual-candidate-after';
  after.offence = { ...after.offence, totalDps: 9_018_668, fullDps: 9_018_668 };
  after.defence = {
    ...after.defence,
    life: 4_060,
    spellSuppressionChance: 92,
    fireResistance: 68,
    fireResistanceOverCap: 0,
    coldResistanceOverCap: 8,
    maximumHit: { ...after.defence.maximumHit, physical: 31_834 },
  };
  const constraints = candidateConstraints();
  return readyCandidateItemAnalysis({
    profileId: 'visual-build-doctor',
    profileName: 'Level 96 Trickster · Build Doctor fixture',
    generatedAt: now,
    slot: 'Boots',
    candidateLabel: 'Storm Pace · Sharkskin Boots',
    comparison: {
      perturbations: [{ kind: 'replace-item', slot: 'Boots', itemText: candidateItemText }],
      before,
      after,
    },
    constraint: {
      comparison: { slot: 'Boots', before: constraints.before, after: constraints.after },
      kernel: constraintKernel,
    },
  });
}

function passiveCandidates(): BuildDoctorPassiveCandidateList {
  return {
    schemaVersion: 1,
    status: 'ready',
    profileId: 'visual-build-doctor',
    profileName: 'Level 96 Trickster · Build Doctor fixture',
    treeVersion: '3.29',
    candidates: [
      { nodeId: 12345, name: 'Magebane', kind: 'keystone' },
      { nodeId: 23456, name: 'Inveterate', kind: 'notable' },
      { nodeId: 34567, name: 'Evasion and Energy Shield', kind: 'normal' },
    ],
    message: '3 allocated normal/notable/keystone passive points are available for isolated PoB contribution measurement.',
  };
}

function passiveAnalysis(now: string) {
  const before = baseline();
  before.requestId = 'visual-passive-before';
  const after = baseline();
  after.requestId = 'visual-passive-after';
  after.offence = { ...after.offence, totalDps: 7_058_088, fullDps: 7_058_088 };
  after.defence = {
    ...after.defence,
    effectiveHitPool: 164_196,
    spellSuppressionChance: 88,
    maximumHit: { ...after.defence.maximumHit, physical: 27_203 },
  };
  return readyPassiveContributionAnalysis({
    profileId: 'visual-build-doctor',
    profileName: 'Level 96 Trickster · Build Doctor fixture',
    generatedAt: now,
    node: { nodeId: 23456, name: 'Inveterate', kind: 'notable' },
    comparison: {
      perturbations: [{ kind: 'passive-node', operation: 'deallocate', nodeId: 23456 }],
      before,
      after,
    },
  });
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
      viewportHeight: document.documentElement.clientHeight,
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
    currentZone: 'Karui Shores', currentAreaId: '2_11_endgame_town', currentAreaLevel: 83, characterLevel: 96, xpGuidance: calculateXpGuidance(96, 83),
    rewardProgress: rewardProgressFor(dataset, progress), rewardAudit: buildRewardAudit(dataset, progress, new Set()), progressHistory: [], startupReconciliation: { state: 'none' }, logConnected: true,
    logDiagnostics: { path: settings.logPath, fileExists: true, watcherActive: true, pollingActive: true, lastParsedEventAt: now, characterLevel: 96, areaLevel: 83 }, detectionTrace: [],
    runStats: runStatsFor(emptyRunSession(), []), appUpdate: { status: 'up-to-date', currentVersion: '0.2.3', latestVersion: '0.2.3', message: 'ExileQuesting is up to date.' },
    recovery: { previousSessionUnclean: false, acknowledged: true }, lootFilter: workspace.lootFilter, passiveTreeHud: passiveTreeHudIdle(true), appVersion: '0.2.3',
    diagnosticsPath: 'C:\\Users\\Visual\\AppData\\Roaming\\ExileQuesting\\logs\\main.log',
  };
  const snapshot = readyBuildDoctorSnapshot({ profileId: buildProfile.id, profileName: buildProfile.name, generatedAt: now, baseline: baseline(), flaskInspection: utilityInspection() });
  const dependencies = dependencyScan(now);
  const candidate = candidateAnalysis(now);
  const passiveCandidateList = passiveCandidates();
  const passive = passiveAnalysis(now);

  ipcMain.handle('app:bootstrap', () => state);
  ipcMain.handle('pob:workspace', () => workspace);
  ipcMain.handle('build-doctor:analyze', () => snapshot);
  ipcMain.handle('build-doctor:dependencies', () => dependencies);
  ipcMain.handle('build-doctor:candidate-item', () => candidate);
  ipcMain.handle('build-doctor:passive-candidates', () => passiveCandidateList);
  ipcMain.handle('build-doctor:passive-contribution', () => passive);

  const window = new BrowserWindow({ show: false, width: 1200, height: 800, backgroundColor: '#090b10', webPreferences: { preload: path.resolve('dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true } });
  await window.loadFile(path.resolve('dist/index.html'));
  await waitFor(window, `document.querySelector('.sidebar nav button')`, 'manager navigation');
  const clicked = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('.sidebar nav button')].find((node) => node.textContent?.includes('Build')); if (!(button instanceof HTMLButtonElement)) return false; button.click(); return true; })()`);
  if (!clicked) throw new Error('Build navigation button is missing.');
  await waitFor(window, `document.querySelector('.build-doctor-panel button')`, 'Build Doctor panel');
  const ran = await window.webContents.executeJavaScript(`(() => { const button = [...document.querySelectorAll('.build-doctor-panel button')].find((node) => node.textContent?.includes('Run Build Doctor')); if (!(button instanceof HTMLButtonElement)) return false; button.click(); return true; })()`);
  if (!ran) throw new Error('Build Doctor run button is missing.');
  await waitFor(window, `document.querySelector('.build-doctor-metrics')`, 'Build Doctor ready metrics');

  window.setSize(1920, 1080, false);
  await new Promise((resolve) => setTimeout(resolve, 180));
  await window.webContents.executeJavaScript(`document.querySelector('.build-doctor-panel')?.scrollIntoView({ block: 'start' })`);
  await new Promise((resolve) => setTimeout(resolve, 120));

  const desktop = await inspectLayout(window);
  if (desktop.viewportWidth < 1900 || desktop.viewportHeight < 1000) throw new Error(`Build Doctor desktop smoke was clamped to ${desktop.viewportWidth}x${desktop.viewportHeight}; expected approximately 1920x1080.`);
  if (desktop.scrollWidth > desktop.viewportWidth + 2) throw new Error(`Build Doctor causes desktop horizontal overflow (${desktop.scrollWidth} > ${desktop.viewportWidth}).`);
  if (!desktop.text.includes('7.84M') || !desktop.text.includes('guard skill') || !desktop.text.includes('ed354c2f8c42')) throw new Error('Build Doctor desktop fixture is missing deterministic metric/caveat/provenance text.');
  const desktopBytes = await capture(window, 'build-doctor-ready-1920x1080.png');

  const dependencyClicked = await window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('.build-doctor-dependencies button')].find((node) => node.textContent?.includes('Measure 2 active utilities'));
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  if (!dependencyClicked) throw new Error('Build Doctor dependency measurement button is missing.');
  await waitFor(window, `document.querySelectorAll('.build-doctor-dependency-list article').length === 2`, 'Build Doctor dependency evidence');
  await window.webContents.executeJavaScript(`document.querySelector('.build-doctor-dependencies')?.scrollIntoView({ block: 'start' })`);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const dependencyDesktop = await inspectLayout(window);
  if (!dependencyDesktop.text.includes('Diamond Flask') || !dependencyDesktop.text.includes('DPS -18.1%') || !dependencyDesktop.text.includes('Granite Flask') || !dependencyDesktop.text.includes('Phys hit -27.4%')) {
    throw new Error('Build Doctor dependency fixture is missing measured reversible PoB deltas.');
  }
  if (!dependencyDesktop.text.includes('PoB uptime estimate') || !dependencyDesktop.text.includes('78% avg · 60% min') || !dependencyDesktop.text.includes('unsupported')) {
    throw new Error('Build Doctor dependency fixture is missing separate supported/unsupported PoB uptime evidence.');
  }
  if (!dependencyDesktop.text.includes('not observed encounter uptime') || !dependencyDesktop.text.includes('never multiplied')) {
    throw new Error('Build Doctor dependency fixture lost its uptime evidence boundary.');
  }
  const dependencyDesktopBytes = await capture(window, 'build-doctor-dependencies-1920x1080.png');

  await waitFor(window, `document.querySelectorAll('#build-doctor-passive-node option').length === 3`, 'Passive Contribution Doctor candidate list');
  const passiveSubmitted = await window.webContents.executeJavaScript(`(() => {
    const select = document.querySelector('#build-doctor-passive-node');
    if (!(select instanceof HTMLSelectElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set;
    setter?.call(select, '23456');
    select.dispatchEvent(new Event('change', { bubbles: true }));
    const button = [...document.querySelectorAll('.build-doctor-passive-contribution button')].find((node) => node.textContent?.includes('Measure selected point in PoB'));
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  if (!passiveSubmitted) throw new Error('Passive Contribution Doctor selection/measurement controls are missing.');
  await waitFor(window, `document.querySelector('.build-doctor-passive-result')`, 'Passive Contribution Doctor result');
  await window.webContents.executeJavaScript(`document.querySelector('.build-doctor-passive-contribution')?.scrollIntoView({ block: 'start' })`);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const passiveDesktop = await inspectLayout(window);
  if (!passiveDesktop.text.includes('Inveterate') || !passiveDesktop.text.includes('Notable · node #23456') || !passiveDesktop.text.includes('PoB damage') || !passiveDesktop.text.includes('-10%')) {
    throw new Error('Passive Contribution Doctor fixture is missing the deterministic node/offence contribution.');
  }
  if (!passiveDesktop.text.includes('Spell suppression') || !passiveDesktop.text.includes('100%') || !passiveDesktop.text.includes('88%') || !passiveDesktop.text.includes('-12 pts')) {
    throw new Error('Passive Contribution Doctor fixture is missing the suppression contribution.');
  }
  if (!passiveDesktop.text.includes('legal connected tree') || !passiveDesktop.text.includes('downstream') || !passiveDesktop.text.includes('efficiency')) {
    throw new Error('Passive Contribution Doctor fixture lost its isolated-contribution evidence boundary.');
  }
  const passiveDesktopBytes = await capture(window, 'build-doctor-passive-contribution-1920x1080.png');

  const candidateSubmitted = await window.webContents.executeJavaScript(`(() => {
    const textarea = document.querySelector('.build-doctor-candidate-text');
    if (!(textarea instanceof HTMLTextAreaElement)) return false;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    setter?.call(textarea, ${JSON.stringify(candidateItemText)});
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    const button = [...document.querySelectorAll('.build-doctor-candidate button')].find((node) => node.textContent?.includes('Check candidate in PoB'));
    if (!(button instanceof HTMLButtonElement)) return false;
    button.click();
    return true;
  })()`);
  if (!candidateSubmitted) throw new Error('Candidate Upgrade Doctor paste/submit controls are missing.');
  await waitFor(window, `document.querySelector('.build-doctor-candidate-result')`, 'Candidate Upgrade Doctor result');
  await window.webContents.executeJavaScript(`document.querySelector('.build-doctor-candidate')?.scrollIntoView({ block: 'start' })`);
  await new Promise((resolve) => setTimeout(resolve, 120));
  const candidateDesktop = await inspectLayout(window);
  if (!candidateDesktop.text.includes('Storm Pace · Sharkskin Boots') || !candidateDesktop.text.includes('PoB damage') || !candidateDesktop.text.includes('+15%')) {
    throw new Error('Candidate Upgrade Doctor fixture is missing the deterministic offence comparison.');
  }
  if (!candidateDesktop.text.includes('Spell suppression') || !candidateDesktop.text.includes('100%') || !candidateDesktop.text.includes('92%') || !candidateDesktop.text.includes('-8 pts')) {
    throw new Error('Candidate Upgrade Doctor fixture is missing the suppression metric regression.');
  }
  if (!candidateDesktop.text.includes('Fire overcap') || !candidateDesktop.text.includes('35%') || !candidateDesktop.text.includes('0%') || !candidateDesktop.text.includes('-35 pts')) {
    throw new Error('Candidate Upgrade Doctor fixture is missing the resistance-overcap metric regression.');
  }
  if (!candidateDesktop.text.includes('HARD CONSTRAINT CHECK') || !candidateDesktop.text.includes('Pinned PoB transition evidence') || !candidateDesktop.text.includes('3 broken')) {
    throw new Error('Candidate Upgrade Doctor fixture is missing verified hard-constraint summary evidence.');
  }
  if (!candidateDesktop.text.includes('Strength') || !candidateDesktop.text.includes('160 / 155 required') || !candidateDesktop.text.includes('150 / 155 required')) {
    throw new Error('Candidate Upgrade Doctor fixture is missing the proven Strength requirement break.');
  }
  if (!candidateDesktop.text.includes('Fire resistance') || !candidateDesktop.text.includes('7 missing') || !candidateDesktop.text.includes('Spell suppression cap') || !candidateDesktop.text.includes('92% / 100% cap')) {
    throw new Error('Candidate Upgrade Doctor fixture is missing proven resistance/suppression failures.');
  }
  if (!candidateDesktop.text.includes('Cold resistance') || !candidateDesktop.text.includes('Weaker buffer') || !candidateDesktop.text.includes('constraint-0.1.0')) {
    throw new Error('Candidate Upgrade Doctor fixture is missing verified buffer/provenance evidence.');
  }
  if (!candidateDesktop.text.includes('reservation validity') || !candidateDesktop.text.includes('trade cost') || !candidateDesktop.text.includes('coordinated')) {
    throw new Error('Candidate Upgrade Doctor fixture lost its remaining unresolved-transition boundary.');
  }
  const candidateDesktopBytes = await capture(window, 'build-doctor-candidate-1920x1080.png');

  window.setSize(1280, 720, false);
  await new Promise((resolve) => setTimeout(resolve, 180));
  await window.webContents.executeJavaScript(`document.querySelector('.build-doctor-passive-contribution')?.scrollIntoView({ block: 'start' })`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const passiveCompact = await inspectLayout(window);
  if (passiveCompact.viewportWidth < 1270 || passiveCompact.viewportWidth > 1290 || passiveCompact.viewportHeight < 700 || passiveCompact.viewportHeight > 730) throw new Error(`Passive Contribution Doctor compact smoke rendered at ${passiveCompact.viewportWidth}x${passiveCompact.viewportHeight}; expected approximately 1280x720.`);
  if (passiveCompact.scrollWidth > passiveCompact.viewportWidth + 2) throw new Error(`Passive Contribution Doctor causes compact horizontal overflow (${passiveCompact.scrollWidth} > ${passiveCompact.viewportWidth}).`);
  if (!passiveCompact.text.includes('Inveterate') || !passiveCompact.text.includes('Spell suppression') || !passiveCompact.text.includes('legal connected tree')) throw new Error('Passive Contribution Doctor compact evidence is incomplete.');
  const passiveCompactBytes = await capture(window, 'build-doctor-passive-contribution-1280x720.png');

  await window.webContents.executeJavaScript(`document.querySelector('.build-doctor-candidate')?.scrollIntoView({ block: 'start' })`);
  await new Promise((resolve) => setTimeout(resolve, 100));
  const compact = await inspectLayout(window);
  if (compact.viewportWidth < 1270 || compact.viewportWidth > 1290 || compact.viewportHeight < 700 || compact.viewportHeight > 730) throw new Error(`Build Doctor compact smoke rendered at ${compact.viewportWidth}x${compact.viewportHeight}; expected approximately 1280x720.`);
  if (compact.scrollWidth > compact.viewportWidth + 2) throw new Error(`Build Doctor causes compact horizontal overflow (${compact.scrollWidth} > ${compact.viewportWidth}).`);
  if (compact.panelWidth > compact.viewportWidth + 2) throw new Error(`Build Doctor panel exceeds compact viewport (${compact.panelWidth} > ${compact.viewportWidth}).`);
  if (!compact.text.includes('Storm Pace · Sharkskin Boots') || !compact.text.includes('HARD CONSTRAINT CHECK') || !compact.text.includes('3 broken') || !compact.text.includes('Strength') || !compact.text.includes('7 missing') || !compact.text.includes('Weaker buffer')) {
    throw new Error('Candidate Upgrade Doctor compact hard-constraint evidence is incomplete.');
  }
  const compactBytes = await capture(window, 'build-doctor-candidate-1280x720.png');

  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({
    generatedAt: now,
    desktopBytes,
    dependencyDesktopBytes,
    passiveDesktopBytes,
    candidateDesktopBytes,
    passiveCompactBytes,
    compactBytes,
    desktop,
    dependencyDesktop,
    passiveDesktop,
    candidateDesktop,
    passiveCompact,
    compact,
  }, null, 2), 'utf8');
  window.destroy();
  for (const channel of [
    'app:bootstrap',
    'pob:workspace',
    'build-doctor:analyze',
    'build-doctor:dependencies',
    'build-doctor:candidate-item',
    'build-doctor:passive-candidates',
    'build-doctor:passive-contribution',
  ]) ipcMain.removeHandler(channel);
  app.quit();
}

void main().catch((error) => { console.error(error); app.exit(1); });