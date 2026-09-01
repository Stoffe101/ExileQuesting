import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  shell,
  Tray,
} from 'electron';
import log from 'electron-log/main';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { normalizeCampaign, isStepEnabled, validateCampaign } from '../src/core/campaign';
import { validateCompatibilityManifest } from '../src/core/compatibility';
import { validateLayoutHints } from '../src/core/layouts';
import { deterministicChunks, replayClientLogChunks, type LogReplayReport } from '../src/core/log-replay';
import { normalizeSettingsDocument } from '../src/core/persistence';
import { appendHistory, decideProgression, makeHistoryEntry, reconcileStartup } from '../src/core/progression';
import { buildRewardAudit, rewardProgressFor } from '../src/core/rewards';
import {
  appendRunHistory,
  emptyRunSession,
  finishRun,
  pauseRun,
  recordActTransition,
  recordRunArea,
  resetRun,
  runStatsFor,
  startRun,
} from '../src/core/run';
import { isAllowedDataUrl, isAllowedExternalUrl, MAX_REMOTE_JSON_BYTES, readBoundedResponseText } from '../src/core/security';
import { calculateXpGuidance } from '../src/core/xp';
import type {
  AppSettings,
  AppUpdateState,
  CampaignCompatibilityManifest,
  CampaignDataset,
  CampaignSourceStatus,
  DetectionTraceEntry,
  GuidanceAnnotation,
  LayoutHint,
  LogDiagnostics,
  OverlayMode,
  ProgressHistoryEntry,
  RawAreas,
  RawGuide,
  RecoveryState,
  RunHistoryEntry,
  RunSession,
  RuntimeState,
  StartupReconciliation,
  ZoneEvent,
} from '../src/core/types';
import { AppUpdater } from './services/app-updater';
import { detectLogPath, PoELogWatcher } from './services/log-watcher';
import { applyOverlayPosition, resizeOverlayToContent, snapCustomPosition, widthForMode } from './services/overlay-window';
import { SessionGuard } from './services/session-guard';
import { StateStore } from './services/state-store';
import { createPreplaytestLab } from './services/preplaytest-lab';

const DEFAULT_UPSTREAM_REPOSITORY = 'Lailloken/Exile-UI';
const DEFAULT_GUIDE_PATH = 'data/english/[leveltracker] default guide.json';
const DEFAULT_AREAS_PATH = 'data/english/[leveltracker] areas.json';
const REMOTE_COMPATIBILITY_URL = 'https://raw.githubusercontent.com/Stoffe101/ExileQuesting/main/assets/campaign/compatibility.json';
const APP_RELEASE_REPOSITORY = 'Stoffe101/ExileQuesting';
const CAMPAIGN_CHECK_INTERVAL_MS = 12 * 60 * 60 * 1000;
const APP_UPDATE_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const MAX_REPLAY_BYTES = 64 * 1024 * 1024;
const isSmokeTest = process.argv.includes('--smoke-test');
const visualSmokeArgument = process.argv.find((argument) => argument.startsWith('--visual-smoke='));

const DEFAULT_SETTINGS: AppSettings = {
  logPath: '', guidanceMode: 'beginner', leagueStart: true, bandit: 'none', showOptional: true, autoAdvance: true, autoShowOnZoneChange: true,
  overlayOpacity: 0.94, overlayScale: 1, overlayClickThrough: false, overlayMode: 'focus',
  overlayTypography: { preset: 'default', objective: 21, actions: 15, guidance: 13, labels: 10, status: 10, density: 'comfortable' },
  overlayPosition: { preset: 'top-right', locked: false, snapToEdges: true },
  overlayAutoCollapse: true, overlayAutoCollapseSeconds: 5, reducedMotion: false, reducedTransparency: false,
  onboardingComplete: false, launchMinimized: false, autoCheckAppUpdates: true, autoDownloadAppUpdates: false,
  autoStartRunTimer: true, showRunTimerInOverlay: true,
  hotkeys: {
    toggleOverlay: 'CommandOrControl+Shift+H', nextStep: 'Alt+Shift+Right', previousStep: 'Alt+Shift+Left',
    toggleInteraction: 'CommandOrControl+Shift+I', cycleOverlayMode: 'CommandOrControl+Shift+M',
  },
};

type OverlayDemoConfig = { progress: number; mode: OverlayMode; characterLevel?: number; areaLevel?: number };
type ReplayUiResult = Pick<LogReplayReport, 'chunks' | 'lines' | 'parsedEvents' | 'finalProgress' | 'errors'> & {
  sourcePath: string;
  decisions: LogReplayReport['decisions'];
};

let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let labWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let store: StateStore;
let settings: AppSettings = structuredClone(DEFAULT_SETTINGS);
let dataset: CampaignDataset;
let sourceStatus: CampaignSourceStatus;
let compatibility: CampaignCompatibilityManifest;
let progress = 0;
let progressHistory: ProgressHistoryEntry[] = [];
let currentZone = '';
let currentAreaId = '';
let currentAreaLevel: number | undefined;
let characterLevel: number | undefined;
let startupReconciliation: StartupReconciliation = { state: 'none' };
let logDiagnostics: LogDiagnostics = { path: '', fileExists: false, watcherActive: false, pollingActive: false };
let logWatcher: PoELogWatcher | null = null;
let campaignUpdateTimer: NodeJS.Timeout | null = null;
let appUpdateTimer: NodeJS.Timeout | null = null;
let interactionOverride = false;
let ignoreOverlayMovedUntil = 0;
let detectionTrace: DetectionTraceEntry[] = [];
let runSession: RunSession = emptyRunSession();
let runHistory: RunHistoryEntry[] = [];
let confirmedRewardStepIds = new Set<string>();
let recovery: RecoveryState = { previousSessionUnclean: false, acknowledged: true };
let sessionGuard: SessionGuard | null = null;
let appUpdater: AppUpdater | null = null;
let overlayDemo: OverlayDemoConfig | null = null;
let lastReplay: ReplayUiResult | null = null;
let appUpdate: AppUpdateState = {
  status: app.isPackaged ? 'idle' : 'disabled', currentVersion: app.getVersion(),
  message: app.isPackaged ? 'Update check has not run yet.' : 'Application updates are disabled in development builds.',
};

