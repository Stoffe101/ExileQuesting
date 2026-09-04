import { app, BrowserWindow, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalizeCampaign } from '../src/core/campaign';
import { buildRewardAudit, rewardProgressFor } from '../src/core/rewards';
import { runStatsFor } from '../src/core/run';
import { calculateXpGuidance } from '../src/core/xp';
import { passiveTreeHudIdle } from '../src/core/passive-tree-hud-state';
import type { AppSettings, GuidanceAnnotation, LayoutHint, RawAreas, RawGuide, RunHistoryEntry, RunSession, RuntimeState } from '../src/core/types';

const output = path.resolve(process.argv[2] || 'artifacts/manager-visual');

const settings: AppSettings = {
  logPath: 'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Path of Exile\\logs\\LatestClient.txt',
  guidanceMode: 'beginner',
  leagueStart: true,
  bandit: 'none',
  showOptional: true,
  autoAdvance: true,
  autoShowOnZoneChange: true,
  overlayOpacity: 0.94,
  overlayScale: 1,
  overlayClickThrough: false,
  overlayMode: 'focus',
  overlayTypography: { preset: 'default', objective: 21, actions: 15, guidance: 13, labels: 10, status: 10, density: 'comfortable' },
  overlayPosition: { preset: 'top-right', locked: false, snapToEdges: true },
  overlayAutoCollapse: true,
  overlayAutoCollapseSeconds: 5,
  passiveTreeHudEnabled: false,
  passiveTreeHudPathPreview: false,
  reducedMotion: false,
  reducedTransparency: false,
  onboardingComplete: true,
  launchMinimized: false,
  autoCheckAppUpdates: true,
  autoDownloadAppUpdates: false,
  autoStartRunTimer: true,
  showRunTimerInOverlay: true,
  hotkeys: {
    toggleOverlay: 'CommandOrControl+Shift+H',
    nextStep: 'Alt+Shift+Right',
    previousStep: 'Alt+Shift+Left',
    toggleInteraction: 'CommandOrControl+Shift+I',
    cycleOverlayMode: 'CommandOrControl+Shift+M',
  },
};

async function json<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.resolve(file), 'utf8')) as T;
}

