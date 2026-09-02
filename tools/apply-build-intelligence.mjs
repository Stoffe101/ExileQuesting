import { promises as fs } from 'node:fs';

async function read(path) { return fs.readFile(path, 'utf8'); }
async function write(path, content) { await fs.writeFile(path, content, 'utf8'); }
function replaceOnce(content, needle, replacement, label) {
  const first = content.indexOf(needle);
  if (first < 0) throw new Error(`Missing integration anchor: ${label}`);
  if (content.indexOf(needle, first + needle.length) >= 0) throw new Error(`Integration anchor is not unique: ${label}`);
  return content.slice(0, first) + replacement + content.slice(first + needle.length);
}

async function patchTypes() {
  const path = 'src/core/types.ts';
  let content = await read(path);
  if (!content.includes("import type { BuildCoachSnapshot } from './build-coach';")) {
    content = "import type { BuildCoachSnapshot } from './build-coach';\nimport type { LootFilterStatus } from './loot-filter';\n\n" + content;
  }
  content = replaceOnce(content,
    '  appUpdate: AppUpdateState;\n  recovery: RecoveryState;\n  appVersion: string;',
    '  appUpdate: AppUpdateState;\n  recovery: RecoveryState;\n  buildCoach?: BuildCoachSnapshot;\n  lootFilter: LootFilterStatus;\n  appVersion: string;',
    'RuntimeState build intelligence');
  await write(path, content);
}

async function patchPreload() {
  const path = 'electron/preload.ts';
  let content = await read(path);
  content = replaceOnce(content,
    "import type { CampaignSimulationReport } from '../src/core/simulator';\nimport type { AppSettings, OverlayMode, RuntimeState } from '../src/core/types';",
    "import type { CampaignSimulationReport } from '../src/core/simulator';\nimport type { BuildCoachSnapshot } from '../src/core/build-coach';\nimport type { LootFilterStatus } from '../src/core/loot-filter';\nimport type { AppSettings, OverlayMode, RuntimeState } from '../src/core/types';",
    'preload type imports');
  content = replaceOnce(content,
    "export interface BuildWorkspaceResult {\n  planner: BuildPlannerSnapshot;\n  gemData: { status: 'ready' | 'missing' | 'invalid'; message: string; gameVersion?: string; sourceCommit?: string };\n  plan?: GemAcquisitionPlan;\n  campaign: { resolved: number; unresolved: number; actionSteps: number };\n}",
    "export interface BuildWorkspaceResult {\n  planner: BuildPlannerSnapshot;\n  gemData: { status: 'ready' | 'missing' | 'invalid'; message: string; gameVersion?: string; sourceCommit?: string };\n  passiveData: { status: 'ready' | 'missing' | 'invalid'; message: string; gameVersion?: string; sha256?: string };\n  plan?: GemAcquisitionPlan;\n  coach?: BuildCoachSnapshot;\n  lootFilter: LootFilterStatus;\n  campaign: { resolved: number; unresolved: number; actionSteps: number };\n}",
    'BuildWorkspaceResult');
  content = replaceOnce(content,
    "  deleteBuildProfile: (id: string): Promise<BuildProfile[]> => ipcRenderer.invoke('pob:delete', id),\n  onState:",
    "  deleteBuildProfile: (id: string): Promise<BuildProfile[]> => ipcRenderer.invoke('pob:delete', id),\n  selectLootFilterBase: (): Promise<BuildWorkspaceResult> => ipcRenderer.invoke('loot:select-base'),\n  regenerateLootFilter: (): Promise<BuildWorkspaceResult> => ipcRenderer.invoke('loot:regenerate'),\n  markLootFilterReloaded: (): Promise<BuildWorkspaceResult> => ipcRenderer.invoke('loot:reloaded'),\n  onState:",
    'loot filter preload API');
  await write(path, content);
}

