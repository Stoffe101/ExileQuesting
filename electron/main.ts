import {
  app,
  BrowserWindow,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} from 'electron';
import log from 'electron-log/main';
import { promises as fs, watch as watchFileSystem, type FSWatcher } from 'node:fs';
import path from 'node:path';
import { normalizeCampaign, findProgressForZone, validateCampaign } from '../src/core/campaign';
import { parseClientLogLine } from '../src/core/log-parser';
import type {
  AppSettings,
  CampaignDataset,
  CampaignSourceStatus,
  GuidanceAnnotation,
  RawAreas,
  RawGuide,
  RuntimeState,
  ZoneEvent,
} from '../src/core/types';

const UPSTREAM_REPOSITORY = 'Lailloken/Exile-UI';
const UPSTREAM_GUIDE_PATH = 'data/english/[leveltracker] default guide.json';
const UPSTREAM_AREAS_PATH = 'data/english/[leveltracker] areas.json';
const CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const isSmokeTest = process.argv.includes('--smoke-test');

const DEFAULT_SETTINGS: AppSettings = {
  logPath: '',
  guidanceMode: 'beginner',
  leagueStart: true,
  bandit: 'none',
  showOptional: true,
  autoAdvance: true,
  autoShowOnZoneChange: true,
  overlayOpacity: 0.94,
  overlayScale: 1,
  overlayClickThrough: false,
  launchMinimized: false,
  hotkeys: {
    toggleOverlay: 'CommandOrControl+Shift+H',
    nextStep: 'Alt+Shift+Right',
    previousStep: 'Alt+Shift+Left',
  },
};

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let settings: AppSettings = structuredClone(DEFAULT_SETTINGS);
let dataset: CampaignDataset;
let sourceStatus: CampaignSourceStatus;
let progress = 0;
let currentZone = '';
let logWatcher: FSWatcher | null = null;
let logOffset = 0;
let logRemainder = '';
let logReadChain: Promise<void> = Promise.resolve();
let updateTimer: NodeJS.Timeout | null = null;

log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'info';

function userPath(name: string): string {
  return path.join(app.getPath('userData'), name);
}

function bundledCampaignPath(name: string): string {
  return app.isPackaged
    ? path.join(process.resourcesPath, 'campaign', name)
    : path.join(app.getAppPath(), 'assets', 'campaign', name);
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, 'utf8')) as T;
}

async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temporary, filePath);
}

async function loadSettings(): Promise<void> {
  try {
    const saved = await readJson<Partial<AppSettings>>(userPath('settings.json'));
    settings = {
      ...DEFAULT_SETTINGS,
      ...saved,
      hotkeys: { ...DEFAULT_SETTINGS.hotkeys, ...saved.hotkeys },
    };
  } catch {
    settings = structuredClone(DEFAULT_SETTINGS);
  }
}

async function loadProgress(): Promise<void> {
  try {
    const saved = await readJson<{ progress: number }>(userPath('progress.json'));
    progress = Number.isInteger(saved.progress) ? saved.progress : 0;
  } catch {
    progress = 0;
  }
}

async function loadAnnotations(): Promise<GuidanceAnnotation[]> {
  return readJson<GuidanceAnnotation[]>(bundledCampaignPath('annotations.json'));
}

async function createDataset(guidePath: string, areasPath: string, commit: string, fetchedAt: string): Promise<CampaignDataset> {
  const [guide, areas, annotations] = await Promise.all([
    readJson<RawGuide>(guidePath),
    readJson<RawAreas>(areasPath),
    loadAnnotations(),
  ]);
  const validation = validateCampaign(guide, areas);
  if (!validation.valid) throw new Error(`Campaign validation failed: ${validation.errors.join(' ')}`);
  return normalizeCampaign(guide, areas, annotations, {
    repository: UPSTREAM_REPOSITORY,
    commit,
    fetchedAt,
    license: 'MIT',
  });
}

async function loadCampaign(): Promise<void> {
  const manifest = await readJson<{ commit: string; fetchedAt: string }>(bundledCampaignPath('manifest.json'));
  const cachedManifestPath = userPath('campaign/current/manifest.json');
  try {
    const cached = await readJson<{ commit: string; fetchedAt: string }>(cachedManifestPath);
    dataset = await createDataset(
      userPath('campaign/current/guide.json'),
      userPath('campaign/current/areas.json'),
      cached.commit,
      cached.fetchedAt,
    );
    sourceStatus = {
      state: 'current',
      activeCommit: cached.commit,
      checkedAt: cached.fetchedAt,
      message: 'Using the latest locally verified campaign data.',
    };
  } catch (error) {
    dataset = await createDataset(
      bundledCampaignPath('guide.json'),
      bundledCampaignPath('areas.json'),
      manifest.commit,
      manifest.fetchedAt,
    );
    sourceStatus = {
      state: 'bundled',
      activeCommit: manifest.commit,
      message: 'Using the verified campaign snapshot bundled with this release.',
    };
    if (error instanceof Error && !error.message.includes('ENOENT')) log.warn('Cached campaign rejected; using bundled fallback.', error);
  }
  progress = Math.max(0, Math.min(progress, dataset.steps.length - 1));
}

