import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  globalShortcut,
  ipcMain,
  Menu,
  nativeImage,
  screen,
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
import { runCampaignSimulationSuite } from '../src/core/simulation-suite';
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
import { isMaxrollGuideUrl } from '../src/core/maxroll';
import { analyzeGearItem, type GearCoachAnalysis } from '../src/core/gear-coach';
import { MAX_POB_XML_BYTES } from '../src/core/pob';
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
import { runOverlayWindowSoak } from './services/overlay-soak';
import { importPobBuild } from './services/pob-service';
import { importMaxrollGuide } from './services/maxroll-service';
import { defaultBuildProfileName, upsertBuildProfile, type BuildProfile } from '../src/core/build-profiles';
import { activateBuildProfile, activateBuildStage, activateMaxrollStageForLevel, buildPlannerSnapshot, normalizeBuildPlannerState, stepBuildPassiveCursor, type BuildPlannerState } from '../src/core/build-planner';
import { buildGemAcquisitionPlan, type GemAcquisitionPlan } from '../src/core/gem-acquisition';
import { bridgeBuildPlanToCampaign, campaignBuildActionsForStep, type CampaignBuildBridge } from '../src/core/build-campaign';
import { buildCoachSnapshot, type BuildCoachSnapshot } from '../src/core/build-coach';
import { buildCampaignIntelligence, campaignIntelligenceActionsForStep, type CampaignIntelligence } from '../src/core/campaign-intelligence';
import type { LootFilterStatus } from '../src/core/loot-filter';
import { bundledGemDataPath, bundledPassiveDataPath, loadGemAcquisitionSnapshot, loadPassiveTreeSnapshot, type GameDataLoadResult, type PassiveDataLoadResult } from './services/game-data';
import { unconfiguredLootFilterState, writeBuildAwareLootFilter } from './services/loot-filter-service';
import { PassiveTreeHudService, type PassiveTreeHudContext } from './services/passive-tree-hud';
import { buildPassiveTreeGuidePlan } from '../src/core/passive-tree-guide';
import { passiveTreeHudIdle, type PassiveTreeHudState } from '../src/core/passive-tree-hud-state';

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
const overlaySoakArgument = process.argv.find((argument) => argument.startsWith('--overlay-soak='));
const isLabSmokeTest = process.argv.includes('--lab-smoke');

const DEFAULT_SETTINGS: AppSettings = {
  logPath: '', guidanceMode: 'beginner', leagueStart: true, bandit: 'none', showOptional: true, autoAdvance: true, autoShowOnZoneChange: true,
  overlayOpacity: 0.94, overlayScale: 1, overlayClickThrough: false, overlayMode: 'focus',
  overlayTypography: { preset: 'default', objective: 21, actions: 15, guidance: 13, labels: 10, status: 10, density: 'comfortable' },
  overlayPosition: { preset: 'top-right', locked: false, snapToEdges: true },
  overlayAutoCollapse: true, overlayAutoCollapseSeconds: 5, passiveTreeHudEnabled: true, passiveTreeHudPathPreview: true, reducedMotion: false, reducedTransparency: false,
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
let passiveTreeHudWindow: BrowserWindow | null = null;
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
let recentAreaIds: string[] = [];
let recentAreaNames: string[] = [];
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
let passiveTreeHudService: PassiveTreeHudService | null = null;
let passiveTreeHudState: PassiveTreeHudState = passiveTreeHudIdle(true);
let overlayDemo: OverlayDemoConfig | null = null;
let lastReplay: ReplayUiResult | null = null;
let buildProfiles: BuildProfile[] = [];
let buildPlannerState: BuildPlannerState = { schemaVersion: 1, activeStageByProfile: {}, passiveCursorByProfile: {} };
let gemData: GameDataLoadResult = { path: '', status: 'missing', message: 'Bundled gem acquisition data has not been loaded yet.' };
let passiveData: PassiveDataLoadResult = { path: '', status: 'missing', message: 'Bundled passive tree data has not been loaded yet.' };
let activeGemPlan: GemAcquisitionPlan | undefined;
let activeBuildCoach: BuildCoachSnapshot | undefined;
let buildBridge: CampaignBuildBridge | undefined;
let campaignIntelligence: CampaignIntelligence = { actionsByStep: {} };
let lootFilter: LootFilterStatus = unconfiguredLootFilterState();
let appUpdate: AppUpdateState = {
  status: app.isPackaged ? 'idle' : 'disabled', currentVersion: app.getVersion(),
  message: app.isPackaged ? 'Update check has not run yet.' : 'Application updates are disabled in development builds.',
};

log.initialize();
log.transports.file.level = 'info';
log.transports.console.level = 'info';

function normalizeLootFilterStatus(value: unknown): LootFilterStatus {
  const item = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const basePath = typeof item.basePath === 'string' && item.basePath.length <= 4096 ? item.basePath : undefined;
  if (!basePath) return unconfiguredLootFilterState();
  return {
    basePath,
    outputPath: typeof item.outputPath === 'string' && item.outputPath.length <= 4096 ? item.outputPath : undefined,
    generatedAt: typeof item.generatedAt === 'string' ? item.generatedAt : undefined,
    fingerprint: typeof item.fingerprint === 'string' && /^[a-f0-9]{64}$/i.test(item.fingerprint) ? item.fingerprint : undefined,
    needsReload: item.needsReload === true,
    status: item.status === 'error' ? 'error' : 'ready',
    message: typeof item.message === 'string' && item.message.trim() ? item.message.slice(0, 500) : 'Build-aware loot filter configuration restored.',
  };
}
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
  const run = await store.loadRun();
  runSession = run.session;
  runHistory = run.history;
  buildProfiles = await store.loadBuildProfiles();
  buildPlannerState = await store.loadBuildPlanner(buildProfiles);
  try { lootFilter = normalizeLootFilterStatus(await store.readUnknown('loot-filter.json')); }
  catch { lootFilter = unconfiguredLootFilterState(); }
}
async function saveLootFilterState(): Promise<void> { await store.write('loot-filter.json', lootFilter); }
async function saveSettings(): Promise<void> { await store.saveSettings(settings); }
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
  const savedProgress = await store.loadProgress(dataset.steps.length - 1);
  progress = savedProgress.progress;
  progressHistory = savedProgress.history;
  const knownRewardIds = new Set(dataset.steps.filter((step) => step.permanentReward).map((step) => step.id));
  confirmedRewardStepIds = await store.loadRewards(knownRewardIds);
}