log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'info';

function userPath(name: string): string { return store.path(name); }
function bundledCampaignPath(name: string): string {
  return app.isPackaged ? path.join(process.resourcesPath, 'campaign', name) : path.join(app.getAppPath(), 'assets', 'campaign', name);
}
async function readJson<T>(filePath: string): Promise<T> { return JSON.parse(await fs.readFile(filePath, 'utf8')) as T; }
async function atomicWriteJson(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temporary, filePath);
}

async function loadPersistentState(): Promise<void> {
  settings = await store.loadSettings(DEFAULT_SETTINGS);
  const savedProgress = await store.loadProgress();
  progress = savedProgress.progress;
  progressHistory = savedProgress.history;
  const run = await store.loadRun();
  runSession = run.session;
  runHistory = run.history;
}
async function saveSettings(): Promise<void> { await store.write('settings.json', settings); }
async function saveProgress(): Promise<void> { await store.write('progress.json', { progress, history: progressHistory, updatedAt: new Date().toISOString() }); }
async function saveRunState(): Promise<void> { await store.write('run.json', { session: runSession, history: runHistory, updatedAt: new Date().toISOString() }); }
async function saveRewardConfirmations(): Promise<void> { await store.write('reward-audit.json', { confirmedStepIds: [...confirmedRewardStepIds], updatedAt: new Date().toISOString() }); }

async function loadAnnotations(): Promise<GuidanceAnnotation[]> { return readJson<GuidanceAnnotation[]>(bundledCampaignPath('annotations.json')); }
async function loadLayoutHints(): Promise<LayoutHint[]> {
  try { return validateLayoutHints(await readJson<unknown>(bundledCampaignPath('layouts.json'))); }
  catch { return []; }
}
function fallbackCompatibility(): CampaignCompatibilityManifest {
  return { schemaVersion: 1, upstream: { repository: DEFAULT_UPSTREAM_REPOSITORY, guidePath: DEFAULT_GUIDE_PATH, areasPath: DEFAULT_AREAS_PATH }, adapterVersion: 2, campaignSchemaVersion: 2, updatedAt: new Date(0).toISOString() };
}
async function loadLocalCompatibility(): Promise<CampaignCompatibilityManifest> {
  try { compatibility = validateCompatibilityManifest(await readJson<unknown>(bundledCampaignPath('compatibility.json'))) ?? fallbackCompatibility(); }
  catch { compatibility = fallbackCompatibility(); }
  return compatibility;
}
async function fetchText(url: string, maxBytes = MAX_REMOTE_JSON_BYTES, timeoutMs = 15_000): Promise<string> {
  if (!isAllowedDataUrl(url)) throw new Error(`Blocked non-allowlisted data URL: ${url}`);
  const response = await fetch(url, { headers: { 'User-Agent': `ExileQuesting/${app.getVersion()} (github.com/Stoffe101/ExileQuesting)` }, signal: AbortSignal.timeout(timeoutMs) });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return readBoundedResponseText(response, maxBytes);
}
async function fetchJson<T>(url: string, maxBytes = MAX_REMOTE_JSON_BYTES): Promise<T> { return JSON.parse(await fetchText(url, maxBytes)) as T; }
async function refreshRemoteCompatibility(): Promise<CampaignCompatibilityManifest> {
  try {
    const remote = validateCompatibilityManifest(JSON.parse(await fetchText(REMOTE_COMPATIBILITY_URL, 256 * 1024, 7_000)) as unknown);
    if (remote && remote.adapterVersion <= 2 && remote.campaignSchemaVersion <= 2) compatibility = remote;
  } catch (error) { log.info('Remote compatibility manifest unavailable; keeping verified local definition.', error); }
  return compatibility;
}
async function createDataset(guidePath: string, areasPath: string, commit: string, fetchedAt: string): Promise<CampaignDataset> {
  const [guide, areas, annotations, layouts] = await Promise.all([readJson<RawGuide>(guidePath), readJson<RawAreas>(areasPath), loadAnnotations(), loadLayoutHints()]);
  const validation = validateCampaign(guide, areas);
  if (!validation.valid) throw new Error(`Campaign validation failed: ${validation.errors.join(' ')}`);
  return normalizeCampaign(guide, areas, annotations, { repository: compatibility.upstream.repository, commit, fetchedAt, license: 'MIT' }, layouts);
}
async function loadCampaign(): Promise<void> {
  const manifest = await readJson<{ commit: string; fetchedAt: string }>(bundledCampaignPath('manifest.json'));
  try {
    const cached = await readJson<{ commit: string; fetchedAt: string }>(userPath('campaign/current/manifest.json'));
    dataset = await createDataset(userPath('campaign/current/guide.json'), userPath('campaign/current/areas.json'), cached.commit, cached.fetchedAt);
    sourceStatus = { state: 'current', activeCommit: cached.commit, checkedAt: cached.fetchedAt, message: 'Using the latest locally verified campaign data.' };
  } catch (error) {
    dataset = await createDataset(bundledCampaignPath('guide.json'), bundledCampaignPath('areas.json'), manifest.commit, manifest.fetchedAt);
    sourceStatus = { state: 'bundled', activeCommit: manifest.commit, message: 'Using the verified campaign snapshot bundled with this release.' };
    if (error instanceof Error && !error.message.includes('ENOENT')) log.warn('Cached campaign rejected; using bundled fallback.', error);
  }
  progress = Math.max(0, Math.min(progress, dataset.steps.length - 1));
  const knownRewardIds = new Set(dataset.steps.filter((step) => step.permanentReward).map((step) => step.id));
  confirmedRewardStepIds = await store.loadRewards(knownRewardIds);
}

