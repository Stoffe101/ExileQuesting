import { app, BrowserWindow, ipcMain } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { AppSettings, RuntimeState } from '../src/core/types';
import type { PassiveTreeHudState } from '../src/core/passive-tree-hud-state';

const outputArg = process.argv.slice(1).reverse().find((arg) => /(^|[\\/])artifacts[\\/]/i.test(arg));
const output = path.resolve(outputArg || 'artifacts/passive-tree-hud');

const settings: AppSettings = {
  logPath: '', guidanceMode: 'beginner', leagueStart: true, bandit: 'none', showOptional: true,
  autoAdvance: true, autoShowOnZoneChange: true, overlayOpacity: 0.94, overlayScale: 1,
  overlayClickThrough: false, overlayMode: 'focus',
  overlayTypography: { preset: 'default', objective: 21, actions: 15, guidance: 13, labels: 10, status: 10, density: 'comfortable' },
  overlayPosition: { preset: 'top-right', locked: false, snapToEdges: true },
  overlayAutoCollapse: true, overlayAutoCollapseSeconds: 5,
  passiveTreeHudEnabled: true, passiveTreeHudPathPreview: true,
  reducedMotion: true, reducedTransparency: false, onboardingComplete: true, launchMinimized: false,
  autoCheckAppUpdates: false, autoDownloadAppUpdates: false, autoStartRunTimer: true, showRunTimerInOverlay: true,
  hotkeys: {
    toggleOverlay: 'CommandOrControl+Shift+H', nextStep: 'Alt+Shift+Right', previousStep: 'Alt+Shift+Left',
    toggleInteraction: 'CommandOrControl+Shift+I', cycleOverlayMode: 'CommandOrControl+Shift+M',
  },
};

function baseState(passiveTreeHud: PassiveTreeHudState): RuntimeState {
  return {
    settings,
    dataset: {
      schemaVersion: 2,
      source: { repository: 'Stoffe101/ExileQuesting', commit: 'visual-fixture', fetchedAt: '2026-09-02T00:00:00.000Z', license: 'MIT' },
      steps: [{ id: 'fixture', act: 1, indexInAct: 0, title: 'Visual fixture', lines: [], rawLines: [], tags: [], actions: [] }],
      acts: [{ act: 1, firstStep: 0, stepCount: 1 }],
      areas: [],
    },
    sourceStatus: { state: 'bundled', activeCommit: 'visual-fixture', message: 'Visual fixture.' },
    progress: 0,
    xpGuidance: { pace: 'unknown', message: 'Visual fixture.' },
    rewardProgress: { passive: { completed: 0, knownTotal: 0 }, trials: { completed: 0, knownTotal: 0 } },
    rewardAudit: {
      passive: { confirmed: 0, routePassed: 0, knownTotal: 0 },
      trials: { confirmed: 0, routePassed: 0, knownTotal: 0 },
      items: [], needsFinalPassivesAudit: false,
    },
    progressHistory: [], startupReconciliation: { state: 'none' }, logConnected: false,
    logDiagnostics: { path: '', fileExists: false, watcherActive: false, pollingActive: false }, detectionTrace: [],
    runStats: { session: { state: 'idle', pausedMs: 0, townTimeMs: 0, splits: [] }, elapsedMs: 0 },
    appUpdate: { status: 'disabled', currentVersion: '0.2.0', message: 'Visual fixture.' },
    recovery: { previousSessionUnclean: false, acknowledged: true },
    lootFilter: { status: 'unconfigured', needsReload: false, message: 'Visual fixture.' },
    passiveTreeHud,
    appVersion: '0.2.0', diagnosticsPath: 'visual-fixture.log',
  };
}

function exactHud(width: number, height: number, operation: 'allocate' | 'refund'): PassiveTreeHudState {
  const x = Math.round(width * 0.61);
  const y = Math.round(height * 0.57);
  return {
    status: 'locked', enabled: true, visible: true, mode: 'exact', sourceLabel: 'Maxroll leveling',
    className: operation === 'refund' ? 'Witch' : 'Ranger', classStartNodeId: operation === 'refund' ? 54447 : 50459,
    treeScope: 'base', message: 'Target Lock fixture aligned.', confidence: 0.94, inliers: 24, rms: 1.4, displayId: 1,
    displayBounds: { x: 0, y: 0, width, height }, captureSize: { width: 960, height: Math.round(960 * height / width) },
    target: {
      nodeId: operation === 'refund' ? 33122 : 59791,
      name: operation === 'refund' ? 'Elemental Overload' : 'Precise Technique',
      kind: 'keystone', x, y, markerRadius: 28, operation, index: operation === 'refund' ? 41 : 19, total: 93,
      checkpoint: operation === 'refund' ? 6 : 3, offscreen: false,
    },
    path: [],
    lastLockedAt: '2026-09-03T00:00:00.000Z',
  };
}

