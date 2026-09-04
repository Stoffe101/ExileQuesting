import { app, BrowserWindow, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalizeCampaign } from '../src/core/campaign';
import { buildRewardAudit, rewardProgressFor } from '../src/core/rewards';
import { emptyRunSession, runStatsFor } from '../src/core/run';
import { runCampaignSimulationSuite } from '../src/core/simulation-suite';
import { calculateXpGuidance } from '../src/core/xp';
import type { AppSettings, GuidanceAnnotation, LayoutHint, OverlayMode, RawAreas, RawGuide, RuntimeState } from '../src/core/types';

const settings: AppSettings = {
  logPath: '', guidanceMode: 'beginner', leagueStart: true, bandit: 'none', showOptional: true, autoAdvance: true, autoShowOnZoneChange: true,
  overlayOpacity: 0.94, overlayScale: 1, overlayClickThrough: false, overlayMode: 'focus',
  overlayTypography: { preset: 'default', objective: 21, actions: 15, guidance: 13, labels: 10, status: 10, density: 'comfortable' },
  overlayPosition: { preset: 'top-right', locked: false, snapToEdges: true },
  overlayAutoCollapse: true, overlayAutoCollapseSeconds: 5, reducedMotion: false, reducedTransparency: false,
  onboardingComplete: true, launchMinimized: false, autoCheckAppUpdates: false, autoDownloadAppUpdates: false,
  autoStartRunTimer: true, showRunTimerInOverlay: true,
  hotkeys: {
    toggleOverlay: 'CommandOrControl+Shift+H', nextStep: 'Alt+Shift+Right', previousStep: 'Alt+Shift+Left',
    toggleInteraction: 'CommandOrControl+Shift+I', cycleOverlayMode: 'CommandOrControl+Shift+M',
  },
};

async function json<T>(file: string): Promise<T> {
  return JSON.parse(await fs.readFile(path.resolve(file), 'utf8')) as T;
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
    repository: 'Lailloken/Exile-UI', commit: manifest.commit, fetchedAt: manifest.fetchedAt, license: 'MIT',
  }, layouts);
  const progress = 0;
  return {
    settings,
    dataset,
    sourceStatus: { state: 'current', activeCommit: manifest.commit, message: 'Lab smoke fixture.' },
    progress,
    rewardProgress: rewardProgressFor(dataset, progress),
    rewardAudit: buildRewardAudit(dataset, progress, new Set()),
    progressHistory: [], startupReconciliation: { state: 'none' }, logConnected: false,
    logDiagnostics: { path: '', fileExists: false, watcherActive: false, pollingActive: false },
    detectionTrace: [], runStats: runStatsFor(emptyRunSession(), []),
    appUpdate: { status: 'disabled', currentVersion: '0.1.4', message: 'Disabled in Lab smoke.' },
    recovery: { previousSessionUnclean: false, acknowledged: true }, appVersion: '0.1.4', diagnosticsPath: '',
  };
}

function waitForLoad(window: BrowserWindow): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Lab renderer load timed out.')), 25_000);
    window.webContents.once('did-finish-load', () => { clearTimeout(timeout); resolve(); });
    window.webContents.once('did-fail-load', (_event, code, description) => { clearTimeout(timeout); reject(new Error(`Lab renderer failed: ${code} ${description}`)); });
  });
}