function visualRunStats() {
  const previous: RunHistoryEntry = {
    id: 'visual-previous',
    startedAt: '2026-09-02T18:00:00.000Z',
    finishedAt: '2026-09-02T18:38:00.000Z',
    totalMs: 2_280_000,
    townTimeMs: 330_000,
    splits: [
      { act: 1, at: '2026-09-02T18:18:00.000Z', elapsedMs: 1_080_000 },
      { act: 2, at: '2026-09-02T18:38:00.000Z', elapsedMs: 2_280_000 },
    ],
    visits: [
      { id: 'p-coast', areaId: '1_1_2', areaName: 'The Coast', act: 1, enteredAt: '2026-09-02T18:00:00.000Z', durationMs: 105_000, revisit: false, town: false },
      { id: 'p-mud', areaId: '1_1_3', areaName: 'The Mud Flats', act: 1, enteredAt: '2026-09-02T18:01:45.000Z', durationMs: 150_000, revisit: false, town: false },
      { id: 'p-submerged', areaId: '1_1_4_1', areaName: 'The Submerged Passage', act: 1, enteredAt: '2026-09-02T18:04:15.000Z', durationMs: 130_000, revisit: false, town: false },
      { id: 'p-town', areaId: '1_1_town', areaName: "Lioneye's Watch", act: 1, enteredAt: '2026-09-02T18:06:25.000Z', durationMs: 330_000, revisit: false, town: true },
    ],
  };

  const session: RunSession = {
    state: 'finished',
    startedAt: '2026-09-03T18:00:00.000Z',
    finishedAt: '2026-09-03T18:35:00.000Z',
    pausedMs: 0,
    townTimeMs: 420_000,
    currentAct: 2,
    splits: [
      { act: 1, at: '2026-09-03T18:16:40.000Z', elapsedMs: 1_000_000 },
      { act: 2, at: '2026-09-03T18:35:00.000Z', elapsedMs: 2_100_000 },
    ],
    lastAreaId: '2_7_5_1',
    lastZoneChangedAt: '2026-09-03T18:33:00.000Z',
    visits: [
      { id: 'c-coast', areaId: '1_1_2', areaName: 'The Coast', act: 1, enteredAt: '2026-09-03T18:00:00.000Z', durationMs: 125_000, revisit: false, town: false },
      { id: 'c-mud', areaId: '1_1_3', areaName: 'The Mud Flats', act: 1, enteredAt: '2026-09-03T18:02:05.000Z', durationMs: 220_000, revisit: false, town: false },
      { id: 'c-submerged', areaId: '1_1_4_1', areaName: 'The Submerged Passage', act: 1, enteredAt: '2026-09-03T18:05:45.000Z', durationMs: 115_000, revisit: false, town: false },
      { id: 'c-town-a', areaId: '1_1_town', areaName: "Lioneye's Watch", act: 1, enteredAt: '2026-09-03T18:07:40.000Z', durationMs: 260_000, revisit: false, town: true },
      { id: 'c-coast-revisit', areaId: '1_1_2', areaName: 'The Coast', act: 1, enteredAt: '2026-09-03T18:12:00.000Z', durationMs: 95_000, revisit: true, town: false },
      { id: 'c-crossroads', areaId: '2_7_2', areaName: 'The Crossroads', act: 2, enteredAt: '2026-09-03T18:13:35.000Z', durationMs: 180_000, revisit: false, town: false },
      { id: 'c-town-b', areaId: '2_2_town', areaName: 'The Forest Encampment', act: 2, enteredAt: '2026-09-03T18:16:35.000Z', durationMs: 160_000, revisit: false, town: true },
      { id: 'c-western', areaId: '2_7_5_1', areaName: 'The Western Forest', act: 2, enteredAt: '2026-09-03T18:19:15.000Z', durationMs: 240_000, revisit: false, town: false },
    ],
  };
  const current: RunHistoryEntry = {
    id: `${session.startedAt}:${session.finishedAt}`,
    startedAt: session.startedAt!,
    finishedAt: session.finishedAt!,
    totalMs: 2_100_000,
    townTimeMs: session.townTimeMs,
    splits: session.splits,
    visits: session.visits,
  };
  return runStatsFor(session, [previous, current], Date.parse(session.finishedAt!));
}