function ascendancyExactHud(width: number, height: number, operation: 'allocate' | 'refund'): PassiveTreeHudState {
  const x = Math.round(width * 0.56);
  const y = Math.round(height * 0.52);
  const refund = operation === 'refund';
  return {
    status: 'locked', enabled: true, visible: true, mode: 'exact', sourceLabel: 'Maxroll leveling',
    className: refund ? 'Witch' : 'Ranger', classStartNodeId: refund ? 54447 : 50459,
    treeScope: 'ascendancy', ascendancyName: refund ? 'Occultist' : 'Deadeye',
    message: 'Ascendancy Target Lock fixture aligned.', confidence: 0.96, inliers: 21, rms: 1.2, displayId: 1,
    displayBounds: { x: 0, y: 0, width, height }, captureSize: { width: 960, height: Math.round(960 * height / width) },
    target: {
      nodeId: refund ? 33740 : 45635,
      name: refund ? 'Profane Bloom' : 'Gathering Winds',
      kind: 'ascendancy', x, y, markerRadius: 28, operation, index: refund ? 45 : 27, total: 93,
      checkpoint: refund ? 7 : 4, offscreen: false,
    },
    path: [],
    lastLockedAt: '2026-09-03T00:00:00.000Z',
  };
}

function offscreenHud(width: number, height: number, ascendancy = false): PassiveTreeHudState {
  return {
    status: 'locked', enabled: true, visible: true, mode: 'exact', sourceLabel: 'Maxroll leveling',
    className: ascendancy ? 'Duelist' : 'Shadow', classStartNodeId: 44683,
    treeScope: ascendancy ? 'ascendancy' : 'base', ...(ascendancy ? { ascendancyName: 'Slayer' } : {}),
    message: 'Target is outside the visible passive-tree viewport.', confidence: 0.93, inliers: 19, rms: 1.6, displayId: 1,
    displayBounds: { x: 0, y: 0, width, height }, captureSize: { width: 960, height: Math.round(960 * height / width) },
    target: {
      nodeId: ascendancy ? 3184 : 22222, name: ascendancy ? 'Headsman' : 'Ghost Dance', kind: ascendancy ? 'ascendancy' : 'keystone',
      x: width + 420, y: height * 0.35, markerRadius: 28, operation: 'allocate', index: ascendancy ? 62 : 56, total: 90, checkpoint: 8, offscreen: true,
      arrowX: width - 92, arrowY: Math.round(height * 0.35), arrowAngle: 0,
    },
    path: [],
    lastLockedAt: '2026-09-03T00:00:00.000Z',
  };
}