async function waitForLab(window: BrowserWindow): Promise<void> {
  const deadline = Date.now() + 25_000;
  while (Date.now() < deadline) {
    const status = await window.webContents.executeJavaScript(`({
      ready: Boolean(document.querySelector('[data-testid="lab-ready"]')),
      state: document.readyState,
      text: document.body?.textContent?.slice(0, 240) ?? ''
    })`).catch(() => ({ ready: false, state: 'execute-error', text: '' })) as { ready: boolean; state: string; text: string };
    if (status.ready) return;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  const diagnostics = await window.webContents.executeJavaScript(`({
    state: document.readyState,
    text: document.body?.textContent?.slice(0, 500) ?? '',
    htmlLength: document.documentElement?.outerHTML?.length ?? 0
  })`).catch(() => ({ state: 'execute-error', text: '', htmlLength: 0 }));
  throw new Error(`Pre-playtest Lab did not render after bootstrap: ${JSON.stringify(diagnostics)}`);
}

async function main(): Promise<void> {
  await app.whenReady();
  let state = await makeState();
  let lastPreview = -1;
  ipcMain.handle('app:bootstrap', () => state);
  ipcMain.handle('overlay:demo', (_event, input: { progress?: number; mode?: OverlayMode; characterLevel?: number; areaLevel?: number }) => {
    const progress = Math.max(0, Math.min(Math.trunc(Number(input?.progress) || 0), state.dataset.steps.length - 1));
    lastPreview = progress;
    state = { ...state, progress, settings: { ...state.settings, overlayMode: input?.mode ?? 'focus' }, characterLevel: input?.characterLevel, currentAreaLevel: input?.areaLevel, xpGuidance: calculateXpGuidance(input?.characterLevel, input?.areaLevel) };
    return state;
  });
  ipcMain.handle('overlay:demo-stop', () => state);
  ipcMain.handle('simulation:run', () => runCampaignSimulationSuite(state.dataset));
  ipcMain.handle('simulation:export', () => false);
  ipcMain.handle('diagnostics:replay', () => null);
  ipcMain.handle('diagnostics:replay-export', () => false);

  const window = new BrowserWindow({
    show: false, width: 1120, height: 780, backgroundColor: '#0b0e13',
    webPreferences: { preload: path.resolve('dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true },
  });
  window.webContents.on('preload-error', (_event, preloadPath, error) => console.error(`Lab preload failed: ${preloadPath}`, error));
  window.webContents.on('render-process-gone', (_event, details) => console.error('Lab renderer exited.', details));
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error(`Lab renderer console [${level}] ${message} (${sourceId}:${line})`);
  });

  const loading = waitForLoad(window);
  await window.loadFile(path.resolve('dist/index.html'), { query: { mode: 'lab' } });
  await loading;
  await waitForLab(window);

  const result = await window.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const preview = document.querySelector('[data-testid="lab-preview"]');
    const walk = document.querySelector('[data-testid="lab-autowalk"]');
    const simulate = document.querySelector('[data-testid="lab-simulate"]');
    const slider = document.querySelector('input[type="range"]');
    if (!preview || !walk || !simulate || !slider) throw new Error('Lab controls are missing.');
    preview.click();
    await wait(350);
    const before = Number(slider.value);
    walk.click();
    await wait(2200);
    const after = Number(slider.value);
    walk.click();
    simulate.click();
    const deadline = Date.now() + 8000;
    while (!document.body.textContent?.includes('All 6 campaign profiles passed.') && Date.now() < deadline) await wait(100);
    return { before, after, simulatorPassed: document.body.textContent?.includes('All 6 campaign profiles passed.') ?? false };
  })()`, true) as { before: number; after: number; simulatorPassed: boolean };

  if (result.after <= result.before) throw new Error(`Auto Walk did not advance: ${JSON.stringify(result)}`);
  if (lastPreview < result.after) throw new Error(`Auto Walk UI advanced without reaching IPC: lastPreview=${lastPreview}, result=${JSON.stringify(result)}`);
  if (!result.simulatorPassed) throw new Error('Full campaign simulator button did not complete successfully.');

  console.log(`Pre-playtest Lab smoke passed: page ${result.before + 1} -> ${result.after + 1}, simulator profiles passed.`);
  window.destroy();
  app.quit();
}

const hardTimeout = setTimeout(() => {
  console.error('Pre-playtest Lab smoke exceeded 60 seconds.');
  app.exit(1);
}, 60_000);

void main().then(() => clearTimeout(hardTimeout)).catch((error) => {
  clearTimeout(hardTimeout);
  console.error(error);
  app.exit(1);
});