function enabled(step: CampaignDataset['steps'][number]): boolean { return isStepEnabled(step, settings); }
function xpGuidance(level = characterLevel, area = currentAreaLevel) { return calculateXpGuidance(level, area); }
function runtimeState(): RuntimeState {
  return {
    settings, dataset, sourceStatus, progress, currentZone: currentZone || undefined, currentAreaId: currentAreaId || undefined, currentAreaLevel, characterLevel,
    xpGuidance: xpGuidance(), rewardProgress: rewardProgressFor(dataset, progress), rewardAudit: buildRewardAudit(dataset, progress, confirmedRewardStepIds),
    progressHistory, startupReconciliation, logConnected: Boolean(settings.logPath && logDiagnostics.fileExists && (logDiagnostics.watcherActive || logDiagnostics.pollingActive)),
    logDiagnostics, detectionTrace, runStats: runStatsFor(runSession, runHistory), appUpdate, recovery, appVersion: app.getVersion(), diagnosticsPath: log.transports.file.getFile().path,
  };
}
function overlayState(real = runtimeState()): RuntimeState {
  if (!overlayDemo) return real;
  const demoProgress = Math.max(0, Math.min(Math.trunc(overlayDemo.progress), dataset.steps.length - 1));
  const step = dataset.steps[demoProgress];
  const areaLevel = overlayDemo.areaLevel ?? step.areaLevel;
  const level = overlayDemo.characterLevel ?? Math.max(1, (areaLevel ?? 1) - 2);
  return {
    ...real,
    settings: { ...real.settings, overlayMode: overlayDemo.mode, showRunTimerInOverlay: false },
    progress: demoProgress,
    currentZone: step.targetArea ?? 'Overlay demo',
    currentAreaId: step.targetAreaId,
    currentAreaLevel: areaLevel,
    characterLevel: level,
    xpGuidance: xpGuidance(level, areaLevel),
    rewardProgress: rewardProgressFor(dataset, demoProgress),
    rewardAudit: buildRewardAudit(dataset, demoProgress, new Set()),
    startupReconciliation: { state: 'none' },
    logConnected: false,
  };
}
function broadcastState(): void {
  if (!dataset) return;
  const real = runtimeState();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('state:changed', real);
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('state:changed', overlayState(real));
}
function appendDetectionTrace(entry: Omit<DetectionTraceEntry, 'id' | 'at'>): void {
  const at = new Date().toISOString();
  detectionTrace = [...detectionTrace, { ...entry, id: `${at}:${detectionTrace.length}`, at }].slice(-60);
}

async function setProgress(nextProgress: number, reason = 'Manual progress change', confidence: 'manual' | 'verified' | 'inferred' = 'manual', automatic = false, event?: ZoneEvent): Promise<void> {
  const next = Math.max(0, Math.min(Math.trunc(nextProgress), dataset.steps.length - 1));
  if (next === progress) return;
  const previous = progress;
  const previousAct = dataset.steps[previous]?.act;
  const nextAct = dataset.steps[next]?.act;
  progress = next;
  progressHistory = appendHistory(progressHistory, makeHistoryEntry(previous, next, reason, confidence, automatic, event));
  if (runSession.state === 'running' && nextAct) {
    if (previousAct && nextAct > previousAct) runSession = recordActTransition(runSession, nextAct);
    else if (previousAct && nextAct < previousAct) runSession = { ...runSession, currentAct: nextAct, splits: runSession.splits.filter((split) => split.act < nextAct) };
    await saveRunState();
  }
  await saveProgress();
  sessionGuard?.update(progress, app.getVersion());
  broadcastState();
}
async function undoProgress(): Promise<void> {
  const entry = progressHistory.at(-1);
  if (!entry) return;
  progressHistory = progressHistory.slice(0, -1);
  progress = Math.max(0, Math.min(entry.from, dataset.steps.length - 1));
  const act = dataset.steps[progress]?.act;
  if (runSession.state === 'running' && act) { runSession = { ...runSession, currentAct: act, splits: runSession.splits.filter((split) => split.act < act) }; await saveRunState(); }
  await saveProgress();
  sessionGuard?.update(progress, app.getVersion());
  broadcastState();
}
async function startCampaignRun(): Promise<void> { runSession = startRun(runSession, dataset.steps[progress]?.act ?? 1); await saveRunState(); broadcastState(); }
async function pauseCampaignRun(): Promise<void> { runSession = pauseRun(runSession); await saveRunState(); broadcastState(); }
async function resetCampaignRun(): Promise<void> { runSession = resetRun(); await saveRunState(); broadcastState(); }
async function finishCampaignRun(): Promise<void> {
  const result = finishRun(runSession); runSession = result.session; if (result.history) runHistory = appendRunHistory(runHistory, result.history); await saveRunState(); broadcastState();
}

