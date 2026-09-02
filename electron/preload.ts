import { contextBridge, ipcRenderer } from 'electron';
import type { BuildProfile } from '../src/core/build-profiles';
import type { BuildPlannerSnapshot } from '../src/core/build-planner';
import type { GemAcquisitionPlan } from '../src/core/gem-acquisition';
import type { CampaignSimulationReport } from '../src/core/simulator';
import type { BuildCoachSnapshot } from '../src/core/build-coach';
import type { LootFilterStatus } from '../src/core/loot-filter';
import type { AppSettings, OverlayMode, RuntimeState } from '../src/core/types';

export interface ReplayResult {
  sourcePath: string;
  chunks: number;
  lines: number;
  parsedEvents: number;
  finalProgress: number;
  errors: string[];
  decisions: Array<{
    event: { type: string; areaId?: string; areaName?: string; areaLevel?: number; raw?: string };
    progressBefore: number;
    progressAfter: number;
    reason: string;
  }>;
}

export interface SimulationResult {
  name: string;
  report: CampaignSimulationReport;
}

export interface BuildWorkspaceResult {
  planner: BuildPlannerSnapshot;
  gemData: { status: 'ready' | 'missing' | 'invalid'; message: string; gameVersion?: string; sourceCommit?: string };
  passiveData: { status: 'ready' | 'missing' | 'invalid'; message: string; gameVersion?: string; sha256?: string };
  plan?: GemAcquisitionPlan;
  coach?: BuildCoachSnapshot;
  lootFilter: LootFilterStatus;
  campaign: { resolved: number; unresolved: number; actionSteps: number };
}

const api = {
  bootstrap: (): Promise<RuntimeState> => ipcRenderer.invoke('app:bootstrap'),
  setSettings: (patch: Partial<AppSettings>): Promise<RuntimeState> => ipcRenderer.invoke('settings:update', patch),
  selectLogFile: (): Promise<RuntimeState> => ipcRenderer.invoke('log:select'),
  setProgress: (progress: number): Promise<RuntimeState> => ipcRenderer.invoke('progress:set', progress),
  undoProgress: (): Promise<RuntimeState> => ipcRenderer.invoke('progress:undo'),
  reconcileStartup: (accept: boolean): Promise<RuntimeState> => ipcRenderer.invoke('startup:reconcile', accept),
  showOverlay: (): Promise<void> => ipcRenderer.invoke('overlay:show'),
  hideOverlay: (): Promise<void> => ipcRenderer.invoke('overlay:hide'),
  toggleOverlay: (): Promise<void> => ipcRenderer.invoke('overlay:toggle'),
  reportOverlayContentHeight: (height: number): Promise<void> => ipcRenderer.invoke('overlay:content-size', height),
  resetOverlayPosition: (): Promise<RuntimeState> => ipcRenderer.invoke('overlay:reset-position'),
  previewOverlay: (config: { progress: number; mode: OverlayMode; characterLevel?: number; areaLevel?: number }): Promise<RuntimeState> => ipcRenderer.invoke('overlay:demo', config),
  stopOverlayPreview: (): Promise<RuntimeState> => ipcRenderer.invoke('overlay:demo-stop'),
  runCampaignSimulation: (): Promise<SimulationResult[]> => ipcRenderer.invoke('simulation:run'),
  exportCampaignSimulation: (): Promise<boolean> => ipcRenderer.invoke('simulation:export'),
  checkCampaignUpdates: (): Promise<RuntimeState> => ipcRenderer.invoke('campaign:check'),
  confirmReward: (stepId: string, confirmed: boolean): Promise<RuntimeState> => ipcRenderer.invoke('reward:confirm', stepId, confirmed),
  startRun: (): Promise<RuntimeState> => ipcRenderer.invoke('run:start'),
  pauseRun: (): Promise<RuntimeState> => ipcRenderer.invoke('run:pause'),
  resetRun: (): Promise<RuntimeState> => ipcRenderer.invoke('run:reset'),
  finishRun: (): Promise<RuntimeState> => ipcRenderer.invoke('run:finish'),
  checkAppUpdates: (): Promise<RuntimeState> => ipcRenderer.invoke('app-update:check'),
  downloadAppUpdate: (): Promise<RuntimeState> => ipcRenderer.invoke('app-update:download'),
  installAppUpdate: (): Promise<RuntimeState> => ipcRenderer.invoke('app-update:install'),
  acknowledgeRecovery: (): Promise<RuntimeState> => ipcRenderer.invoke('recovery:acknowledge'),
  openDiagnosticsFolder: (): Promise<void> => ipcRenderer.invoke('diagnostics:open'),
  copyDiagnostics: (): Promise<void> => ipcRenderer.invoke('diagnostics:copy'),
  exportDiagnostics: (): Promise<void> => ipcRenderer.invoke('diagnostics:export'),
  replayDiagnostics: (): Promise<ReplayResult | null> => ipcRenderer.invoke('diagnostics:replay'),
  exportReplayBundle: (): Promise<boolean> => ipcRenderer.invoke('diagnostics:replay-export'),
  listBuildProfiles: (): Promise<BuildProfile[]> => ipcRenderer.invoke('pob:list'),
  getBuildWorkspace: (): Promise<BuildWorkspaceResult> => ipcRenderer.invoke('pob:workspace'),
  importBuildProfile: (input: string): Promise<BuildProfile[]> => ipcRenderer.invoke('pob:import', input),
  activateBuildProfile: (id: string): Promise<BuildWorkspaceResult> => ipcRenderer.invoke('pob:activate-profile', id),
  activateBuildStage: (profileId: string, stageId: string): Promise<BuildWorkspaceResult> => ipcRenderer.invoke('pob:activate-stage', profileId, stageId),
  stepBuildPassive: (profileId: string, delta: number): Promise<BuildWorkspaceResult> => ipcRenderer.invoke('build:passive-step', profileId, delta),
  deleteBuildProfile: (id: string): Promise<BuildProfile[]> => ipcRenderer.invoke('pob:delete', id),
  selectLootFilterBase: (): Promise<BuildWorkspaceResult> => ipcRenderer.invoke('loot:select-base'),
  regenerateLootFilter: (): Promise<BuildWorkspaceResult> => ipcRenderer.invoke('loot:regenerate'),
  markLootFilterReloaded: (): Promise<BuildWorkspaceResult> => ipcRenderer.invoke('loot:reloaded'),
  onState: (callback: (state: RuntimeState) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: RuntimeState) => callback(state);
    ipcRenderer.on('state:changed', listener);
    return () => {
      ipcRenderer.removeListener('state:changed', listener);
    };
  },
};

contextBridge.exposeInMainWorld('exileQuesting', api);

export type ExileQuestingApi = typeof api;
