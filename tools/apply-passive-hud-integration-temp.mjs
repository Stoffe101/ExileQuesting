import { promises as fs } from 'node:fs';

async function patch(path, replacements) {
  let text = await fs.readFile(path, 'utf8');
  for (const [before, after, label] of replacements) {
    const count = text.split(before).length - 1;
    if (count !== 1) throw new Error(`${path}: expected exactly one ${label}, found ${count}`);
    text = text.replace(before, after);
  }
  await fs.writeFile(path, text, 'utf8');
}

await patch('src/core/persistence.ts', [[
`    overlayAutoCollapseSeconds: finite(source.overlayAutoCollapseSeconds, defaults.overlayAutoCollapseSeconds, 1, 30),
    reducedMotion: boolean(source.reducedMotion, defaults.reducedMotion),`,
`    overlayAutoCollapseSeconds: finite(source.overlayAutoCollapseSeconds, defaults.overlayAutoCollapseSeconds, 1, 30),
    passiveTreeHudEnabled: boolean(source.passiveTreeHudEnabled, defaults.passiveTreeHudEnabled),
    passiveTreeHudPathPreview: boolean(source.passiveTreeHudPathPreview, defaults.passiveTreeHudPathPreview),
    reducedMotion: boolean(source.reducedMotion, defaults.reducedMotion),`,
'passive HUD settings normalization',
]]);

await patch('src/core/maxroll.ts', [[
`  const map: Record<string, string> = {
    dex: 'Ranger', str: 'Marauder', int: 'Witch', dexint: 'Shadow', intdex: 'Shadow',
    strdex: 'Duelist', dexstr: 'Duelist', strint: 'Templar', intstr: 'Templar', scion: 'Scion',
  };`,
`  const map: Record<string, string> = {
    dex: 'Ranger', ranger: 'Ranger', deadeye: 'Ranger', pathfinder: 'Ranger', warden: 'Ranger', raider: 'Ranger',
    str: 'Marauder', marauder: 'Marauder', juggernaut: 'Marauder', berserker: 'Marauder', chieftain: 'Marauder',
    int: 'Witch', witch: 'Witch', necromancer: 'Witch', elementalist: 'Witch', occultist: 'Witch',
    dexint: 'Shadow', intdex: 'Shadow', shadow: 'Shadow', assassin: 'Shadow', saboteur: 'Shadow', trickster: 'Shadow',
    strdex: 'Duelist', dexstr: 'Duelist', duelist: 'Duelist', slayer: 'Duelist', gladiator: 'Duelist', champion: 'Duelist',
    strint: 'Templar', intstr: 'Templar', templar: 'Templar', inquisitor: 'Templar', hierophant: 'Templar', guardian: 'Templar',
    scion: 'Scion', ascendant: 'Scion',
  };`,
'Maxroll all-class map',
]]);