async function waitFor(window: BrowserWindow, expression: string, label: string): Promise<void> {
  const deadline = Date.now() + 12_000;
  while (Date.now() < deadline) {
    if (await window.webContents.executeJavaScript(`Boolean(${expression})`)) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

async function main(): Promise<void> {
  await app.whenReady();
  await fs.mkdir(output, { recursive: true });
  let active = baseState(exactHud(1920, 1080, 'allocate'));
  ipcMain.handle('app:bootstrap', () => active);

  const window = new BrowserWindow({
    show: false, width: 1920, height: 1080, frame: false, transparent: true, backgroundColor: '#00000000',
    webPreferences: { preload: path.resolve('dist-electron/preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, offscreen: true },
  });
  await window.loadFile(path.resolve('dist/index.html'), { query: { mode: 'passive-tree-hud' } });
  await waitFor(window, `document.querySelector('.passive-tree-hud-root')`, 'Passive Target Lock renderer');

  const viewports = [
    { width: 1920, height: 1080, label: '1920x1080' },
    { width: 2560, height: 1440, label: '2560x1440' },
    { width: 3440, height: 1440, label: '3440x1440' },
    { width: 3840, height: 2160, label: '3840x2160' },
  ];
  const cases = [
    { name: 'exact', make: (w: number, h: number) => exactHud(w, h, 'allocate'), selector: '.passive-target:not(.operation-refund)' },
    { name: 'refund', make: (w: number, h: number) => exactHud(w, h, 'refund'), selector: '.passive-target.operation-refund' },
    { name: 'offscreen', make: (w: number, h: number) => offscreenHud(w, h, false), selector: '.passive-edge-target' },
    { name: 'ascendancy-exact', make: (w: number, h: number) => ascendancyExactHud(w, h, 'allocate'), selector: '.passive-target:not(.operation-refund)' },
    { name: 'ascendancy-refund', make: (w: number, h: number) => ascendancyExactHud(w, h, 'refund'), selector: '.passive-target.operation-refund' },
    { name: 'ascendancy-offscreen', make: (w: number, h: number) => offscreenHud(w, h, true), selector: '.passive-edge-target' },
  ];
  const captures: Array<Record<string, unknown>> = [];

  for (const viewport of viewports) {
    window.setContentSize(viewport.width, viewport.height);
    await new Promise((resolve) => setTimeout(resolve, 80));
    for (const fixture of cases) {
      active = baseState(fixture.make(viewport.width, viewport.height));
      window.webContents.send('state:changed', active);
      await waitFor(window, `document.querySelector(${JSON.stringify(fixture.selector)})`, `${fixture.name} fixture`);
      await window.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))`);
      window.webContents.invalidate();
      await new Promise((resolve) => setTimeout(resolve, 180));
      const warmFrame = await window.webContents.capturePage();
      if (warmFrame.isEmpty()) throw new Error(`${fixture.name} ${viewport.label}: warmup screenshot was empty.`);
      await window.webContents.executeJavaScript(`new Promise((resolve) => requestAnimationFrame(resolve))`);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const metrics = await window.webContents.executeJavaScript(`(() => {
        const root = document.querySelector('.passive-tree-hud-root');
        if (!root) throw new Error('Passive Target Lock root is missing.');
        return {
          width: document.documentElement.clientWidth,
          height: document.documentElement.clientHeight,
          scrollWidth: document.documentElement.scrollWidth,
          scrollHeight: document.documentElement.scrollHeight,
          devicePixelRatio: window.devicePixelRatio,
          targetCount: document.querySelectorAll('.passive-target').length,
          ringCount: document.querySelectorAll('.passive-target-ring').length,
          tickCount: document.querySelectorAll('.passive-reticle-tick').length,
          coreCount: document.querySelectorAll('.passive-target-core').length,
          edgeCount: document.querySelectorAll('.passive-edge-target').length,
          text: root.textContent || '',
        };
      })()`);
      if (metrics.scrollWidth > metrics.width + 2 || metrics.scrollHeight > metrics.height + 2) {
        throw new Error(`${fixture.name} ${viewport.label}: Target Lock overflow ${metrics.scrollWidth}x${metrics.scrollHeight} > ${metrics.width}x${metrics.height}.`);
      }
      if (fixture.name === 'exact' && (!metrics.text.includes('TAKE THIS NODE') || !metrics.text.includes('Precise Technique') || !metrics.text.includes('NODE 59791'))) {
        throw new Error('Exact target label is incomplete.');
      }
      if (fixture.name === 'refund' && (!metrics.text.includes('REFUND THIS NODE') || !metrics.text.includes('NODE 33122') || metrics.targetCount !== 1)) {
        throw new Error('Refund target presentation is incomplete.');
      }
      if ((fixture.name === 'exact' || fixture.name === 'refund' || fixture.name === 'ascendancy-exact' || fixture.name === 'ascendancy-refund')
        && (metrics.targetCount !== 1 || metrics.ringCount !== 1 || metrics.tickCount !== 4 || metrics.coreCount !== 1 || metrics.edgeCount !== 0)) {
        throw new Error(`${fixture.name}: exact-node reticle anatomy is incomplete.`);
      }
      if (fixture.name === 'offscreen' && (metrics.edgeCount !== 1 || metrics.targetCount !== 0 || !metrics.text.includes('Ghost Dance') || !metrics.text.includes('Node 22222'))) {
        throw new Error('Offscreen guidance fixture is incomplete.');
      }
      if (fixture.name === 'ascendancy-exact' && (!metrics.text.includes('Deadeye Ascendancy') || !metrics.text.includes('Gathering Winds') || !metrics.text.includes('TAKE THIS NODE'))) {
        throw new Error('Ascendancy exact target presentation is incomplete.');
      }
      if (fixture.name === 'ascendancy-refund' && (!metrics.text.includes('Occultist Ascendancy') || !metrics.text.includes('Profane Bloom') || !metrics.text.includes('REFUND THIS NODE'))) {
        throw new Error('Ascendancy refund presentation is incomplete.');
      }
      if (fixture.name === 'ascendancy-offscreen' && (metrics.edgeCount !== 1 || metrics.targetCount !== 0 || !metrics.text.includes('Headsman') || !metrics.text.includes('Node 3184'))) {
        throw new Error('Ascendancy offscreen presentation is incomplete.');
      }
      const png = (await window.webContents.capturePage()).toPNG();
      if (png.length < 1000) throw new Error(`${fixture.name} ${viewport.label}: screenshot was unexpectedly small (${png.length} bytes).`);
      const filename = `${fixture.name}-${viewport.label}.png`;
      await fs.writeFile(path.join(output, filename), png);
      captures.push({ fixture: fixture.name, viewport: viewport.label, bytes: png.length, ...metrics });
    }
  }

  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), captures }, null, 2), 'utf8');
  window.destroy();
  ipcMain.removeHandler('app:bootstrap');
  app.quit();
}

void main().catch((error) => { console.error(error); app.exit(1); });