async function makeState(): Promise<RuntimeState> {
  const [guide, areas, annotations, layouts, manifest] = await Promise.all([
    json<RawGuide>('assets/campaign/guide.json'),
    json<RawAreas>('assets/campaign/areas.json'),
    json<GuidanceAnnotation[]>('assets/campaign/annotations.json'),
    json<LayoutHint[]>('assets/campaign/layouts.json'),
    json<{ commit: string; fetchedAt: string }>('assets/campaign/manifest.json'),
  ]);
  const dataset = normalizeCampaign(guide, areas, annotations, {
    repository: 'Lailloken/Exile-UI',
    commit: manifest.commit,
    fetchedAt: manifest.fetchedAt,
    license: 'MIT',
  }, layouts);
  const progress = Math.min(6, dataset.steps.length - 1);
  const now = new Date().toISOString();
  return {
    settings,
    dataset,
    sourceStatus: { state: 'current', activeCommit: manifest.commit, checkedAt: now, message: 'Campaign data is current and verified.' },
    progress,
    currentZone: "Cartographer's Hideout",
    currentAreaId: 'Hideout',
    currentAreaLevel: 83,
    characterLevel: 93,
    characterTracking: {
      activeProfileId: 'visual-character-main',
      active: {
        id: 'visual-character-main', runId: 'visual-run-main', characterName: 'VisualWitch', characterClass: 'Witch', characterLevel: 93, progress, act: dataset.steps[progress]?.act,
        provisional: false, freshStart: false, archived: false, buildProfileId: 'visual-maxroll', buildProfileName: 'Visual League Starter',
        identitySource: 'manual', identityConfidence: 'manual', identityReason: 'Visual fixture: exact character name confirmed by the user.', updatedAt: now, lastSeenAt: now,
      },
      profiles: [
        {
          id: 'visual-character-main', runId: 'visual-run-main', characterName: 'VisualWitch', characterClass: 'Witch', characterLevel: 93, progress, act: dataset.steps[progress]?.act,
          provisional: false, freshStart: false, archived: false, buildProfileId: 'visual-maxroll', buildProfileName: 'Visual League Starter',
          identitySource: 'manual', identityConfidence: 'manual', identityReason: 'Visual fixture: exact character name confirmed by the user.', updatedAt: now, lastSeenAt: now,
        },
        {
          id: 'visual-character-alt', runId: 'visual-run-alt', characterName: 'VisualRanger', characterClass: 'Ranger', characterLevel: 38, progress: Math.min(72, dataset.steps.length - 1), act: 4,
          provisional: false, freshStart: false, archived: false, identitySource: 'route-match', identityConfidence: 'inferred',
          identityReason: 'Visual fixture: saved route context matched this character conservatively.', updatedAt: now, lastSeenAt: '2026-09-03T17:00:00.000Z',
        },
      ],
    },
    xpGuidance: calculateXpGuidance(93, 83),
    rewardProgress: rewardProgressFor(dataset, progress),
    rewardAudit: buildRewardAudit(dataset, progress, new Set()),
    progressHistory: [
      { id: 'visual-1', at: now, from: 10, to: 6, reason: 'Manual progress change', confidence: 'manual', automatic: false },
      { id: 'visual-2', at: now, from: 6, to: 10, reason: 'Manual progress change', confidence: 'manual', automatic: false },
    ],
    startupReconciliation: { state: 'none' },
    logConnected: true,
    logDiagnostics: {
      path: settings.logPath,
      fileExists: true,
      watcherActive: true,
      pollingActive: true,
      lastFileChangeAt: now,
      lastParsedEventAt: now,
      lastRawEvent: "Generating level 83 area 'Hideout'",
      lastAreaId: 'Hideout',
      lastAreaName: "Cartographer's Hideout",
      areaLevel: 83,
      characterLevel: 93,
    },
    detectionTrace: [{
      id: 'trace-1', at: now, eventType: 'area-entered', areaName: "Cartographer's Hideout", progressBefore: progress,
      progressAfter: progress, stepIdBefore: dataset.steps[progress]?.id, stepIdAfter: dataset.steps[progress]?.id,
      reason: 'Current zone established without changing campaign progress.', raw: "You have entered Cartographer's Hideout.",
    }],
    runStats: visualRunStats(),
    appUpdate: { status: 'up-to-date', currentVersion: '0.2.5', latestVersion: '0.2.5', message: 'ExileQuesting 0.2.5 is up to date.' },
    recovery: { previousSessionUnclean: false, acknowledged: true },
    buildCoach: {
      profileId: 'visual-maxroll',
      profileName: 'Visual League Starter',
      sourceKind: 'maxroll',
      stageId: 'visual-act-1',
      stageTitle: 'Act 1 leveling',
      stageConfidence: 'high',
      currentGemTasks: [],
      maxroll: {
        guideTitle: 'Visual Maxroll Guide',
        guideUrl: 'https://maxroll.gg/poe/build-guides/visual',
        mode: 'league-start',
        compatibility: 'current',
        compatibilityMessage: 'Visual fixture uses current passive IDs.',
        nextPassive: { index: 4, total: 20, completed: 3, type: 'allocate', nodeId: 123, nodeName: 'Heart and Soul', nodeKind: 'notable', checkpoint: 1 },
        passiveComplete: false,
        passiveCompleted: 3,
        passiveTotal: 20,
        skillMilestones: [],
        equipmentMilestones: [],
        alternateSkillPaths: [],
      },
      loot: { profileId: 'visual-maxroll', profileName: 'Visual League Starter', gameVersion: '3.29', stageId: 'visual-act-1', stageTitle: 'Act 1 leveling', linkTargets: [], baseTargets: [], showChromaticRecipe: false, showSixSockets: false, warnings: [] },
      gearHints: [],
      craftingHints: [],
      vendorSearch: { warnings: [] },
    },
    lootFilter: { status: 'unconfigured', needsReload: false, message: 'Build-aware loot filter is not configured in this visual fixture.' },
    passiveTreeHud: passiveTreeHudIdle(false),
    appVersion: '0.2.5',
    diagnosticsPath: 'C:\\Users\\Visual\\AppData\\Roaming\\ExileQuesting\\logs\\main.log',
  };
}