await patch('src/ui/App.tsx', [
[
`import PreplaytestLab from './PreplaytestLab';`,
`import PreplaytestLab from './PreplaytestLab';
import PassiveTreeHudOverlay from './PassiveTreeHudOverlay';`,
'Passive HUD renderer import',
],
[
`        <section className="panel settings-section wide-section">
          <div className="section-title"><h2>Overlay typography</h2><span>Readable from a glance</span></div>`,
`        <section className="panel settings-section wide-section">
          <div className="section-title"><h2>Passive Tree HUD</h2><span>All seven classes · build-aware</span></div>
          <p className="setting-note">When Path of Exile's passive tree is visible, ExileQuesting registers the live tree geometry and draws guidance over the real nodes. Maxroll ordered planners show one exact next passive. PoB stages highlight newly-added nodes without inventing a click order.</p>
          <SettingRow title="Enable Passive Tree HUD" description="Read-only, click-through visual guidance. It never allocates or refunds a passive for you."><Toggle checked={state.settings.passiveTreeHudEnabled} onChange={(passiveTreeHudEnabled) => update({ passiveTreeHudEnabled })} /></SettingRow>
          <SettingRow title="Show nearby path preview" description="Show recent/upcoming Maxroll path nodes around the exact target. PoB stage highlights are still shown when applicable."><Toggle checked={state.settings.passiveTreeHudPathPreview} onChange={(passiveTreeHudPathPreview) => update({ passiveTreeHudPathPreview })} /></SettingRow>
          <div className="diagnostic-summary">
            <div><span>Status</span><strong>{state.passiveTreeHud.status}</strong><small>{state.passiveTreeHud.mode ?? 'waiting'}</small></div>
            <div><span>Class</span><strong>{state.passiveTreeHud.className ?? 'From active build'}</strong><small>{state.passiveTreeHud.classStartNodeId ? `start ${state.passiveTreeHud.classStartNodeId}` : 'data-driven start'}</small></div>
            <div><span>Alignment</span><strong>{state.passiveTreeHud.confidence === undefined ? 'Not locked' : `${Math.round(state.passiveTreeHud.confidence * 100)}%`}</strong><small>{state.passiveTreeHud.inliers ? `${state.passiveTreeHud.inliers} anchors` : 'fail-closed'}</small></div>
          </div>
          <p className="source-message">{state.passiveTreeHud.message}</p>
        </section>

        <section className="panel settings-section wide-section">
          <div className="section-title"><h2>Overlay typography</h2><span>Readable from a glance</span></div>`,
'Passive HUD settings section',
],
[
`        <DetectionTracePanel state={state} />`,
`        <section className="panel diagnostic-card"><div className="section-title"><h2>Passive Tree HUD</h2><span>{state.passiveTreeHud.status}</span></div><dl className="diagnostic-list"><dt>Enabled</dt><dd>{state.settings.passiveTreeHudEnabled ? 'Yes' : 'No'}</dd><dt>Mode</dt><dd>{state.passiveTreeHud.mode ?? 'None'}</dd><dt>Build source</dt><dd>{state.passiveTreeHud.sourceLabel ?? 'No active passive guide'}</dd><dt>Class</dt><dd>{state.passiveTreeHud.className ?? 'Unknown'}</dd><dt>Class start</dt><dd>{state.passiveTreeHud.classStartNodeId ?? 'Not resolved'}</dd><dt>Display</dt><dd>{state.passiveTreeHud.displayId ?? 'Not locked'}</dd><dt>Confidence</dt><dd>{state.passiveTreeHud.confidence === undefined ? 'Not locked' : `${Math.round(state.passiveTreeHud.confidence * 100)}%`}</dd><dt>Inliers / RMS</dt><dd>{state.passiveTreeHud.inliers ?? 0} / {state.passiveTreeHud.rms?.toFixed(2) ?? '?'}</dd><dt>Target</dt><dd>{state.passiveTreeHud.target?.name ?? (state.passiveTreeHud.mode === 'stage' ? `${state.passiveTreeHud.path.filter((point) => point.state === 'stage').length} stage nodes` : 'None')}</dd></dl><p className="source-message">{state.passiveTreeHud.message}</p></section>
        <DetectionTracePanel state={state} />`,
'Passive HUD diagnostics card',
],
[
`  if (mode === 'overlay') return <Overlay state={state} />;
  if (mode === 'lab') return <PreplaytestLab state={state} setState={setState} />;`,
`  if (mode === 'passive-tree-hud') return <PassiveTreeHudOverlay state={state} />;
  if (mode === 'overlay') return <Overlay state={state} />;
  if (mode === 'lab') return <PreplaytestLab state={state} setState={setState} />;`,
'Passive HUD renderer mode',
],
]);