function runtimeState(): RuntimeState {
  return {
    settings,
    dataset,
    sourceStatus,
    progress,
    currentZone: currentZone || undefined,
    logConnected: Boolean(settings.logPath && logWatcher),
    appVersion: app.getVersion(),
    diagnosticsPath: log.transports.file.getFile().path,
  };
}

function broadcastState(): void {
  const state = runtimeState();
  for (const window of [mainWindow, overlayWindow]) {
    if (window && !window.isDestroyed()) window.webContents.send('state:changed', state);
  }
}

async function saveSettings(): Promise<void> {
  await atomicWriteJson(userPath('settings.json'), settings);
}

async function setProgress(nextProgress: number): Promise<void> {
  progress = Math.max(0, Math.min(Math.trunc(nextProgress), dataset.steps.length - 1));
  await atomicWriteJson(userPath('progress.json'), { progress, updatedAt: new Date().toISOString() });
  broadcastState();
}

async function loadRenderer(window: BrowserWindow, mode: 'manager' | 'overlay'): Promise<void> {
  const base = process.env.VITE_DEV_SERVER_URL;
  if (base) {
    await window.loadURL(`${base}?mode=${mode}`);
    return;
  }
  await window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'), { query: { mode } });
}

function commonWebPreferences(): Electron.WebPreferences {
  return {
    preload: path.join(__dirname, 'preload.cjs'),
    contextIsolation: true,
    nodeIntegration: false,
    sandbox: true,
    devTools: !app.isPackaged,
  };
}

function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 1180,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#090b10',
    title: 'ExileQuesting',
    autoHideMenuBar: true,
    webPreferences: commonWebPreferences(),
  });
  window.once('ready-to-show', () => {
    if (!settings.launchMinimized) window.show();
  });
  window.on('close', (event) => {
    if (!(app as Electron.App & { isQuitting?: boolean }).isQuitting) {
      event.preventDefault();
      window.hide();
    }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  void loadRenderer(window, 'manager').catch((error) => log.error('Failed to load manager UI.', error));
  return window;
}

function createOverlayWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: 440,
    height: 520,
    minWidth: 340,
    minHeight: 240,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: true,
    hasShadow: true,
    webPreferences: commonWebPreferences(),
  });
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setOpacity(settings.overlayOpacity);
  window.setIgnoreMouseEvents(settings.overlayClickThrough, { forward: true });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  void loadRenderer(window, 'overlay').catch((error) => log.error('Failed to load overlay UI.', error));
  return window;
}

function toggleOverlay(): void {
  if (!overlayWindow) return;
  if (overlayWindow.isVisible()) overlayWindow.hide();
  else overlayWindow.showInactive();
}

function registerHotkeys(): void {
  globalShortcut.unregisterAll();
  const bindings: Array<[string, () => void]> = [
    [settings.hotkeys.toggleOverlay, toggleOverlay],
    [settings.hotkeys.nextStep, () => void setProgress(progress + 1)],
    [settings.hotkeys.previousStep, () => void setProgress(progress - 1)],
  ];
  for (const [accelerator, handler] of bindings) {
    try {
      if (!globalShortcut.register(accelerator, handler)) log.warn(`Hotkey is unavailable: ${accelerator}`);
    } catch (error) {
      log.warn(`Invalid hotkey ignored: ${accelerator}`, error);
    }
  }
}