async function loadRenderer(window: BrowserWindow, mode: 'manager' | 'overlay'): Promise<void> {
  const base = process.env.VITE_DEV_SERVER_URL;
  if (base) await window.loadURL(`${base}?mode=${mode}`);
  else await window.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'), { query: { mode } });
}
function commonWebPreferences(): Electron.WebPreferences {
  return { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, devTools: !app.isPackaged };
}
function openExternalIfAllowed(url: string): void {
  if (isAllowedExternalUrl(url)) void shell.openExternal(url);
  else log.warn(`Blocked renderer external URL: ${url}`);
}
function wireWindowDiagnostics(window: BrowserWindow, label: string): void {
  window.webContents.on('render-process-gone', (_event, details) => log.error(`${label} renderer process exited unexpectedly.`, details));
  window.webContents.on('unresponsive', () => log.warn(`${label} renderer became unresponsive.`));
  window.webContents.on('responsive', () => log.info(`${label} renderer became responsive again.`));
  window.webContents.on('will-navigate', (event, url) => { event.preventDefault(); openExternalIfAllowed(url); });
}
function createMainWindow(): BrowserWindow {
  const window = new BrowserWindow({ width: 1220, height: 800, minWidth: 980, minHeight: 660, show: false, backgroundColor: '#090b10', title: 'ExileQuesting', autoHideMenuBar: true, webPreferences: commonWebPreferences() });
  wireWindowDiagnostics(window, 'Manager');
  window.once('ready-to-show', () => { if (!settings.launchMinimized) window.show(); });
  window.on('close', (event) => { if (!(app as Electron.App & { isQuitting?: boolean }).isQuitting) { event.preventDefault(); window.hide(); } });
  window.webContents.setWindowOpenHandler(({ url }) => { openExternalIfAllowed(url); return { action: 'deny' }; });
  void loadRenderer(window, 'manager').catch((error) => log.error('Failed to load manager UI.', error));
  return window;
}
function applyOverlayInteraction(): void { if (overlayWindow) overlayWindow.setIgnoreMouseEvents(settings.overlayClickThrough && !interactionOverride, { forward: true }); }
function markProgrammaticOverlayMove(): void { ignoreOverlayMovedUntil = Date.now() + 300; }
function placeOverlay(): void { if (overlayWindow) { markProgrammaticOverlayMove(); settings.overlayPosition = applyOverlayPosition(overlayWindow, settings.overlayPosition); } }
function createOverlayWindow(): BrowserWindow {
  const window = new BrowserWindow({
    width: widthForMode(settings.overlayMode, settings.overlayScale), height: 280, minWidth: 300, minHeight: 110, show: false, frame: false, transparent: true,
    backgroundColor: '#00000000', alwaysOnTop: true, skipTaskbar: true, resizable: !settings.overlayPosition.locked, hasShadow: true, webPreferences: commonWebPreferences(),
  });
  wireWindowDiagnostics(window, 'Overlay');
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setOpacity(settings.reducedTransparency ? 1 : settings.overlayOpacity);
  applyOverlayInteraction();
  window.on('moved', () => {
    if (!overlayWindow || settings.overlayPosition.locked || Date.now() < ignoreOverlayMovedUntil) return;
    settings.overlayPosition = snapCustomPosition(overlayWindow, settings.overlayPosition); void saveSettings();
  });
  window.webContents.setWindowOpenHandler(({ url }) => { openExternalIfAllowed(url); return { action: 'deny' }; });
  void loadRenderer(window, 'overlay').then(() => { placeOverlay(); void saveSettings(); }).catch((error) => log.error('Failed to load overlay UI.', error));
  return window;
}
function toggleOverlay(): void { if (!overlayWindow) return; if (overlayWindow.isVisible()) overlayWindow.hide(); else overlayWindow.showInactive(); }
async function cycleOverlayMode(): Promise<void> {
  const modes: AppSettings['overlayMode'][] = ['focus', 'compact', 'coach'];
  settings.overlayMode = modes[(modes.indexOf(settings.overlayMode) + 1) % modes.length]; await saveSettings(); broadcastState();
}
function registerHotkeys(): void {
  globalShortcut.unregisterAll();
  const bindings: Array<[string, () => void]> = [
    [settings.hotkeys.toggleOverlay, toggleOverlay], [settings.hotkeys.nextStep, () => void setProgress(progress + 1)], [settings.hotkeys.previousStep, () => void setProgress(progress - 1)],
    [settings.hotkeys.toggleInteraction, () => { interactionOverride = !interactionOverride; applyOverlayInteraction(); }], [settings.hotkeys.cycleOverlayMode, () => void cycleOverlayMode()],
  ];
  for (const [accelerator, handler] of bindings) {
    try { if (!globalShortcut.register(accelerator, handler)) log.warn(`Hotkey is unavailable: ${accelerator}`); }
    catch (error) { log.warn(`Invalid hotkey ignored: ${accelerator}`, error); }
  }
}
function openPreplaytestLab(): void {
  if (labWindow && !labWindow.isDestroyed()) { labWindow.show(); labWindow.focus(); return; }
  labWindow = createPreplaytestLab(path.join(__dirname, 'preload.cjs'));
  wireWindowDiagnostics(labWindow, 'Pre-playtest Lab');
  labWindow.on('closed', () => { labWindow = null; overlayDemo = null; broadcastState(); });
}

function createTray(): void {
  const iconPath = app.isPackaged ? path.join(process.resourcesPath, 'campaign', 'tray.png') : bundledCampaignPath('tray.png');
  const image = nativeImage.createFromPath(iconPath);
  tray = new Tray(image.isEmpty() ? nativeImage.createEmpty() : image);
  tray.setToolTip('ExileQuesting');
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Open ExileQuesting', click: () => mainWindow?.show() }, { label: 'Pre-playtest Lab', click: openPreplaytestLab }, { label: 'Toggle campaign overlay', click: toggleOverlay },
    { label: 'Cycle overlay mode', click: () => void cycleOverlayMode() }, { type: 'separator' },
    { label: 'Quit', click: () => { (app as Electron.App & { isQuitting?: boolean }).isQuitting = true; app.quit(); } },
  ]));
  tray.on('double-click', () => mainWindow?.show());
}