async function loadBuildGameData(): Promise<void> {
  const options = { packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() };
  const [gems, passives] = await Promise.all([
    loadGemAcquisitionSnapshot(bundledGemDataPath(options), { info: (...args) => log.info(...args), warn: (...args) => log.warn(...args) }),
    loadPassiveTreeSnapshot(bundledPassiveDataPath(options), { info: (...args) => log.info(...args), warn: (...args) => log.warn(...args) }),
  ]);
  gemData = gems;
  passiveData = passives;
}

function passiveTreeHudContext(): PassiveTreeHudContext {
  const activeProfile = buildProfiles.find((profile) => profile.id === buildPlannerState.activeProfileId);
  const activeStageId = activeProfile ? buildPlannerState.activeStageByProfile[activeProfile.id] : undefined;
  const passiveCursor = activeProfile ? buildPlannerState.passiveCursorByProfile[activeProfile.id] ?? 0 : 0;
  const passiveRewardProgress = rewardProgressFor(dataset, progress).passive;
  return {
    enabled: settings.passiveTreeHudEnabled,
    pathPreview: settings.passiveTreeHudPathPreview,
    appWindowFocused: Boolean(mainWindow?.isFocused()),
    characterLevel,
    expectedQuestPassivePoints: passiveRewardProgress.completed,
    snapshot: passiveData.snapshot,
    guide: buildPassiveTreeGuidePlan(activeProfile, activeStageId, passiveCursor, passiveData.snapshot),
  };
}

function applyPassiveTreeHudState(next: PassiveTreeHudState): void {
  passiveTreeHudState = next;
  const window = passiveTreeHudWindow;
  if (window && !window.isDestroyed()) {
    if (settings.passiveTreeHudEnabled && next.status === 'locked' && next.visible && next.displayBounds) {
      const bounds = next.displayBounds;
      const current = window.getBounds();
      if (current.x !== bounds.x || current.y !== bounds.y || current.width !== bounds.width || current.height !== bounds.height) window.setBounds(bounds, false);
      if (!window.isVisible()) window.showInactive();
    } else if (window.isVisible()) window.hide();
  }
  broadcastState();
}

function initializePassiveTreeHud(): void {
  passiveTreeHudService?.stop();
  passiveTreeHudState = passiveTreeHudIdle(settings.passiveTreeHudEnabled);
  passiveTreeHudService = new PassiveTreeHudService({
    context: passiveTreeHudContext,
    onState: applyPassiveTreeHudState,
    log: { info: (...args) => log.info(...args), warn: (...args) => log.warn(...args) },
  });
  passiveTreeHudService.start();
}