await patch('electron/main.ts', [
[
`import { unconfiguredLootFilterState, writeBuildAwareLootFilter } from './services/loot-filter-service';`,
`import { unconfiguredLootFilterState, writeBuildAwareLootFilter } from './services/loot-filter-service';
import { PassiveTreeHudService, type PassiveTreeHudContext } from './services/passive-tree-hud';
import { buildPassiveTreeGuidePlan } from '../src/core/passive-tree-guide';
import { passiveTreeHudIdle, type PassiveTreeHudState } from '../src/core/passive-tree-hud-state';`,
'Passive HUD runtime imports',
],
[
`  overlayAutoCollapse: true, overlayAutoCollapseSeconds: 5, reducedMotion: false, reducedTransparency: false,`,
`  overlayAutoCollapse: true, overlayAutoCollapseSeconds: 5, passiveTreeHudEnabled: true, passiveTreeHudPathPreview: true, reducedMotion: false, reducedTransparency: false,`,
'Passive HUD defaults',
],
[
`let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let labWindow: BrowserWindow | null = null;`,
`let mainWindow: BrowserWindow | null = null;
let overlayWindow: BrowserWindow | null = null;
let passiveTreeHudWindow: BrowserWindow | null = null;
let labWindow: BrowserWindow | null = null;`,
'Passive HUD window global',
],
[
`let appUpdater: AppUpdater | null = null;
let overlayDemo: OverlayDemoConfig | null = null;`,
`let appUpdater: AppUpdater | null = null;
let passiveTreeHudService: PassiveTreeHudService | null = null;
let passiveTreeHudState: PassiveTreeHudState = passiveTreeHudIdle(true);
let overlayDemo: OverlayDemoConfig | null = null;`,
'Passive HUD service globals',
],
[
`async function loadBuildGameData(): Promise<void> {
  const options = { packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() };
  const [gems, passives] = await Promise.all([
    loadGemAcquisitionSnapshot(bundledGemDataPath(options), { info: (...args) => log.info(...args), warn: (...args) => log.warn(...args) }),
    loadPassiveTreeSnapshot(bundledPassiveDataPath(options), { info: (...args) => log.info(...args), warn: (...args) => log.warn(...args) }),
  ]);
  gemData = gems;
  passiveData = passives;
}

function rebuildBuildGuidance(): void {`,
`async function loadBuildGameData(): Promise<void> {
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
  return {
    enabled: settings.passiveTreeHudEnabled,
    pathPreview: settings.passiveTreeHudPathPreview,
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

function rebuildBuildGuidance(): void {`,
'Passive HUD runtime context',
],
[
`  activeBuildCoach = activeProfile && activeGemPlan && gemData.snapshot
    ? buildCoachSnapshot(activeProfile, activeStageId, activeGemPlan, gemData.snapshot, passiveData.snapshot, passiveCursor, characterLevel)
    : undefined;
}`,
`  activeBuildCoach = activeProfile && activeGemPlan && gemData.snapshot
    ? buildCoachSnapshot(activeProfile, activeStageId, activeGemPlan, gemData.snapshot, passiveData.snapshot, passiveCursor, characterLevel)
    : undefined;
  passiveTreeHudService?.poke();
}`,
'Passive HUD rebuild poke',
],
[
`    logDiagnostics, detectionTrace, runStats: runStatsFor(runSession, runHistory), appUpdate, recovery, buildCoach: activeBuildCoach, lootFilter, appVersion: app.getVersion(), diagnosticsPath: log.transports.file.getFile().path,`,
`    logDiagnostics, detectionTrace, runStats: runStatsFor(runSession, runHistory), appUpdate, recovery, buildCoach: activeBuildCoach, lootFilter, passiveTreeHud: passiveTreeHudState, appVersion: app.getVersion(), diagnosticsPath: log.transports.file.getFile().path,`,
'Passive HUD runtime state',
],
[
`  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('state:changed', real);
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('state:changed', overlayState(real));`,
`  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('state:changed', real);
  if (overlayWindow && !overlayWindow.isDestroyed()) overlayWindow.webContents.send('state:changed', overlayState(real));
  if (passiveTreeHudWindow && !passiveTreeHudWindow.isDestroyed()) passiveTreeHudWindow.webContents.send('state:changed', real);`,
'Passive HUD state broadcast',
],
[
`async function loadRenderer(window: BrowserWindow, mode: 'manager' | 'overlay' | 'lab'): Promise<void> {`,
`async function loadRenderer(window: BrowserWindow, mode: 'manager' | 'overlay' | 'lab' | 'passive-tree-hud'): Promise<void> {`,
'Passive HUD renderer mode type',
],
[
`function toggleOverlay(): void { if (!overlayWindow) return; if (overlayWindow.isVisible()) overlayWindow.hide(); else overlayWindow.showInactive(); }`,
`function createPassiveTreeHudWindow(): BrowserWindow {
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
function toggleOverlay(): void { if (!overlayWindow) return; if (overlayWindow.isVisible()) overlayWindow.hide(); else overlayWindow.showInactive(); }`,
'Passive HUD browser window',
],
[
`    if (safePatch.autoDownloadAppUpdates && appUpdate.status === 'available') void appUpdater?.download();
    broadcastState(); return runtimeState();`,
`    if (safePatch.autoDownloadAppUpdates && appUpdate.status === 'available') void appUpdater?.download();
    if (safePatch.passiveTreeHudEnabled !== undefined || safePatch.passiveTreeHudPathPreview !== undefined) {
      if (!settings.passiveTreeHudEnabled) passiveTreeHudWindow?.hide();
      passiveTreeHudService?.poke();
    }
    broadcastState(); return runtimeState();`,
'Passive HUD settings reaction',
],
[
`    mainWindow = createMainWindow();
    overlayWindow = createOverlayWindow();
    createTray();`,
`    mainWindow = createMainWindow();
    overlayWindow = createOverlayWindow();
    passiveTreeHudWindow = createPassiveTreeHudWindow();
    initializePassiveTreeHud();
    createTray();`,
'Passive HUD normal startup',
],
[
`  sessionGuard?.clean();
  void logWatcher?.stop();
  globalShortcut.unregisterAll();`,
`  sessionGuard?.clean();
  passiveTreeHudService?.stop();
  void logWatcher?.stop();
  globalShortcut.unregisterAll();`,
'Passive HUD shutdown',
],
]);

console.log('Applied Passive Tree HUD integration patches.');