function updateCurrentArea(event: ZoneEvent): void {
  if (event.areaId) { currentAreaId = event.areaId; currentAreaLevel = event.areaLevel ?? currentAreaLevel; currentZone = dataset.areas.find((area) => area.id === event.areaId)?.name ?? currentZone; }
  if (event.areaName) currentZone = event.areaName;
  if (event.areaLevel) currentAreaLevel = event.areaLevel;
  if (event.characterLevel) characterLevel = event.characterLevel;
}
async function updateRunFromZone(event: ZoneEvent): Promise<void> {
  if (event.type === 'character-level') return;
  if (settings.autoStartRunTimer && runSession.state === 'idle' && progress <= 3) runSession = startRun(runSession, dataset.steps[progress]?.act ?? 1);
  if (runSession.state === 'running') { runSession = recordRunArea(runSession, event.areaId); await saveRunState(); }
}
async function handleZoneEvent(event: ZoneEvent): Promise<void> {
  const progressBefore = progress;
  const stepIdBefore = dataset.steps[progressBefore]?.id;
  const previousAreaId = currentAreaId || undefined;
  const previousAreaName = currentZone || undefined;
  updateCurrentArea(event);
  await updateRunFromZone(event);
  let decision: ReturnType<typeof decideProgression> = null;
  if (event.type !== 'character-level' && settings.autoAdvance) {
    decision = decideProgression(dataset.steps, progress, event, { isStepEnabled: (step) => enabled(step), currentAreaId: previousAreaId, currentAreaName: previousAreaName });
    if (decision && decision.to > progress) await setProgress(decision.to, decision.reason, decision.confidence, true, event);
  }
  if (event.type !== 'character-level' && event.areaId === '2_11_endgame_town' && runSession.state === 'running') await finishCampaignRun();
  const reason = event.type === 'character-level' ? `Character level updated to ${event.characterLevel ?? '?'}.`
    : !settings.autoAdvance ? 'Automatic route progress is disabled.' : decision ? decision.reason : 'No bounded campaign transition matched this event.';
  appendDetectionTrace({ eventType: event.type, areaId: event.areaId, areaName: event.areaName, areaLevel: event.areaLevel, progressBefore, progressAfter: progress, stepIdBefore, stepIdAfter: dataset.steps[progress]?.id, confidence: decision?.confidence, reason, raw: event.raw });
  broadcastState();
  if (event.type !== 'character-level' && settings.autoShowOnZoneChange && overlayWindow && !overlayWindow.isVisible()) overlayWindow.showInactive();
}
async function handleStartupZone(event: ZoneEvent | undefined): Promise<void> {
  if (!event) return;
  const progressBefore = progress;
  const previousAreaId = currentAreaId || undefined;
  const previousAreaName = currentZone || undefined;
  updateCurrentArea(event);
  const decision = decideProgression(dataset.steps, progress, event, { isStepEnabled: (step) => enabled(step), currentAreaId: previousAreaId, currentAreaName: previousAreaName });
  if (decision && decision.confidence === 'verified' && decision.to > progress && decision.to - progress <= 3) {
    await setProgress(decision.to, `Startup reconciliation: ${decision.reason}`, 'verified', true, event); startupReconciliation = { state: 'none' };
  } else startupReconciliation = reconcileStartup(dataset.steps, progress, event, (step) => enabled(step));
  appendDetectionTrace({
    eventType: event.type, areaId: event.areaId, areaName: event.areaName, areaLevel: event.areaLevel, progressBefore, progressAfter: progress,
    stepIdBefore: dataset.steps[progressBefore]?.id, stepIdAfter: dataset.steps[progress]?.id, confidence: decision?.confidence,
    reason: startupReconciliation.state === 'suggested' ? startupReconciliation.message ?? 'Startup zone requires confirmation.' : decision?.reason ?? 'Startup tail established the current zone without changing progress.', raw: event.raw,
  });
  broadcastState();
}
async function startLogWatcher(): Promise<void> {
  if (logWatcher) await logWatcher.stop();
  logWatcher = null;
  if (!settings.logPath) settings.logPath = await detectLogPath();
  if (!settings.logPath) { logDiagnostics = { path: '', fileExists: false, watcherActive: false, pollingActive: false }; broadcastState(); return; }
  logWatcher = new PoELogWatcher(settings.logPath, {
    onEvent: handleZoneEvent, onStartupZone: handleStartupZone, onDiagnostics: (diagnostics) => { logDiagnostics = diagnostics; broadcastState(); },
    log: { info: (...args) => log.info(...args), warn: (...args) => log.warn(...args) },
  });
  await saveSettings(); await logWatcher.start(); broadcastState();
}

function rawUrl(repository: string, commit: string, filePath: string): string {
  const encoded = filePath.split('/').map(encodeURIComponent).join('/');
  return `https://raw.githubusercontent.com/${repository}/${commit}/${encoded}`;
}
async function checkCampaignUpdates(): Promise<void> {
  if (sourceStatus.state === 'checking') return;
  await refreshRemoteCompatibility();
  sourceStatus = { ...sourceStatus, state: 'checking', message: 'Checking Exile-UI for campaign changes…' }; broadcastState();
  const checkedAt = new Date().toISOString();
  try {
    const repo = compatibility.upstream.repository;
    const commitInfo = await fetchJson<{ sha: string }>(`https://api.github.com/repos/${repo}/commits/main`, 512 * 1024);
    if (commitInfo.sha === dataset.source.commit) { sourceStatus = { state: 'current', activeCommit: dataset.source.commit, latestCommit: commitInfo.sha, checkedAt, message: 'Campaign data is current and verified.' }; broadcastState(); return; }
    sourceStatus = { ...sourceStatus, state: 'update-available', latestCommit: commitInfo.sha, checkedAt, message: 'New upstream data found. Staging and validating it…' }; broadcastState();
    const [guide, areas] = await Promise.all([
      fetchJson<RawGuide>(rawUrl(repo, commitInfo.sha, compatibility.upstream.guidePath)),
      fetchJson<RawAreas>(rawUrl(repo, commitInfo.sha, compatibility.upstream.areasPath)),
    ]);
    const validation = validateCampaign(guide, areas);
    if (!validation.valid) { sourceStatus = { state: 'fallback', activeCommit: dataset.source.commit, latestCommit: commitInfo.sha, checkedAt, message: 'New upstream data failed validation. Last known-good campaign remains active.', validation }; log.error('Rejected upstream campaign update.', validation); broadcastState(); return; }
    const current = userPath('campaign/current');
    await Promise.all([
      atomicWriteJson(path.join(current, 'guide.json'), guide), atomicWriteJson(path.join(current, 'areas.json'), areas),
      atomicWriteJson(path.join(current, 'manifest.json'), { commit: commitInfo.sha, fetchedAt: checkedAt, validation }),
    ]);
    dataset = normalizeCampaign(guide, areas, await loadAnnotations(), { repository: repo, commit: commitInfo.sha, fetchedAt: checkedAt, license: 'MIT' }, await loadLayoutHints());
    progress = Math.min(progress, dataset.steps.length - 1);
    confirmedRewardStepIds = new Set([...confirmedRewardStepIds].filter((id) => dataset.steps.some((step) => step.id === id)));
    await saveRewardConfirmations();
    sourceStatus = { state: 'current', activeCommit: commitInfo.sha, latestCommit: commitInfo.sha, checkedAt, message: 'New Exile-UI campaign data passed validation and is active.', validation };
  } catch (error) {
    sourceStatus = { state: 'error', activeCommit: dataset.source.commit, checkedAt, message: `Update check failed. Verified local campaign remains active. ${error instanceof Error ? error.message : ''}`.trim() };
    log.warn('Campaign update check failed.', error);
  }
  broadcastState();
}
function initializeAppUpdater(): void {
  appUpdater = new AppUpdater({
    repository: APP_RELEASE_REPOSITORY, currentVersion: app.getVersion(), updatesDirectory: userPath('updates'), packaged: app.isPackaged,
    onState: (state) => { appUpdate = state; broadcastState(); if (state.status === 'available' && settings.autoDownloadAppUpdates) void appUpdater?.download(); },
    log: { info: (...args) => log.info(...args), warn: (...args) => log.warn(...args) },
  });
  appUpdate = appUpdater.snapshot();
}

