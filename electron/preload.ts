import { contextBridge, ipcRenderer } from 'electron';
import type { BuildProfile } from '../src/core/build-profiles';
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
  importBuildProfile: (input: string): Promise<BuildProfile[]> => ipcRenderer.invoke('pob:import', input),
  deleteBuildProfile: (id: string): Promise<BuildProfile[]> => ipcRenderer.invoke('pob:delete', id),
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