function createTray(): void {
  const iconPath = app.isPackaged
    ? path.join(process.resourcesPath, 'campaign', 'tray.png')
    : bundledCampaignPath('tray.png');
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('ExileQuesting');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open ExileQuesting', click: () => mainWindow?.show() },
    { label: 'Toggle campaign overlay', click: toggleOverlay },
    { type: 'separator' },
    { label: 'Quit', click: () => { (app as Electron.App & { isQuitting?: boolean }).isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => mainWindow?.show());
}

async function detectLogPath(): Promise<string> {
  const fileNames = ['LatestClient.txt', 'Client.txt'];
  const roots = [
    process.env['ProgramFiles(x86)'],
    process.env.ProgramFiles,
    'C:\\', 'D:\\', 'E:\\', 'F:\\',
  ].filter((value): value is string => Boolean(value));
  const relativeRoots = [
    path.join('Steam', 'steamapps', 'common', 'Path of Exile', 'logs'),
    path.join('SteamLibrary', 'steamapps', 'common', 'Path of Exile', 'logs'),
    path.join('Grinding Gear Games', 'Path of Exile', 'logs'),
    path.join('Path of Exile', 'logs'),
  ];
  for (const root of roots) {
    for (const relative of relativeRoots) {
      for (const fileName of fileNames) {
        const candidate = path.join(root, relative, fileName);
        try {
          await fs.access(candidate);
          return candidate;
        } catch { /* continue */ }
      }
    }
  }
  return '';
}

async function handleZoneEvent(event: ZoneEvent): Promise<void> {
  if (event.areaName) currentZone = event.areaName;
  const next = settings.autoAdvance ? findProgressForZone(dataset.steps, progress, event) : null;
  if (next !== null && next !== progress) await setProgress(next);
  else broadcastState();
  if (settings.autoShowOnZoneChange && overlayWindow && !overlayWindow.isVisible()) overlayWindow.showInactive();
}

async function consumeLogGrowth(filePath: string): Promise<void> {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size < logOffset) {
      logOffset = 0;
      logRemainder = '';
    }
    if (stat.size === logOffset) return;
    const handle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(Math.min(stat.size - logOffset, 1024 * 1024));
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, logOffset);
    await handle.close();
    logOffset += bytesRead;
    const content = logRemainder + buffer.subarray(0, bytesRead).toString('utf8');
    const lines = content.split(/\r?\n/);
    logRemainder = lines.pop() ?? '';
    for (const line of lines) {
      const event = parseClientLogLine(line);
      if (event && (event.areaName || event.areaId)) await handleZoneEvent(event);
    }
  } catch (error) {
    log.warn('Failed to read Client.txt growth.', error);
  }
}

async function startLogWatcher(): Promise<void> {
  logWatcher?.close();
  logWatcher = null;
  await logReadChain;
  if (!settings.logPath) settings.logPath = await detectLogPath();
  if (!settings.logPath) {
    broadcastState();
    return;
  }
  try {
    const stat = await fs.stat(settings.logPath);
    logOffset = stat.size;
    logRemainder = '';
    const watchedPath = settings.logPath;
    logWatcher = watchFileSystem(watchedPath, { persistent: false }, () => {
      logReadChain = logReadChain.then(() => consumeLogGrowth(watchedPath));
    });
    logWatcher.on('error', (error) => log.warn('Client.txt watcher error.', error));
    await saveSettings();
    log.info(`Watching Path of Exile log: ${settings.logPath}`);
  } catch (error) {
    log.warn(`Configured log is unavailable: ${settings.logPath}`, error);
  }
  broadcastState();
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'User-Agent': `ExileQuesting/${app.getVersion()} (github.com/Stoffe101/ExileQuesting)` },
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return await response.json() as T;
}

async function checkCampaignUpdates(): Promise<void> {
  if (sourceStatus.state === 'checking') return;
  sourceStatus = { ...sourceStatus, state: 'checking', message: 'Checking Exile-UI for campaign changes…' };
  broadcastState();
  const checkedAt = new Date().toISOString();
  try {
    const commitInfo = await fetchJson<{ sha: string }>(`https://api.github.com/repos/${UPSTREAM_REPOSITORY}/commits/main`);
    if (commitInfo.sha === dataset.source.commit) {
      sourceStatus = {
        state: 'current', activeCommit: dataset.source.commit, latestCommit: commitInfo.sha, checkedAt,
        message: 'Campaign data is current and verified.',
      };
      broadcastState();
      return;
    }
    sourceStatus = {
      ...sourceStatus, state: 'update-available', latestCommit: commitInfo.sha, checkedAt,
      message: 'New upstream data found. Downloading it to a staging area for validation…',
    };
    broadcastState();
    const encodedGuide = UPSTREAM_GUIDE_PATH.split('/').map(encodeURIComponent).join('/');
    const encodedAreas = UPSTREAM_AREAS_PATH.split('/').map(encodeURIComponent).join('/');
    const [guide, areas] = await Promise.all([
      fetchJson<RawGuide>(`https://raw.githubusercontent.com/${UPSTREAM_REPOSITORY}/${commitInfo.sha}/${encodedGuide}`),
      fetchJson<RawAreas>(`https://raw.githubusercontent.com/${UPSTREAM_REPOSITORY}/${commitInfo.sha}/${encodedAreas}`),
    ]);
    const validation = validateCampaign(guide, areas);
    if (!validation.valid) {
      sourceStatus = {
        state: 'fallback', activeCommit: dataset.source.commit, latestCommit: commitInfo.sha, checkedAt,
        message: 'The new upstream format failed validation. The last known-good campaign remains active.', validation,
      };
      log.error('Rejected upstream campaign update.', validation);
      broadcastState();
      return;
    }
    const current = userPath('campaign/current');
    await Promise.all([
      atomicWriteJson(path.join(current, 'guide.json'), guide),
      atomicWriteJson(path.join(current, 'areas.json'), areas),
      atomicWriteJson(path.join(current, 'manifest.json'), { commit: commitInfo.sha, fetchedAt: checkedAt, validation }),
    ]);
    dataset = normalizeCampaign(guide, areas, await loadAnnotations(), {
      repository: UPSTREAM_REPOSITORY, commit: commitInfo.sha, fetchedAt: checkedAt, license: 'MIT',
    });
    sourceStatus = {
      state: 'current', activeCommit: commitInfo.sha, latestCommit: commitInfo.sha, checkedAt,
      message: 'The new Exile-UI campaign data passed validation and is now active.', validation,
    };
  } catch (error) {
    sourceStatus = {
      state: 'error', activeCommit: dataset.source.commit, checkedAt,
      message: `Update check failed. The verified local campaign remains active. ${error instanceof Error ? error.message : ''}`.trim(),
    };
    log.warn('Campaign update check failed.', error);
  }
  broadcastState();
}