function rebuildBuildGuidance(): void {
  buildPlannerState = normalizeBuildPlannerState(buildPlannerState, buildProfiles);
  campaignIntelligence = buildCampaignIntelligence(dataset);
  const activeProfile = buildProfiles.find((profile) => profile.id === buildPlannerState.activeProfileId);
  if (activeProfile?.maxroll && characterLevel) {
    buildPlannerState = activateMaxrollStageForLevel(buildPlannerState, buildProfiles, activeProfile.id, characterLevel);
  }
  activeGemPlan = activeProfile && gemData.snapshot ? buildGemAcquisitionPlan(activeProfile, gemData.snapshot) : undefined;
  buildBridge = activeGemPlan ? bridgeBuildPlanToCampaign(dataset, activeGemPlan) : undefined;
  const activeStageId = activeProfile ? buildPlannerState.activeStageByProfile[activeProfile.id] : undefined;
  const passiveCursor = activeProfile ? buildPlannerState.passiveCursorByProfile[activeProfile.id] ?? 0 : 0;
  activeBuildCoach = activeProfile && activeGemPlan && gemData.snapshot
    ? buildCoachSnapshot(activeProfile, activeStageId, activeGemPlan, gemData.snapshot, passiveData.snapshot, passiveCursor, characterLevel)
    : undefined;
  passiveTreeHudService?.poke();
}

async function refreshBuildLootFilter(): Promise<void> {
  if (!lootFilter.basePath) return;
  const pendingReload = lootFilter.needsReload;
  const generated = await writeBuildAwareLootFilter(lootFilter.basePath, activeBuildCoach?.loot, lootFilter.fingerprint);
  lootFilter = { ...generated, needsReload: pendingReload || generated.needsReload };
  await saveLootFilterState();
}

function buildAwareDataset(): CampaignDataset {
  const hasBuildActions = Boolean(buildBridge && Object.keys(buildBridge.actionsByStep).length);
  const hasCampaignIntelligence = Object.keys(campaignIntelligence.actionsByStep).length > 0;
  if (!hasBuildActions && !hasCampaignIntelligence) return dataset;
  return {
    ...dataset,
    steps: dataset.steps.map((step) => {
      const extras = [
        ...campaignIntelligenceActionsForStep(campaignIntelligence, step.id),
        ...(buildBridge ? campaignBuildActionsForStep(buildBridge, step.id) : []),
      ];
      return extras.length ? { ...step, actions: [...step.actions, ...extras] } : step;
    }),
  };
}

function buildWorkspaceSnapshot() {
  return {
    planner: buildPlannerSnapshot(buildProfiles, buildPlannerState),
    gemData: {
      status: gemData.status,
      message: gemData.message,
      gameVersion: gemData.snapshot?.gameVersion,
      sourceCommit: gemData.snapshot?.source.commit,
    },
    passiveData: {
      status: passiveData.status,
      message: passiveData.message,
      gameVersion: passiveData.snapshot?.gameVersion,
      sha256: passiveData.snapshot?.source.sha256,
    },
    plan: activeGemPlan,
    coach: activeBuildCoach,
    characterLevel,
    lootFilter,
    campaign: {
      resolved: buildBridge?.gemAvailability.filter((entry) => entry.confidence !== 'unresolved').length ?? 0,
      unresolved: buildBridge?.unresolved.length ?? 0,
      actionSteps: buildBridge ? Object.keys(buildBridge.actionsByStep).length : 0,
    },
  };
}