async function patchApp() {
  const path = 'src/ui/App.tsx';
  let content = await read(path);
  content = replaceOnce(content,
    "import BuildWorkspace from './BuildWorkspace';",
    "import BuildWorkspace from './BuildWorkspace';\nimport BuildOverlayBlock from './BuildOverlayBlock';",
    'BuildOverlayBlock import');
  content = replaceOnce(content,
    '  const actions = summarizeActions(step.actions);\n  const nextActions = nextStep ? summarizeActions(nextStep.actions) : undefined;',
    "  const actions = summarizeActions(step.actions.filter((action) => action.type !== 'build'));\n  const nextActions = nextStep ? summarizeActions(nextStep.actions.filter((action) => action.type !== 'build')) : undefined;",
    'overlay build action split');
  content = replaceOnce(content,
    '        <div className="now-block">\n          <span className="section-kicker">NOW</span>\n          <h1>{actions.now?.title ?? step.title}</h1>\n        </div>\n\n        {state.settings.overlayMode === \'compact\' ? (',
    '        <div className="now-block">\n          <span className="section-kicker">NOW</span>\n          <h1>{actions.now?.title ?? step.title}</h1>\n        </div>\n\n        <BuildOverlayBlock state={state} step={step} />\n\n        {state.settings.overlayMode === \'compact\' ? (',
    'overlay BUILD block');
  await write(path, content);
}

async function patchBuildWorkspace() {
  const path = 'src/ui/BuildWorkspace.tsx';
  let content = await read(path);
  content = replaceOnce(content,
    "import { useEffect, useState } from 'react';",
    "import { useEffect, useState } from 'react';\nimport BuildIntelligencePanel from './BuildIntelligencePanel';",
    'BuildIntelligencePanel import');
  content = replaceOnce(content,
    '        </section>\n      </div>\n    </div>\n  );\n}',
    '        </section>\n      </div>\n\n      {workspace && <BuildIntelligencePanel workspace={workspace} onWorkspace={setWorkspace} />}\n    </div>\n  );\n}',
    'Build intelligence manager panel');
  await write(path, content);
}

async function patchStyles() {
  const path = 'src/ui/styles.css';
  let content = await read(path);
  if (content.includes('/* Build-aware campaign intelligence */')) return;
  content += `\n\n/* Build-aware campaign intelligence */\n.build-overlay { margin: 10px 0 12px; padding: 11px 12px; border: 1px solid #4c3b25; border-radius: 9px; background: linear-gradient(135deg, rgba(239,169,78,.11), rgba(17,20,28,.86)); }\n.build-overlay.compact { display: flex; align-items: center; gap: 9px; margin: 7px 0; padding: 8px 10px; }\n.build-overlay.compact span { color: var(--accent); font-size: var(--font-labels); font-weight: 900; letter-spacing: 1px; }\n.build-overlay.compact strong { min-width: 0; overflow: hidden; font-size: var(--font-actions); text-overflow: ellipsis; white-space: nowrap; }\n.build-overlay-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 8px; }\n.build-overlay-heading small { color: var(--muted); font-size: var(--font-labels); text-transform: capitalize; }\n.build-overlay-action { display: grid; grid-template-columns: 20px minmax(0,1fr); gap: 7px; align-items: center; padding: 5px 0; font-size: var(--font-actions); }\n.build-overlay-action i { color: var(--accent); font-style: normal; }\n.build-overlay-passive { display: flex; flex-direction: column; gap: 3px; margin-top: 7px; padding-top: 8px; border-top: 1px solid rgba(239,169,78,.16); }\n.build-overlay-passive span { color: var(--muted); font-size: var(--font-labels); text-transform: uppercase; letter-spacing: .7px; }\n.build-overlay-passive strong { font-size: var(--font-guidance); line-height: 1.35; }\n.build-overlay-task { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; padding: 5px 0; border-top: 1px solid rgba(255,255,255,.04); font-size: var(--font-guidance); }\n.build-overlay-task small { color: var(--muted); font-size: var(--font-labels); text-align: right; }\n.build-intelligence-panel { margin-top: 13px; padding: 20px; }\n.build-intelligence-grid { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); gap: 9px; margin-top: 13px; }\n.build-intelligence-card { display: flex; flex-direction: column; gap: 6px; min-height: 116px; padding: 13px; border: 1px solid var(--line-soft); border-radius: 9px; background: #0f1219; }\n.build-intelligence-card > span, .loot-filter-status > div:first-child > span { color: var(--accent); font-size: 8px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; }\n.build-intelligence-card > strong { font-size: 13px; line-height: 1.35; }\n.build-intelligence-card > small { color: var(--muted); font-size: 9px; line-height: 1.4; }\n.mini-chip-row { display: flex; flex-wrap: wrap; gap: 5px; margin-top: auto; }\n.mini-chip-row i { padding: 4px 6px; border: 1px solid #354052; border-radius: 5px; color: #b9c5d6; background: #171d27; font-size: 8px; font-style: normal; }\n.loot-filter-status { display: flex; align-items: center; justify-content: space-between; gap: 18px; margin-top: 12px; padding: 13px; border: 1px solid var(--line-soft); border-radius: 9px; background: #11151d; }\n.loot-filter-status > div:first-child { display: flex; flex-direction: column; gap: 4px; min-width: 0; }\n.loot-filter-status strong { font-size: 11px; }\n.loot-filter-status small { overflow: hidden; color: var(--muted); font-size: 8px; text-overflow: ellipsis; white-space: nowrap; }\n.loot-filter-status.reload { border-color: #66502f; background: rgba(239,169,78,.07); }\n.loot-filter-status.error { border-color: #653c37; background: rgba(250,132,111,.06); }\n.build-filter-note { margin: 10px 2px 0; color: var(--muted); font-size: 9px; line-height: 1.45; }\n@media (max-width: 1080px) { .build-intelligence-grid { grid-template-columns: 1fr; } }\n@media (max-width: 760px) { .loot-filter-status { align-items: stretch; flex-direction: column; } .loot-filter-status .setting-actions { flex-wrap: wrap; } }\n`;
  await write(path, content);
}