function registerIpc(): void {
  ipcMain.handle('app:bootstrap', () => runtimeState());
  ipcMain.handle('settings:update', async (_event, patch: Partial<AppSettings>) => {
    settings = {
      ...settings,
      ...patch,
      hotkeys: patch.hotkeys ? { ...settings.hotkeys, ...patch.hotkeys } : settings.hotkeys,
      overlayOpacity: Math.max(0.35, Math.min(Number(patch.overlayOpacity ?? settings.overlayOpacity), 1)),
      overlayScale: Math.max(0.75, Math.min(Number(patch.overlayScale ?? settings.overlayScale), 1.5)),
    };
    await saveSettings();
    overlayWindow?.setOpacity(settings.overlayOpacity);
    overlayWindow?.setIgnoreMouseEvents(settings.overlayClickThrough, { forward: true });
    registerHotkeys();
    if (patch.logPath !== undefined) await startLogWatcher();
    broadcastState();
    return runtimeState();
  });
  ipcMain.handle('log:select', async () => {
    const options: Electron.OpenDialogOptions = {
      title: 'Select Path of Exile Client.txt or LatestClient.txt',
      properties: ['openFile'],
      filters: [{ name: 'Path of Exile log', extensions: ['txt'] }],
    };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);
    if (!result.canceled && result.filePaths[0]) {
      settings.logPath = result.filePaths[0];
      await saveSettings();
      await startLogWatcher();
    }
    return runtimeState();
  });
  ipcMain.handle('progress:set', async (_event, next: number) => { await setProgress(next); return runtimeState(); });
  ipcMain.handle('overlay:show', () => overlayWindow?.showInactive());
  ipcMain.handle('overlay:hide', () => overlayWindow?.hide());
  ipcMain.handle('overlay:toggle', toggleOverlay);
  ipcMain.handle('campaign:check', async () => { await checkCampaignUpdates(); return runtimeState(); });
  ipcMain.handle('diagnostics:open', async () => { await shell.showItemInFolder(log.transports.file.getFile().path); });
}

process.on('uncaughtException', (error) => log.error('Uncaught exception', error));
process.on('unhandledRejection', (error) => log.error('Unhandled rejection', error));

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });
  app.whenReady().then(async () => {
    await Promise.all([loadSettings(), loadProgress()]);
    await loadCampaign();
    if (isSmokeTest) {
      log.info(`Packaged startup smoke test passed with ${dataset.steps.length} campaign steps.`);
      app.exit(0);
      return;
    }
    registerIpc();
    mainWindow = createMainWindow();
    overlayWindow = createOverlayWindow();
    createTray();
    registerHotkeys();
    await startLogWatcher();
    updateTimer = setInterval(() => void checkCampaignUpdates(), CHECK_INTERVAL_MS);
    setTimeout(() => void checkCampaignUpdates(), 4_000);
  }).catch((error) => {
    log.error('Fatal startup failure.', error);
    if (isSmokeTest) {
      app.exit(1);
      return;
    }
    void dialog.showErrorBox('ExileQuesting could not start', `The application hit a startup error. A diagnostic log was written to:\n${log.transports.file.getFile().path}\n\n${error instanceof Error ? error.message : String(error)}`);
    app.quit();
  });
}

app.on('activate', () => mainWindow?.show());
app.on('before-quit', () => {
  (app as Electron.App & { isQuitting?: boolean }).isQuitting = true;
  if (updateTimer) clearInterval(updateTimer);
  logWatcher?.close();
  globalShortcut.unregisterAll();
});