function enabled(step: CampaignDataset['steps'][number]): boolean { return isStepEnabled(step, settings); }
function xpGuidance(level = characterLevel, area = currentAreaLevel) { return calculateXpGuidance(level, area); }
function runtimeState(): RuntimeState {
  return {
    settings, dataset: buildAwareDataset(), sourceStatus, progress, currentZone: currentZone || undefined, currentAreaId: currentAreaId || undefined, currentAreaLevel, characterLevel,
    xpGuidance: xpGuidance(), rewardProgress: rewardProgressFor(dataset, progress), rewardAudit: buildRewardAudit(dataset, progress, confirmedRewardStepIds),
    progressHistory, startupReconciliation, logConnected: Boolean(settings.logPath && logDiagnostics.fileExists && (logDiagnostics.watcherActive || logDiagnostics.pollingActive)),
    logDiagnostics, detectionTrace, runStats: runStatsFor(runSession, runHistory), appUpdate, recovery, buildCoach: activeBuildCoach, lootFilter, passiveTreeHud: passiveTreeHudState, appVersion: app.getVersion(), diagnosticsPath: log.transports.file.getFile().path,
  };
}
function overlayState(real = runtimeState()): RuntimeState {
  if (!overlayDemo) return real;
  const demoProgress = Math.max(0, Math.min(Math.trunc(overlayDemo.progress), dataset.steps.length - 1));
  const step = dataset.steps[demoProgress];
  const previousAreaStep = dataset.steps.slice(0, demoProgress).reverse().find((candidate) => enabled(candidate) && (candidate.targetAreaId || candidate.targetArea) && (candidate.targetAreaId !== step.targetAreaId || candidate.targetArea !== step.targetArea));
  const detectedArea = previousAreaStep?.targetAreaId ? dataset.areas.find((area) => area.id === previousAreaStep.targetAreaId) : undefined;
  const areaLevel = overlayDemo.areaLevel ?? detectedArea?.lvl ?? previousAreaStep?.areaLevel ?? step.areaLevel;
  const level = overlayDemo.characterLevel ?? Math.max(1, (areaLevel ?? 1) - 2);
  return {
    ...real,
    settings: { ...real.settings, overlayMode: overlayDemo.mode, showRunTimerInOverlay: false },
    progress: demoProgress,
    currentZone: previousAreaStep?.targetArea ?? (demoProgress === 0 ? 'Waiting for zone detection' : 'Overlay demo'),
    currentAreaId: previousAreaStep?.targetAreaId,
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
  if (passiveTreeHudWindow && !passiveTreeHudWindow.isDestroyed()) passiveTreeHudWindow.webContents.send('state:changed', real);
}
function appendDetectionTrace(entry: Omit<DetectionTraceEntry, 'id' | 'at'>): void {
  const at = new Date().toISOString();
  detectionTrace = [...detectionTrace, { ...entry, id: `${at}:${detectionTrace.length}`, at }].slice(-60);
}

async function setProgress(nextProgress: number, reason = 'Manual progress change', confidence: 'manual' | 'verified' | 'inferred' = 'manual', automatic = false, event?: ZoneEvent): Promise<void> {
  const parsedProgress = Number(nextProgress);
  if (!Number.isFinite(parsedProgress)) return;
  const next = Math.max(0, Math.min(Math.trunc(parsedProgress), dataset.steps.length - 1));
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

async function loadRenderer(window: BrowserWindow, mode: 'manager' | 'overlay' | 'lab' | 'passive-tree-hud'): Promise<void> {
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
function createPassiveTreeHudWindow(): BrowserWindow {
  const primary = screen.getPrimaryDisplay().bounds;
  const window = new BrowserWindow({
    x: primary.x, y: primary.y, width: primary.width, height: primary.height,
    show: false, frame: false, transparent: true, backgroundColor: '#00000000', alwaysOnTop: true,
    skipTaskbar: true, focusable: false, resizable: false, movable: false, hasShadow: false, webPreferences: commonWebPreferences(),
  });
  wireWindowDiagnostics(window, 'Passive Tree HUD');
  window.setAlwaysOnTop(true, 'screen-saver');
  window.setIgnoreMouseEvents(true, { forward: true });
  if (process.platform === 'win32' || process.platform === 'darwin') window.setContentProtection(true);
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  void loadRenderer(window, 'passive-tree-hud').catch((error) => log.error('Failed to load Passive Tree HUD renderer.', error));
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
  labWindow = createPreplaytestLab(path.join(__dirname, 'preload.cjs'), !app.isPackaged);
  wireWindowDiagnostics(labWindow, 'Pre-playtest Lab');
  void loadRenderer(labWindow, 'lab').catch((error) => log.error('Failed to load Pre-playtest Lab UI.', error));
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

function appendRecentArea(values: string[], value?: string, limit = 8): string[] {
  if (!value) return values;
  return [...values.filter((candidate) => candidate !== value), value].slice(-limit);
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
  const incomingName = event.areaName?.trim().toLowerCase();
  const previousName = previousAreaName?.trim().toLowerCase();
  const distinctArea = event.type !== 'character-level' && (event.areaId ? event.areaId !== previousAreaId : Boolean(incomingName && incomingName !== previousName));
  if (distinctArea) {
    recentAreaIds = appendRecentArea(recentAreaIds, previousAreaId);
    recentAreaNames = appendRecentArea(recentAreaNames, previousAreaName);
  }
  updateCurrentArea(event);
  if (event.type === 'character-level') {
    rebuildBuildGuidance();
    await store.saveBuildPlanner(buildPlannerState, buildProfiles);
  }
  await updateRunFromZone(event);
  let decision: ReturnType<typeof decideProgression> = null;
  if (event.type !== 'character-level' && settings.autoAdvance) {
    decision = decideProgression(dataset.steps, progress, event, { isStepEnabled: (step) => enabled(step), currentAreaId: previousAreaId, currentAreaName: previousAreaName, recentAreaIds, recentAreaNames });
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
  const decision = decideProgression(dataset.steps, progress, event, { isStepEnabled: (step) => enabled(step), currentAreaId: previousAreaId, currentAreaName: previousAreaName, recentAreaIds, recentAreaNames });
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
    rebuildBuildGuidance();
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

async function exportReplayBundle(): Promise<boolean> {
  if (!lastReplay) return false;
  const options: Electron.SaveDialogOptions = {
    title: 'Export ExileQuesting replay bundle',
    defaultPath: `ExileQuesting-replay-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
    filters: [{ name: 'ExileQuesting replay', extensions: ['json'] }],
  };
  const result = mainWindow ? await dialog.showSaveDialog(mainWindow, options) : await dialog.showSaveDialog(options);
  if (result.canceled || !result.filePath) return false;
  const bundle = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    campaign: { repository: dataset.source.repository, commit: dataset.source.commit, schemaVersion: dataset.schemaVersion },
    replay: lastReplay,
  };
  await fs.writeFile(result.filePath, JSON.stringify(bundle, null, 2), 'utf8');
  return true;
}

function sanitizeDemo(value: unknown): OverlayDemoConfig {
  const input = value && typeof value === 'object' ? value as Record<string, unknown> : {};
  const mode = ['focus', 'compact', 'coach'].includes(String(input.mode)) ? input.mode as OverlayMode : 'focus';
  const demoProgress = Math.max(0, Math.min(dataset.steps.length - 1, Math.trunc(Number(input.progress) || 0)));
  const optionalLevel = (candidate: unknown, min: number, max: number) => candidate === undefined ? undefined : Math.max(min, Math.min(max, Math.trunc(Number(candidate) || min)));
  return { progress: demoProgress, mode, characterLevel: optionalLevel(input.characterLevel, 1, 100), areaLevel: optionalLevel(input.areaLevel, 1, 100) };
}
async function importBuildProfileInput(input: string, sourceOverride?: string): Promise<BuildProfile[]> {
  let profile: BuildProfile;
  if (isMaxrollGuideUrl(input.trim())) {
    const imported = await importMaxrollGuide(input.trim(), app.getVersion(), passiveData.snapshot, gemData.snapshot);
    profile = { ...imported, name: imported.maxroll.guideTitle };
  } else {
    const imported = await importPobBuild(input, app.getVersion());
    profile = { ...imported, name: defaultBuildProfileName(imported.build), source: sourceOverride ?? imported.source };
  }
  buildProfiles = upsertBuildProfile(buildProfiles, profile);
  buildPlannerState = activateBuildProfile(buildPlannerState, buildProfiles, profile.id);
  rebuildBuildGuidance();
  await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);
  await refreshBuildLootFilter();
  broadcastState();
  return buildProfiles;
}

function analyzeActiveGear(input: string): GearCoachAnalysis {
  const activeProfile = buildProfiles.find((profile) => profile.id === buildPlannerState.activeProfileId);
  if (!activeProfile) throw new Error('Select or import a Build Profile before using Gear Coach.');
  if (!gemData.snapshot) throw new Error('Bundled gem data is unavailable, so Gear Coach cannot build a stage-aware score.');
  const activeStageId = buildPlannerState.activeStageByProfile[activeProfile.id];
  return analyzeGearItem(input, activeProfile, activeStageId, gemData.snapshot, characterLevel);
}

function registerIpc(): void {
  ipcMain.handle('app:bootstrap', () => runtimeState());
  ipcMain.handle('lab:open', () => openPreplaytestLab());
  ipcMain.handle('settings:update', async (_event, patch: unknown) => {
    const safePatch = patch && typeof patch === 'object' && !Array.isArray(patch) ? patch as Partial<AppSettings> : {};
    const candidate = {
      ...settings, ...safePatch,
      hotkeys: safePatch.hotkeys ? { ...settings.hotkeys, ...safePatch.hotkeys } : settings.hotkeys,
      overlayTypography: safePatch.overlayTypography ? { ...settings.overlayTypography, ...safePatch.overlayTypography } : settings.overlayTypography,
      overlayPosition: safePatch.overlayPosition ? { ...settings.overlayPosition, ...safePatch.overlayPosition } : settings.overlayPosition,
    };
    settings = normalizeSettingsDocument(candidate, DEFAULT_SETTINGS);
    await saveSettings();
    if (overlayWindow) { overlayWindow.setOpacity(settings.reducedTransparency ? 1 : settings.overlayOpacity); overlayWindow.setResizable(!settings.overlayPosition.locked); applyOverlayInteraction(); placeOverlay(); await saveSettings(); }
    registerHotkeys();
    if (safePatch.logPath !== undefined) await startLogWatcher();
    if (safePatch.autoDownloadAppUpdates && appUpdate.status === 'available') void appUpdater?.download();
    if (safePatch.passiveTreeHudEnabled !== undefined || safePatch.passiveTreeHudPathPreview !== undefined) {
      if (!settings.passiveTreeHudEnabled) passiveTreeHudWindow?.hide();
      passiveTreeHudService?.poke();
    }
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
    const targetWindow = overlayWindow;
    if (!targetWindow || targetWindow.isDestroyed() || !Number.isFinite(height)) return;
    try {
      markProgrammaticOverlayMove();
      settings.overlayPosition = resizeOverlayToContent(targetWindow, height, settings);
      if (!visualSmokeArgument && !overlaySoakArgument) await saveSettings();
    } catch (error) {
      if (targetWindow.isDestroyed()) return;
      throw error;
    }
  });
  ipcMain.handle('overlay:reset-position', async () => { if (!overlayWindow) return runtimeState(); settings.overlayPosition = { preset: 'top-right', locked: false, snapToEdges: true }; placeOverlay(); await saveSettings(); broadcastState(); return runtimeState(); });
  ipcMain.handle('overlay:demo', (_event, value: unknown) => { overlayDemo = sanitizeDemo(value); overlayWindow?.showInactive(); broadcastState(); return overlayState(); });
  ipcMain.handle('overlay:demo-stop', () => { overlayDemo = null; broadcastState(); return runtimeState(); });
  ipcMain.handle('simulation:run', () => runCampaignSimulationSuite(dataset));
  ipcMain.handle('simulation:export', async () => {
    const scenarios = runCampaignSimulationSuite(dataset);
    const options: Electron.SaveDialogOptions = {
      title: 'Export ExileQuesting campaign simulation',
      defaultPath: `ExileQuesting-campaign-simulation-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
      filters: [{ name: 'ExileQuesting simulation', extensions: ['json'] }],
    };
    const owner = labWindow && !labWindow.isDestroyed() ? labWindow : mainWindow;
    const result = owner ? await dialog.showSaveDialog(owner, options) : await dialog.showSaveDialog(options);
    if (result.canceled || !result.filePath) return false;
    await fs.writeFile(result.filePath, JSON.stringify({ schemaVersion: 1, generatedAt: new Date().toISOString(), appVersion: app.getVersion(), campaign: dataset.source, scenarios }, null, 2), 'utf8');
    return true;
  });
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
  ipcMain.handle('diagnostics:replay-export', async () => exportReplayBundle());
  ipcMain.handle('loot:select-base', async () => {
    const options: Electron.OpenDialogOptions = { title: 'Choose your base Path of Exile loot filter', properties: ['openFile'], filters: [{ name: 'Path of Exile filter', extensions: ['filter'] }] };
    const selected = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (selected.canceled || !selected.filePaths[0]) return buildWorkspaceSnapshot();
    lootFilter = { ...unconfiguredLootFilterState(), basePath: selected.filePaths[0], message: 'Base filter selected. Generating build-aware wrapper…' };
    await refreshBuildLootFilter();
    broadcastState();
    return buildWorkspaceSnapshot();
  });
  ipcMain.handle('loot:regenerate', async () => { await refreshBuildLootFilter(); broadcastState(); return buildWorkspaceSnapshot(); });
  ipcMain.handle('loot:reloaded', async () => {
    lootFilter = { ...lootFilter, needsReload: false, message: 'Build-aware loot filter is current and marked as reloaded in Path of Exile.' };
    await saveLootFilterState();
    broadcastState();
    return buildWorkspaceSnapshot();
  });
  ipcMain.handle('build:passive-step', async (_event, profileId: unknown, delta: unknown) => {
    if (typeof profileId !== 'string' || profileId.length > 256) return buildWorkspaceSnapshot();
    const direction = Math.sign(Number(delta));
    if (!Number.isFinite(direction) || direction === 0) return buildWorkspaceSnapshot();
    buildPlannerState = stepBuildPassiveCursor(buildPlannerState, buildProfiles, profileId, direction);
    rebuildBuildGuidance();
    await store.saveBuildPlanner(buildPlannerState, buildProfiles);
    broadcastState();
    return buildWorkspaceSnapshot();
  });
  ipcMain.handle('pob:list', () => buildProfiles);
  ipcMain.handle('pob:workspace', () => buildWorkspaceSnapshot());
  ipcMain.handle('pob:import', async (_event, input: unknown) => {
    if (typeof input !== 'string') throw new Error('Build input must be text.');
    return importBuildProfileInput(input);
  });
  ipcMain.handle('pob:select-xml', async () => {
    const options: Electron.OpenDialogOptions = { title: 'Open Path of Building XML', properties: ['openFile'], filters: [{ name: 'Path of Building XML', extensions: ['xml'] }] };
    const selected = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);
    if (selected.canceled || !selected.filePaths[0]) return buildWorkspaceSnapshot();
    const selectedPath = selected.filePaths[0];
    const stat = await fs.stat(selectedPath);
    if (!stat.isFile()) throw new Error('Selected PoB XML path is not a file.');
    if (stat.size > MAX_POB_XML_BYTES) throw new Error('Selected PoB XML exceeds the safety size limit.');
    const xml = await fs.readFile(selectedPath, 'utf8');
    await importBuildProfileInput(xml, selectedPath);
    return buildWorkspaceSnapshot();
  });
  ipcMain.handle('gear:analyze', (_event, input: unknown) => {
    if (typeof input !== 'string') throw new Error('Gear Coach item input must be text.');
    return analyzeActiveGear(input);
  });
  ipcMain.handle('gear:analyze-clipboard', () => {
    const input = clipboard.readText();
    if (!input.trim()) throw new Error('Clipboard is empty. Hover an item in Path of Exile and press Ctrl+C first.');
    return analyzeActiveGear(input);
  });
  ipcMain.handle('pob:activate-profile', async (_event, id: unknown) => {
    if (typeof id !== 'string' || id.length > 256) return buildWorkspaceSnapshot();
    buildPlannerState = activateBuildProfile(buildPlannerState, buildProfiles, id);
    rebuildBuildGuidance();
    await store.saveBuildPlanner(buildPlannerState, buildProfiles);
    await refreshBuildLootFilter();
    broadcastState();
    return buildWorkspaceSnapshot();
  });
  ipcMain.handle('pob:activate-stage', async (_event, profileId: unknown, stageId: unknown) => {
    if (typeof profileId !== 'string' || typeof stageId !== 'string' || profileId.length > 256 || stageId.length > 256) return buildWorkspaceSnapshot();
    buildPlannerState = activateBuildStage(buildPlannerState, buildProfiles, profileId, stageId);
    rebuildBuildGuidance();
    await store.saveBuildPlanner(buildPlannerState, buildProfiles);
    await refreshBuildLootFilter();
    broadcastState();
    return buildWorkspaceSnapshot();
  });
  ipcMain.handle('pob:delete', async (_event, id: unknown) => {
    if (typeof id !== 'string' || id.length > 256) return buildProfiles;
    buildProfiles = buildProfiles.filter((profile) => profile.id !== id);
    buildPlannerState = normalizeBuildPlannerState(buildPlannerState, buildProfiles);
    rebuildBuildGuidance();
    await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);
    await refreshBuildLootFilter();
    broadcastState();
    return buildProfiles;
  });
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
  const longIndex = Math.max(0, dataset.steps.reduce((best, step, index, steps) => step.title.length > steps[best].title.length ? index : best, 0));
  const compactTypography: AppSettings['overlayTypography'] = { ...DEFAULT_SETTINGS.overlayTypography, preset: 'compact', objective: 18, actions: 13, guidance: 11, labels: 9, status: 9, density: 'compact' };
  const scenarios: Array<{ name: string; progress: number; mode: OverlayMode; typography: AppSettings['overlayTypography'] }> = [
    { name: 'focus-default-start', progress: 0, mode: 'focus', typography: DEFAULT_SETTINGS.overlayTypography },
    { name: 'focus-compact-long-objective', progress: longIndex, mode: 'focus', typography: compactTypography },
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
    const layout = await overlayWindow.webContents.executeJavaScript("(() => { const shell=document.querySelector('.overlay-shell'); if(!shell) return {missing:true}; const root=document.documentElement; const body=document.body; return {missing:false, innerWidth:window.innerWidth, shellClientWidth:shell.clientWidth, shellScrollWidth:shell.scrollWidth, rootScrollWidth:root.scrollWidth, bodyScrollWidth:body.scrollWidth}; })()", true) as { missing: boolean; innerWidth?: number; shellClientWidth?: number; shellScrollWidth?: number; rootScrollWidth?: number; bodyScrollWidth?: number };
    if (layout.missing) throw new Error(`Visual scenario ${scenario.name} did not render .overlay-shell.`);
    const innerWidth = Number(layout.innerWidth ?? 0);
    if (Number(layout.shellScrollWidth ?? 0) > Number(layout.shellClientWidth ?? 0) + 3 || Number(layout.rootScrollWidth ?? 0) > innerWidth + 3 || Number(layout.bodyScrollWidth ?? 0) > innerWidth + 3) throw new Error(`Visual scenario ${scenario.name} has horizontal overflow.`);
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

async function runOverlaySoak(outputArgument: string): Promise<void> {
  if (!overlayWindow) throw new Error('Overlay window is unavailable for soak testing.');
  const output = path.resolve(outputArgument.split('=').slice(1).join('=') || 'artifacts/soak');
  await waitForRenderer(overlayWindow);
  overlayDemo = { progress: Math.min(40, dataset.steps.length - 1), mode: 'focus' };
  broadcastState();
  const report = await runOverlayWindowSoak(overlayWindow, output, 220);
  log.info('Overlay soak completed: ' + report.iterations + ' iterations, ' + report.successfulRendererProbes + ' renderer probes.');
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
    await loadBuildGameData();
    rebuildBuildGuidance();
    await refreshBuildLootFilter();
    if (isSmokeTest) {
      if (gemData.status !== 'ready') throw new Error(`Packaged gem data failed startup smoke: ${gemData.message}`);
      if (passiveData.status !== 'ready') throw new Error(`Packaged passive tree data failed startup smoke: ${passiveData.message}`);
      log.info(`Packaged startup smoke test passed with ${dataset.steps.length} campaign steps, PoE ${gemData.snapshot?.gameVersion} gem data and ${passiveData.snapshot?.nodes.length} passive nodes.`);
      app.exit(0); return;
    }

    sessionGuard = new SessionGuard(app.getPath('userData'));
    recovery = sessionGuard.begin(app.getVersion(), progress);
    initializeAppUpdater();
    registerIpc();

    if (isLabSmokeTest) {
      overlayWindow = createOverlayWindow();
      labWindow = createPreplaytestLab(path.join(__dirname, 'preload.cjs'), false);
      wireWindowDiagnostics(labWindow, 'Pre-playtest Lab smoke');
      await loadRenderer(labWindow, 'lab');
      await waitForRenderer(labWindow);
      const smoke = await labWindow.webContents.executeJavaScript(`(async () => {
        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const deadline = Date.now() + 6000;
        while (!document.querySelector('[data-testid="lab-ready"]') && Date.now() < deadline) await wait(100);
        const ready = Boolean(document.querySelector('[data-testid="lab-ready"]'));
        const api = window.exileQuesting;
        const preview = document.querySelector('[data-testid="lab-preview"]');
        const walk = document.querySelector('[data-testid="lab-autowalk"]');
        const slider = document.querySelector('input[type="range"]');
        if (!ready || !api || !preview || !walk || !slider) return { ready, bridge: Boolean(api), controls: false };
        preview.click();
        await wait(350);
        const before = Number(slider.value);
        walk.click();
        await wait(2100);
        const after = Number(slider.value);
        walk.click();
        const scenarios = await api.runCampaignSimulation();
        return { ready, bridge: true, controls: true, before, after, scenarioCount: scenarios.length, allPassed: scenarios.every((item) => item.report.passed) };
      })()`, true) as { ready: boolean; bridge: boolean; controls?: boolean; before?: number; after?: number; scenarioCount?: number; allPassed?: boolean };
      if (!smoke.ready || !smoke.bridge || !smoke.controls || Number(smoke.after) <= Number(smoke.before) || smoke.scenarioCount !== 6 || !smoke.allPassed || !overlayWindow.isVisible()) {
        throw new Error(`Pre-playtest Lab smoke failed: ${JSON.stringify(smoke)}`);
      }
      log.info('Pre-playtest Lab smoke passed.', smoke);
      app.exit(0);
      return;
    }

    if (visualSmokeArgument || overlaySoakArgument) {
      overlayWindow = createOverlayWindow();
      if (visualSmokeArgument) await runVisualSmoke(visualSmokeArgument);
      else if (overlaySoakArgument) await runOverlaySoak(overlaySoakArgument);
      app.exit(0);
      return;
    }

    mainWindow = createMainWindow();
    overlayWindow = createOverlayWindow();
    passiveTreeHudWindow = createPassiveTreeHudWindow();
    initializePassiveTreeHud();
    createTray();
    registerHotkeys();
    await startLogWatcher();
    campaignUpdateTimer = setInterval(() => void checkCampaignUpdates(), CAMPAIGN_CHECK_INTERVAL_MS);
    setTimeout(() => void checkCampaignUpdates(), 4_000);
    if (settings.autoCheckAppUpdates) { appUpdateTimer = setInterval(() => void appUpdater?.check(), APP_UPDATE_CHECK_INTERVAL_MS); setTimeout(() => void appUpdater?.check(), 8_000); }
  }).catch((error) => {
    log.error('Fatal startup failure.', error);
    if (isSmokeTest || isLabSmokeTest || visualSmokeArgument || overlaySoakArgument) { app.exit(1); return; }
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
  passiveTreeHudService?.stop();
  void logWatcher?.stop();
  globalShortcut.unregisterAll();
});