async function patchMain() {
  const path = 'electron/main.ts';
  let content = await read(path);
  content = replaceOnce(content,
    "import { bundledGemDataPath, loadGemAcquisitionSnapshot, type GameDataLoadResult } from './services/game-data';",
    "import { buildCoachSnapshot, type BuildCoachSnapshot } from '../src/core/build-coach';\nimport { buildCampaignIntelligence, campaignIntelligenceActionsForStep, type CampaignIntelligence } from '../src/core/campaign-intelligence';\nimport type { LootFilterStatus } from '../src/core/loot-filter';\nimport { bundledGemDataPath, bundledPassiveDataPath, loadGemAcquisitionSnapshot, loadPassiveTreeSnapshot, type GameDataLoadResult, type PassiveDataLoadResult } from './services/game-data';\nimport { unconfiguredLootFilterState, writeBuildAwareLootFilter } from './services/loot-filter-service';",
    'main build intelligence imports');
  content = replaceOnce(content,
    "let gemData: GameDataLoadResult = { path: '', status: 'missing', message: 'Bundled gem acquisition data has not been loaded yet.' };\nlet activeGemPlan: GemAcquisitionPlan | undefined;\nlet buildBridge: CampaignBuildBridge | undefined;",
    "let gemData: GameDataLoadResult = { path: '', status: 'missing', message: 'Bundled gem acquisition data has not been loaded yet.' };\nlet passiveData: PassiveDataLoadResult = { path: '', status: 'missing', message: 'Bundled passive tree data has not been loaded yet.' };\nlet activeGemPlan: GemAcquisitionPlan | undefined;\nlet activeBuildCoach: BuildCoachSnapshot | undefined;\nlet buildBridge: CampaignBuildBridge | undefined;\nlet campaignIntelligence: CampaignIntelligence = { actionsByStep: {} };\nlet lootFilter: LootFilterStatus = unconfiguredLootFilterState();",
    'main build intelligence globals');
  content = replaceOnce(content,
    "function userPath(name: string): string { return store.path(name); }",
    "function normalizeLootFilterStatus(value: unknown): LootFilterStatus {\n  const item = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};\n  const basePath = typeof item.basePath === 'string' && item.basePath.length <= 4096 ? item.basePath : undefined;\n  if (!basePath) return unconfiguredLootFilterState();\n  return {\n    basePath,\n    outputPath: typeof item.outputPath === 'string' && item.outputPath.length <= 4096 ? item.outputPath : undefined,\n    generatedAt: typeof item.generatedAt === 'string' ? item.generatedAt : undefined,\n    fingerprint: typeof item.fingerprint === 'string' && /^[a-f0-9]{64}$/i.test(item.fingerprint) ? item.fingerprint : undefined,\n    needsReload: item.needsReload === true,\n    status: item.status === 'error' ? 'error' : 'ready',\n    message: typeof item.message === 'string' && item.message.trim() ? item.message.slice(0, 500) : 'Build-aware loot filter configuration restored.',\n  };\n}\nfunction userPath(name: string): string { return store.path(name); }",
    'loot filter state normalizer');
  content = replaceOnce(content,
    "  buildProfiles = await store.loadBuildProfiles();\n  buildPlannerState = await store.loadBuildPlanner(buildProfiles);\n}",
    "  buildProfiles = await store.loadBuildProfiles();\n  buildPlannerState = await store.loadBuildPlanner(buildProfiles);\n  try { lootFilter = normalizeLootFilterStatus(await store.readUnknown('loot-filter.json')); }\n  catch { lootFilter = unconfiguredLootFilterState(); }\n}\nasync function saveLootFilterState(): Promise<void> { await store.write('loot-filter.json', lootFilter); }",
    'load persisted loot filter');
  content = replaceOnce(content,
    "async function loadBuildGameData(): Promise<void> {\n  const filePath = bundledGemDataPath({ packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() });\n  gemData = await loadGemAcquisitionSnapshot(filePath, {\n    info: (...args) => log.info(...args),\n    warn: (...args) => log.warn(...args),\n  });\n}\n\nfunction rebuildBuildGuidance(): void {\n  buildPlannerState = normalizeBuildPlannerState(buildPlannerState, buildProfiles);\n  const activeProfile = buildProfiles.find((profile) => profile.id === buildPlannerState.activeProfileId);\n  activeGemPlan = activeProfile && gemData.snapshot ? buildGemAcquisitionPlan(activeProfile, gemData.snapshot) : undefined;\n  buildBridge = activeGemPlan ? bridgeBuildPlanToCampaign(dataset, activeGemPlan) : undefined;\n}\n\nfunction buildAwareDataset(): CampaignDataset {\n  if (!buildBridge || !Object.keys(buildBridge.actionsByStep).length) return dataset;\n  return {\n    ...dataset,\n    steps: dataset.steps.map((step) => {\n      const buildActions = campaignBuildActionsForStep(buildBridge!, step.id);\n      return buildActions.length ? { ...step, actions: [...step.actions, ...buildActions] } : step;\n    }),\n  };\n}\n\nfunction buildWorkspaceSnapshot() {\n  return {\n    planner: buildPlannerSnapshot(buildProfiles, buildPlannerState),\n    gemData: {\n      status: gemData.status,\n      message: gemData.message,\n      gameVersion: gemData.snapshot?.gameVersion,\n      sourceCommit: gemData.snapshot?.source.commit,\n    },\n    plan: activeGemPlan,\n    campaign: {\n      resolved: buildBridge?.gemAvailability.filter((entry) => entry.confidence !== 'unresolved').length ?? 0,\n      unresolved: buildBridge?.unresolved.length ?? 0,\n      actionSteps: buildBridge ? Object.keys(buildBridge.actionsByStep).length : 0,\n    },\n  };\n}",
    "async function loadBuildGameData(): Promise<void> {\n  const options = { packaged: app.isPackaged, resourcesPath: process.resourcesPath, appPath: app.getAppPath() };\n  const [gems, passives] = await Promise.all([\n    loadGemAcquisitionSnapshot(bundledGemDataPath(options), { info: (...args) => log.info(...args), warn: (...args) => log.warn(...args) }),\n    loadPassiveTreeSnapshot(bundledPassiveDataPath(options), { info: (...args) => log.info(...args), warn: (...args) => log.warn(...args) }),\n  ]);\n  gemData = gems;\n  passiveData = passives;\n}\n\nfunction rebuildBuildGuidance(): void {\n  buildPlannerState = normalizeBuildPlannerState(buildPlannerState, buildProfiles);\n  campaignIntelligence = buildCampaignIntelligence(dataset);\n  const activeProfile = buildProfiles.find((profile) => profile.id === buildPlannerState.activeProfileId);\n  activeGemPlan = activeProfile && gemData.snapshot ? buildGemAcquisitionPlan(activeProfile, gemData.snapshot) : undefined;\n  buildBridge = activeGemPlan ? bridgeBuildPlanToCampaign(dataset, activeGemPlan) : undefined;\n  const activeStageId = activeProfile ? buildPlannerState.activeStageByProfile[activeProfile.id] : undefined;\n  activeBuildCoach = activeProfile && activeGemPlan && gemData.snapshot\n    ? buildCoachSnapshot(activeProfile, activeStageId, activeGemPlan, gemData.snapshot, passiveData.snapshot)\n    : undefined;\n}\n\nasync function refreshBuildLootFilter(): Promise<void> {\n  if (!lootFilter.basePath || !activeBuildCoach) return;\n  const pendingReload = lootFilter.needsReload;\n  const generated = await writeBuildAwareLootFilter(lootFilter.basePath, activeBuildCoach.loot, lootFilter.fingerprint);\n  lootFilter = { ...generated, needsReload: pendingReload || generated.needsReload };\n  await saveLootFilterState();\n}\n\nfunction buildAwareDataset(): CampaignDataset {\n  const hasBuildActions = Boolean(buildBridge && Object.keys(buildBridge.actionsByStep).length);\n  const hasCampaignIntelligence = Object.keys(campaignIntelligence.actionsByStep).length > 0;\n  if (!hasBuildActions && !hasCampaignIntelligence) return dataset;\n  return {\n    ...dataset,\n    steps: dataset.steps.map((step) => {\n      const extras = [\n        ...campaignIntelligenceActionsForStep(campaignIntelligence, step.id),\n        ...(buildBridge ? campaignBuildActionsForStep(buildBridge, step.id) : []),\n      ];\n      return extras.length ? { ...step, actions: [...step.actions, ...extras] } : step;\n    }),\n  };\n}\n\nfunction buildWorkspaceSnapshot() {\n  return {\n    planner: buildPlannerSnapshot(buildProfiles, buildPlannerState),\n    gemData: {\n      status: gemData.status,\n      message: gemData.message,\n      gameVersion: gemData.snapshot?.gameVersion,\n      sourceCommit: gemData.snapshot?.source.commit,\n    },\n    passiveData: {\n      status: passiveData.status,\n      message: passiveData.message,\n      gameVersion: passiveData.snapshot?.gameVersion,\n      sha256: passiveData.snapshot?.source.sha256,\n    },\n    plan: activeGemPlan,\n    coach: activeBuildCoach,\n    lootFilter,\n    campaign: {\n      resolved: buildBridge?.gemAvailability.filter((entry) => entry.confidence !== 'unresolved').length ?? 0,\n      unresolved: buildBridge?.unresolved.length ?? 0,\n      actionSteps: buildBridge ? Object.keys(buildBridge.actionsByStep).length : 0,\n    },\n  };\n}",
    'build game data and coach integration');
  content = replaceOnce(content,
    "    logDiagnostics, detectionTrace, runStats: runStatsFor(runSession, runHistory), appUpdate, recovery, appVersion: app.getVersion(), diagnosticsPath: log.transports.file.getFile().path,",
    "    logDiagnostics, detectionTrace, runStats: runStatsFor(runSession, runHistory), appUpdate, recovery, buildCoach: activeBuildCoach, lootFilter, appVersion: app.getVersion(), diagnosticsPath: log.transports.file.getFile().path,",
    'RuntimeState build coach');
  content = replaceOnce(content,
    "  ipcMain.handle('pob:list', () => buildProfiles);",
    "  ipcMain.handle('loot:select-base', async () => {\n    const options: Electron.OpenDialogOptions = { title: 'Choose your base Path of Exile loot filter', properties: ['openFile'], filters: [{ name: 'Path of Exile filter', extensions: ['filter'] }] };\n    const selected = mainWindow ? await dialog.showOpenDialog(mainWindow, options) : await dialog.showOpenDialog(options);\n    if (selected.canceled || !selected.filePaths[0]) return buildWorkspaceSnapshot();\n    lootFilter = { ...unconfiguredLootFilterState(), basePath: selected.filePaths[0], message: 'Base filter selected. Generating build-aware wrapper…' };\n    await refreshBuildLootFilter();\n    broadcastState();\n    return buildWorkspaceSnapshot();\n  });\n  ipcMain.handle('loot:regenerate', async () => { await refreshBuildLootFilter(); broadcastState(); return buildWorkspaceSnapshot(); });\n  ipcMain.handle('loot:reloaded', async () => {\n    lootFilter = { ...lootFilter, needsReload: false, message: 'Build-aware loot filter is current and marked as reloaded in Path of Exile.' };\n    await saveLootFilterState();\n    broadcastState();\n    return buildWorkspaceSnapshot();\n  });\n  ipcMain.handle('pob:list', () => buildProfiles);",
    'loot filter IPC');
  content = replaceOnce(content,
    "    rebuildBuildGuidance();\n    await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);\n    broadcastState();\n    return buildProfiles;",
    "    rebuildBuildGuidance();\n    await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);\n    await refreshBuildLootFilter();\n    broadcastState();\n    return buildProfiles;",
    'PoB import loot refresh');
  content = replaceOnce(content,
    "    rebuildBuildGuidance();\n    await store.saveBuildPlanner(buildPlannerState, buildProfiles);\n    broadcastState();\n    return buildWorkspaceSnapshot();",
    "    rebuildBuildGuidance();\n    await store.saveBuildPlanner(buildPlannerState, buildProfiles);\n    await refreshBuildLootFilter();\n    broadcastState();\n    return buildWorkspaceSnapshot();",
    'profile activation loot refresh');
  content = replaceOnce(content,
    "    buildPlannerState = activateBuildStage(buildPlannerState, buildProfiles, profileId, stageId);\n    await store.saveBuildPlanner(buildPlannerState, buildProfiles);\n    broadcastState();\n    return buildWorkspaceSnapshot();",
    "    buildPlannerState = activateBuildStage(buildPlannerState, buildProfiles, profileId, stageId);\n    rebuildBuildGuidance();\n    await store.saveBuildPlanner(buildPlannerState, buildProfiles);\n    await refreshBuildLootFilter();\n    broadcastState();\n    return buildWorkspaceSnapshot();",
    'stage activation build refresh');
  content = replaceOnce(content,
    "    rebuildBuildGuidance();\n    await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);\n    broadcastState();\n    return buildProfiles;\n  });\n}",
    "    rebuildBuildGuidance();\n    await Promise.all([store.saveBuildProfiles(buildProfiles), store.saveBuildPlanner(buildPlannerState, buildProfiles)]);\n    await refreshBuildLootFilter();\n    broadcastState();\n    return buildProfiles;\n  });\n}",
    'PoB delete loot refresh');
  content = replaceOnce(content,
    "    await loadBuildGameData();\n    rebuildBuildGuidance();\n    if (isSmokeTest) {\n      if (gemData.status !== 'ready') throw new Error(`Packaged gem data failed startup smoke: ${gemData.message}`);\n      log.info(`Packaged startup smoke test passed with ${dataset.steps.length} campaign steps and PoE ${gemData.snapshot?.gameVersion} gem data.`);",
    "    await loadBuildGameData();\n    rebuildBuildGuidance();\n    await refreshBuildLootFilter();\n    if (isSmokeTest) {\n      if (gemData.status !== 'ready') throw new Error(`Packaged gem data failed startup smoke: ${gemData.message}`);\n      if (passiveData.status !== 'ready') throw new Error(`Packaged passive tree data failed startup smoke: ${passiveData.message}`);\n      log.info(`Packaged startup smoke test passed with ${dataset.steps.length} campaign steps, PoE ${gemData.snapshot?.gameVersion} gem data and ${passiveData.snapshot?.nodes.length} passive nodes.`);",
    'packaged passive smoke');
  await write(path, content);
}

await patchTypes();
await patchPreload();
await patchApp();
await patchBuildWorkspace();
await patchStyles();
await patchMain();
console.log('Build-aware campaign intelligence integration patch applied successfully.');