function diagnosticsText(): string {
  const state = runtimeState();
  const trace = state.detectionTrace.slice(-10).map((entry) => `${entry.at} ${entry.eventType} ${entry.areaId ?? entry.areaName ?? ''} ${entry.progressBefore + 1}->${entry.progressAfter + 1} ${entry.confidence ?? '-'} ${entry.reason}`);
  const replay = lastReplay ? `Replay: ${lastReplay.parsedEvents} events, ${lastReplay.errors.length} errors, final page ${lastReplay.finalProgress + 1}` : 'Replay: none this session';
  return [
    `ExileQuesting ${state.appVersion}`, `Application update: ${state.appUpdate.status} - ${state.appUpdate.message}`, `Campaign: ${state.dataset.source.repository}@${state.dataset.source.commit}`,
    `Schema: ${state.dataset.schemaVersion}`, `Progress: ${state.progress + 1}/${state.dataset.steps.length}`, `Step: ${state.dataset.steps[state.progress]?.id ?? 'unknown'}`,
    `Zone: ${state.currentZone ?? 'unknown'} (${state.currentAreaId ?? 'no-id'})`, `Character/Area: ${state.characterLevel ?? '?'} / ${state.currentAreaLevel ?? '?'}`,
    `Log: ${state.logDiagnostics.path || 'not configured'}`, `Watcher: ${state.logDiagnostics.watcherActive ? 'active' : 'inactive'}; polling: ${state.logDiagnostics.pollingActive ? 'active' : 'inactive'}`,
    `Last event: ${state.logDiagnostics.lastParsedEventAt ?? 'none'}`, `Source status: ${state.sourceStatus.state} - ${state.sourceStatus.message}`,
    `Progress history entries: ${state.progressHistory.length}`, `Run: ${state.runStats.session.state}; elapsed ${state.runStats.elapsedMs}ms; town ${state.runStats.session.townTimeMs}ms; splits ${state.runStats.session.splits.length}`,
    `Reward audit: passives ${state.rewardAudit.passive.confirmed}/${state.rewardAudit.passive.knownTotal} confirmed; trials ${state.rewardAudit.trials.confirmed}/${state.rewardAudit.trials.knownTotal} confirmed`,
    `Previous session unclean: ${state.recovery.previousSessionUnclean ? 'yes' : 'no'}`, replay, '', 'Recent detection trace:', ...(trace.length ? trace : ['No detection events recorded this session.']),
  ].join('\n');
}
async function exportDiagnostics(): Promise<void> {
  const options: Electron.SaveDialogOptions = { title: 'Export ExileQuesting diagnostics', defaultPath: `ExileQuesting-diagnostics-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`, filters: [{ name: 'Text report', extensions: ['txt'] }] };
  const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
  if (!result.canceled && result.filePath) await fs.writeFile(result.filePath, diagnosticsText(), 'utf8');
}
async function replayCapturedLog(): Promise<ReplayUiResult | null> {
  const options: Electron.OpenDialogOptions = { title: 'Replay a captured Path of Exile Client.txt', properties: ['openFile'], filters: [{ name: 'Path of Exile log', extensions: ['txt', 'log'] }] };
  const selected = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
  const sourcePath = selected.filePaths[0];
  if (selected.canceled || !sourcePath) return null;
  const stat = await fs.stat(sourcePath);
  if (stat.size > MAX_REPLAY_BYTES) throw new Error(`Replay file is larger than ${MAX_REPLAY_BYTES / 1024 / 1024} MB.`);
  const content = await fs.readFile(sourcePath, 'utf8');
  const report = replayClientLogChunks(deterministicChunks(content, 0x455149, 4096), dataset.steps, 0, { isStepEnabled: (step) => enabled(step) });
  lastReplay = { sourcePath, chunks: report.chunks, lines: report.lines, parsedEvents: report.parsedEvents, finalProgress: report.finalProgress, errors: report.errors, decisions: report.decisions.slice(-200) };
  return lastReplay;
}