function waitForLoad(window: BrowserWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Manager visual renderer timed out.')), 15_000);
    window.webContents.once('did-finish-load', () => { clearTimeout(timer); resolve(); });
    window.webContents.once('did-fail-load', (_event, code, description) => { clearTimeout(timer); reject(new Error(`Manager visual renderer failed: ${code} ${description}`)); });
  });
}

async function waitForManager(window: BrowserWindow): Promise<void> {
  const deadline = Date.now() + 12_000;
  let lastError = '';
  while (Date.now() < deadline) {
    try {
      const ready = await window.webContents.executeJavaScript(`Boolean(document.querySelector('.app-shell') && document.querySelector('.sidebar nav button') && document.querySelector('.manager-main > .page'))`);
      if (ready) return;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Manager shell did not render after bootstrap.${lastError ? ` Last renderer error: ${lastError}` : ''}`);
}

async function switchTab(window: BrowserWindow, label: string): Promise<void> {
  await waitForManager(window);
  const clicked = await window.webContents.executeJavaScript(`(() => {
    const button = [...document.querySelectorAll('.sidebar nav button')].find((node) => node.textContent?.includes(${JSON.stringify(label)}));
    if (!button) return false;
    button.click();
    return true;
  })()`);
  if (!clicked) throw new Error(`Missing navigation button: ${label}`);
  await new Promise((resolve) => setTimeout(resolve, 160));
  await waitForManager(window);
}

interface Scenario { name: string; width: number; height: number; tab: string; expectScrollable?: boolean; expectCompactSidebar?: boolean; ultrawide?: boolean }

const scenarios: Scenario[] = [
  { name: 'overview-1920x1080', width: 1920, height: 1080, tab: 'Overview', expectScrollable: true },
  { name: 'campaign-1920x1080', width: 1920, height: 1080, tab: 'Campaign' },
  { name: 'characters-1920x1080', width: 1920, height: 1080, tab: 'Characters' },
  { name: 'settings-1920x1080', width: 1920, height: 1080, tab: 'Settings', expectScrollable: true },
  { name: 'diagnostics-1920x1080', width: 1920, height: 1080, tab: 'Diagnostics', expectScrollable: true },
  { name: 'diagnostics-1536x864', width: 1536, height: 864, tab: 'Diagnostics', expectScrollable: true },
  { name: 'settings-1280x720', width: 1280, height: 720, tab: 'Settings', expectScrollable: true },
  { name: 'diagnostics-1000x700', width: 1000, height: 700, tab: 'Diagnostics', expectScrollable: true, expectCompactSidebar: true },
  { name: 'characters-1000x700', width: 1000, height: 700, tab: 'Characters', expectCompactSidebar: true },
  { name: 'overview-2752x1152', width: 2752, height: 1152, tab: 'Overview', ultrawide: true },
  { name: 'overview-3440x1440', width: 3440, height: 1440, tab: 'Overview', ultrawide: true },
  { name: 'diagnostics-3440x1440', width: 3440, height: 1440, tab: 'Diagnostics', ultrawide: true },
];

async function capture(window: BrowserWindow, filename: string): Promise<number> {
  const image = await window.webContents.capturePage();
  const png = image.toPNG();
  if (!png.length) throw new Error(`${filename}: empty screenshot.`);
  await fs.writeFile(path.join(output, filename), png);
  return png.length;
}

async function main(): Promise<void> {
  await app.whenReady();
  await fs.mkdir(output, { recursive: true });
  const state = await makeState();
  ipcMain.handle('app:bootstrap', () => state);

  const window = new BrowserWindow({
    show: false,
    width: 1200,
    height: 800,
    backgroundColor: '#090b10',
    webPreferences: {
      preload: path.resolve('dist-electron/preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      offscreen: true,
    },
  });

  window.webContents.on('render-process-gone', (_event, details) => console.error('Manager visual renderer exited.', details));
  window.webContents.on('preload-error', (_event, preloadPath, error) => console.error(`Manager visual preload failed: ${preloadPath}`, error));

  const loading = waitForLoad(window);
  await window.loadFile(path.resolve('dist/index.html'));
  await loading;
  await waitForManager(window);
  const trackingText = await window.webContents.executeJavaScript(`document.querySelector('.topbar')?.textContent ?? ''`);
  if (!trackingText.includes('VisualWitch')) throw new Error('Manager visual fixture did not render active character tracking in the top bar.');

  const captures: unknown[] = [];
  for (const scenario of scenarios) {
    window.setContentSize(scenario.width, scenario.height);
    await new Promise((resolve) => setTimeout(resolve, 120));
    await switchTab(window, scenario.tab);
    const metrics = await window.webContents.executeJavaScript(`(() => {
      const page = document.querySelector('.manager-main > .page');
      const sidebar = document.querySelector('.sidebar');
      const first = page?.firstElementChild;
      const diagnosticText = document.querySelector('.diagnostic-list dd');
      if (!page || !sidebar || !first) throw new Error('Manager visual structure is incomplete.');
      page.scrollTop = 0;
      const firstRect = first.getBoundingClientRect();
      return {
        viewportWidth: document.documentElement.clientWidth,
        viewportHeight: document.documentElement.clientHeight,
        documentScrollWidth: document.documentElement.scrollWidth,
        pageClientHeight: page.clientHeight,
        pageScrollHeight: page.scrollHeight,
        pageScrollWidth: page.scrollWidth,
        pageClientWidth: page.clientWidth,
        sidebarWidth: sidebar.getBoundingClientRect().width,
        contentWidth: firstRect.width,
        contentLeft: firstRect.left,
        diagnosticFontPx: diagnosticText ? parseFloat(getComputedStyle(diagnosticText).fontSize) : null,
      };
    })()`);

    if (metrics.documentScrollWidth > metrics.viewportWidth + 2) throw new Error(`${scenario.name}: document overflows horizontally (${metrics.documentScrollWidth} > ${metrics.viewportWidth}).`);
    if (metrics.pageScrollWidth > metrics.pageClientWidth + 2) throw new Error(`${scenario.name}: page overflows horizontally (${metrics.pageScrollWidth} > ${metrics.pageClientWidth}).`);
    if (scenario.expectScrollable && metrics.pageScrollHeight <= metrics.pageClientHeight) throw new Error(`${scenario.name}: expected a scrollable page but content height ${metrics.pageScrollHeight} <= viewport ${metrics.pageClientHeight}.`);
    if (scenario.expectCompactSidebar && metrics.sidebarWidth > 90) throw new Error(`${scenario.name}: compact sidebar did not activate (${metrics.sidebarWidth}px).`);
    if (scenario.ultrawide && metrics.contentWidth > 2220) throw new Error(`${scenario.name}: ultrawide reading column is too wide (${metrics.contentWidth}px).`);
    if (scenario.tab === 'Diagnostics' && (metrics.diagnosticFontPx ?? 0) < 12) throw new Error(`${scenario.name}: diagnostics text is too small (${metrics.diagnosticFontPx}px).`);

    const topBytes = await capture(window, `${scenario.name}.png`);
    let bottomBytes: number | undefined;
    let bottomScrollTop: number | undefined;
    if (scenario.expectScrollable) {
      bottomScrollTop = await window.webContents.executeJavaScript(`(() => {
        const page = document.querySelector('.manager-main > .page');
        if (!page) throw new Error('Missing page scroll container.');
        page.scrollTop = page.scrollHeight;
        return page.scrollTop;
      })()`);
      await new Promise((resolve) => setTimeout(resolve, 80));
      if ((bottomScrollTop ?? 0) <= 0) throw new Error(`${scenario.name}: page reports overflow but cannot actually scroll.`);
      bottomBytes = await capture(window, `${scenario.name}-bottom.png`);
      await window.webContents.executeJavaScript(`document.querySelector('.manager-main > .page')?.scrollTo(0, 0)`);
    }
    captures.push({ ...scenario, ...metrics, topBytes, bottomBytes, bottomScrollTop });
  }

  window.setContentSize(1280, 720);
  await new Promise((resolve) => setTimeout(resolve, 120));
  await switchTab(window, 'Campaign');

  const clickText = async (selector: string, label: string) => {
    const clicked = await window.webContents.executeJavaScript(`(() => {
      const node = [...document.querySelectorAll(${JSON.stringify(selector)})].find((entry) => entry.textContent?.includes(${JSON.stringify(label)}));
      if (!node) return false;
      node.click();
      return true;
    })()`);
    if (!clicked) throw new Error(`Guide 2 visual could not find ${label} in ${selector}.`);
    await new Promise((resolve) => setTimeout(resolve, 100));
  };
  const assertSurface = async (selector: string, name: string) => {
    const metrics = await window.webContents.executeJavaScript(`(() => {
      const node = document.querySelector(${JSON.stringify(selector)});
      if (!node) return null;
      const rect = node.getBoundingClientRect();
      return { left: rect.left, right: rect.right, top: rect.top, bottom: rect.bottom, viewportWidth: innerWidth, viewportHeight: innerHeight, scrollWidth: node.scrollWidth, clientWidth: node.clientWidth };
    })()`);
    if (!metrics) throw new Error(`${name}: expected surface ${selector} did not render.`);
    if (metrics.right > metrics.viewportWidth + 2 || metrics.left < -2 || metrics.scrollWidth > metrics.clientWidth + 2) throw new Error(`${name}: surface overflows horizontally: ${JSON.stringify(metrics)}`);
    return metrics;
  };

  for (const label of ['Act map', 'Timeline', 'Completion audit', 'Route']) {
    await clickText('.g2-view-tabs button', label);
    await assertSurface('.g2-page', `campaign-${label}`);
    captures.push({ name: `campaign-${label.toLowerCase().replace(/\s+/g, '-')}-1280x720`, bytes: await capture(window, `campaign-${label.toLowerCase().replace(/\s+/g, '-')}-1280x720.png`) });
  }

  await clickText('.lost-button', "I'M LOST");
  await assertSurface('.g2-lost-panel', 'campaign-lost');
  captures.push({ name: 'campaign-lost-1280x720', bytes: await capture(window, 'campaign-lost-1280x720.png') });
  await window.webContents.executeJavaScript(`document.querySelector('.g2-lost-panel header button')?.click()`);
  await new Promise((resolve) => setTimeout(resolve, 80));

  const openPalette = async () => {
    await window.webContents.executeJavaScript(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))`);
    await new Promise((resolve) => setTimeout(resolve, 80));
    await assertSurface('.command-palette', 'command-palette');
  };
  await openPalette();
  captures.push({ name: 'command-palette-1280x720', bytes: await capture(window, 'command-palette-1280x720.png') });
  await clickText('.command-results button', 'Open Passive Plan');
  await assertSurface('.passive-plan-modal', 'passive-plan');
  const passiveText = await window.webContents.executeJavaScript(`document.querySelector('.passive-plan-modal')?.textContent ?? ''`);
  if (!passiveText.includes('Heart and Soul') || !passiveText.includes('ORDERED MAXROLL PLAN')) throw new Error('Passive Plan visual fixture did not render exact Maxroll guidance.');
  captures.push({ name: 'passive-plan-1280x720', bytes: await capture(window, 'passive-plan-1280x720.png') });
  await window.webContents.executeJavaScript(`document.querySelector('.passive-plan-close')?.click()`);
  await new Promise((resolve) => setTimeout(resolve, 80));

  await openPalette();
  await clickText('.command-results button', 'Open current zone diagram');
  await assertSurface('.zone-diagram-modal', 'zone-diagram');
  captures.push({ name: 'zone-diagram-1280x720', bytes: await capture(window, 'zone-diagram-1280x720.png') });
  await window.webContents.executeJavaScript(`document.querySelector('.zone-diagram-modal > header button')?.click()`);
  await new Promise((resolve) => setTimeout(resolve, 80));

  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), captures }, null, 2), 'utf8');
  window.destroy();
  ipcMain.removeHandler('app:bootstrap');
  app.quit();
}

void main().catch((error) => {
  console.error(error);
  app.exit(1);
});