function sanitizeDemo(value: unknown): OverlayDemoConfig {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const mode = ['focus', 'compact', 'coach'].includes(String(input.mode)) ? input.mode as OverlayMode : 'focus';
  const demoProgress = Math.max(0, Math.min(dataset.steps.length - 1, Math.trunc(Number(input.progress) || 0)));
  const optionalLevel = (candidate: unknown, min: number, max: number) => candidate === undefined ? undefined : Math.max(min, Math.min(max, Math.trunc(Number(candidate) || min)));
  return { progress: demoProgress, mode, characterLevel: optionalLevel(input.characterLevel, 1, 100), areaLevel: optionalLevel(input.areaLevel, 1, 100) };
}
function registerIpc(): void {
  ipcMain.handle('app:bootstrap', () => runtimeState());
  ipcMain.handle('lab:open', () => openPreplaytestLab());
  ipcMain.handle('settings:update', async (_event, patch: Partial<AppSettings>) => {
    const candidate = {
      ...settings, ...patch,
      hotkeys: patch.hotkeys ? { ...settings.hotkeys, ...patch.hotkeys } : settings.hotkeys,
      overlayTypography: patch.overlayTypography ? { ...settings.overlayTypography, ...patch.overlayTypography } : settings.overlayTypography,
      overlayPosition: patch.overlayPosition ? { ...settings.overlayPosition, ...patch.overlayPosition } : settings.overlayPosition,
    };
    settings = normalizeSettingsDocument(candidate, DEFAULT_SETTINGS);
    await saveSettings();
    if (overlayWindow) { overlayWindow.setOpacity(settings.reducedTransparency ? 1 : settings.overlayOpacity); overlayWindow.setResizable(!settings.overlayPosition.locked); applyOverlayInteraction(); placeOverlay(); await saveSettings(); }
    registerHotkeys();
    if (patch.logPath !== undefined) await startLogWatcher();
    if (patch.autoDownloadAppUpdates && appUpdate.status === 'available') void appUpdater?.download();
    broadcastState(); return runtimeState();
  });
  ipcMain.handle('log:select', async () => {
    const options: Electron.OpenDialogOptions = { title: 'Select Path of Exile Client.txt or LatestClient.txt', properties: ['openFile'], filters: [{ name: 'Path of Exile log', extensions: ['txt'] }] };
    const result = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (!result.canceled && result.filePaths[0]) { settings = normalizeSettingsDocument({ ...settings, logPath: result.filePaths[0] }, DEFAULT_SETTINGS); await saveSettings(); await startLogWatcher(); }
    return runtimeState();
  });
  ipcMain.handle('progress:set', async (event, next: number) => {
    if (overlayDemo && overlayWindow && event.sender === overlayWindow.webContents) { overlayDemo = { ...overlayDemo, progress: Math.max(0, Math.min(dataset.steps.length - 1, Math.trunc(Number(next) || 0))) }; broadcastState(); return overlayState(); }
    await setProgress(next); return runtimeState();
  });
  ipcMain.handle('progress:undo', async () => { await undoProgress(); return runtimeState(); });
  ipcMain.handle('startup:reconcile', async (_event, accept: boolean) => {
    if (accept === true && startupReconciliation.state === 'suggested' && startupReconciliation.detectedProgress !== undefined) await setProgress(startupReconciliation.detectedProgress, 'Accepted detected startup zone', 'manual', false);
    startupReconciliation = { state: 'none' }; broadcastState(); return runtimeState();
  });
  ipcMain.handle('overlay:show', () => overlayWindow?.showInactive());
  ipcMain.handle('overlay:hide', () => overlayWindow?.hide());
  ipcMain.handle('overlay:toggle', toggleOverlay);
  ipcMain.handle('overlay:content-size', async (_event, height: number) => {
    if (!overlayWindow || !Number.isFinite(height)) return;
    markProgrammaticOverlayMove(); settings.overlayPosition = resizeOverlayToContent(overlayWindow, height, settings); await saveSettings();
  });
  ipcMain.handle('overlay:reset-position', async () => { if (!overlayWindow) return runtimeState(); settings.overlayPosition = { preset: 'top-right', locked: false, snapToEdges: true }; placeOverlay(); await saveSettings(); broadcastState(); return runtimeState(); });
  ipcMain.handle('overlay:demo', (_event, value: unknown) => { overlayDemo = sanitizeDemo(value); overlayWindow?.showInactive(); broadcastState(); return overlayState(); });
  ipcMain.handle('overlay:demo-stop', () => { overlayDemo = null; broadcastState(); return runtimeState(); });
  ipcMain.handle('campaign:check', async () => { await checkCampaignUpdates(); return runtimeState(); });
  ipcMain.handle('reward:confirm', async (_event, stepId: string, confirmed: boolean) => {
    if (typeof stepId !== 'string' || stepId.length > 256 || !dataset.steps.some((step) => step.id === stepId && step.permanentReward)) return runtimeState();
    if (confirmed === true) confirmedRewardStepIds.add(stepId); else confirmedRewardStepIds.delete(stepId); await saveRewardConfirmations(); broadcastState(); return runtimeState();
  });
  ipcMain.handle('run:start', async () => { await startCampaignRun(); return runtimeState(); });
  ipcMain.handle('run:pause', async () => { await pauseCampaignRun(); return runtimeState(); });
  ipcMain.handle('run:reset', async () => { await resetCampaignRun(); return runtimeState(); });
  ipcMain.handle('run:finish', async () => { await finishCampaignRun(); return runtimeState(); });
  ipcMain.handle('app-update:check', async () => { await appUpdater?.check(); return runtimeState(); });
  ipcMain.handle('app-update:download', async () => { await appUpdater?.download(); return runtimeState(); });
  ipcMain.handle('app-update:install', async () => { const scheduled = await appUpdater?.installOnExit(); if (scheduled) { (app as Electron.App & { isQuitting?: boolean }).isQuitting = true; app.quit(); } return runtimeState(); });
  ipcMain.handle('recovery:acknowledge', () => { recovery = { ...recovery, acknowledged: true }; broadcastState(); return runtimeState(); });
  ipcMain.handle('diagnostics:open', async () => { await shell.showItemInFolder(log.transports.file.getFile().path); });
  ipcMain.handle('diagnostics:copy', () => { clipboard.writeText(diagnosticsText()); });
  ipcMain.handle('diagnostics:export', async () => { await exportDiagnostics(); });
  ipcMain.handle('diagnostics:replay', async () => replayCapturedLog());
}

async function waitForRenderer(window: BrowserWindow): Promise<void> {
  if (!window.webContents.isLoading()) return;
  await new Promise<void>((resolve, reject) => {
    const done = () => { cleanup(); resolve(); };
    const failed = (_event: unknown, code: number, description: string) => { cleanup(); reject(new Error(`Renderer load failed (${code}): ${description}`)); };
    const cleanup = () => { window.webContents.removeListener('did-finish-load', done); window.webContents.removeListener('did-fail-load', failed); };
    window.webContents.once('did-finish-load', done);
    window.webContents.once('did-fail-load', failed);
  });
}
async function runVisualSmoke(outputArgument: string): Promise<void> {
  if (!overlayWindow) throw new Error('Overlay window is unavailable for visual smoke testing.');
  const output = path.resolve(outputArgument.split('=').slice(1).join('=') || 'artifacts/visual');
  await fs.mkdir(output, { recursive: true });
  await waitForRenderer(overlayWindow);
  const warningIndex = Math.max(0, dataset.steps.findIndex((step) => step.annotation?.warning));
  const passiveIndex = Math.max(0, dataset.steps.findIndex((step) => step.permanentReward === 'passive'));
  const coachIndex = Math.max(0, dataset.steps.findIndex((step) => step.annotation?.details?.length && step.annotation?.speedrun));
  const scenarios: Array<{ name: string; progress: number; mode: OverlayMode; typography: AppSettings['overlayTypography'] }> = [
    { name: 'focus-default-start', progress: 0, mode: 'focus', typography: DEFAULT_SETTINGS.overlayTypography },
    { name: 'compact-large-warning', progress: warningIndex, mode: 'compact', typography: { ...DEFAULT_SETTINGS.overlayTypography, preset: 'large', objective: 24, actions: 17, guidance: 15, labels: 11, status: 11 } },
    { name: 'focus-extra-large-passive', progress: passiveIndex, mode: 'focus', typography: { ...DEFAULT_SETTINGS.overlayTypography, preset: 'extra-large', objective: 28, actions: 20, guidance: 17, labels: 13, status: 13 } },
    { name: 'coach-extra-large', progress: coachIndex, mode: 'coach', typography: { ...DEFAULT_SETTINGS.overlayTypography, preset: 'extra-large', objective: 28, actions: 20, guidance: 17, labels: 13, status: 13, density: 'spacious' } },
  ];
  const captures: Array<{ name: string; width: number; height: number; bytes: number }> = [];
  for (const scenario of scenarios) {
    settings = normalizeSettingsDocument({ ...settings, overlayMode: scenario.mode, overlayTypography: scenario.typography, overlayScale: 1 }, DEFAULT_SETTINGS);
    overlayDemo = { progress: scenario.progress, mode: scenario.mode };
    broadcastState(); overlayWindow.showInactive();
    await new Promise((resolve) => setTimeout(resolve, 450));
    const image = await overlayWindow.capturePage();
    const png = image.toPNG();
    const size = image.getSize();
    if (!png.length || size.width < 250 || size.height < 100 || size.height > 1800) throw new Error(`Visual scenario ${scenario.name} produced suspicious bounds ${size.width}x${size.height}.`);
    await fs.writeFile(path.join(output, `${scenario.name}.png`), png);
    captures.push({ name: scenario.name, width: size.width, height: size.height, bytes: png.length });
  }
  await fs.writeFile(path.join(output, 'manifest.json'), JSON.stringify({ generatedAt: new Date().toISOString(), captures }, null, 2), 'utf8');
  log.info(`Overlay visual smoke generated ${captures.length} captures in ${output}.`);
  overlayDemo = null;
}

process.on('uncaughtException', (error) => log.error('Uncaught exception', error));
process.on('unhandledRejection', (error) => log.error('Unhandled rejection', error));

const hasLock = app.requestSingleInstanceLock();
if (!hasLock) app.quit();
else {
  app.on('second-instance', () => { mainWindow?.show(); mainWindow?.focus(); });
  app.on('child-process-gone', (_event, details) => log.error('Electron child process exited unexpectedly.', details));
  app.whenReady().then(async () => {
    store = new StateStore(app.getPath('userData'));
    await loadPersistentState();
    await loadLocalCompatibility();
    await loadCampaign();
    if (isSmokeTest) { log.info(`Packaged startup smoke test passed with ${dataset.steps.length} campaign steps.`); app.exit(0); return; }

    sessionGuard = new SessionGuard(app.getPath('userData'));
    recovery = sessionGuard.begin(app.getVersion(), progress);
    initializeAppUpdater();
    registerIpc();

    if (visualSmokeArgument) {
      overlayWindow = createOverlayWindow();
      await runVisualSmoke(visualSmokeArgument);
      app.exit(0);
      return;
    }

    mainWindow = createMainWindow();
    overlayWindow = createOverlayWindow();
    createTray();
    registerHotkeys();
    await startLogWatcher();
    campaignUpdateTimer = setInterval(() => void checkCampaignUpdates(), CAMPAIGN_CHECK_INTERVAL_MS);
    setTimeout(() => void checkCampaignUpdates(), 4_000);
    if (settings.autoCheckAppUpdates) { appUpdateTimer = setInterval(() => void appUpdater?.check(), APP_UPDATE_CHECK_INTERVAL_MS); setTimeout(() => void appUpdater?.check(), 8_000); }
  }).catch((error) => {
    log.error('Fatal startup failure.', error);
    if (isSmokeTest || visualSmokeArgument) { app.exit(1); return; }
    void dialog.showErrorBox('ExileQuesting could not start', `The application hit a startup error. A diagnostic log was written to:\n${log.transports.file.getFile().path}\n\n${error instanceof Error ? error.message : String(error)}`);
    app.quit();
  });
}

app.on('activate', () => mainWindow?.show());
app.on('before-quit', () => {
  (app as Electron.App & { isQuitting?: boolean }).isQuitting = true;
  if (campaignUpdateTimer) clearInterval(campaignUpdateTimer);
  if (appUpdateTimer) clearInterval(appUpdateTimer);
  sessionGuard?.clean();
  void logWatcher?.stop();
  globalShortcut.unregisterAll();
});
