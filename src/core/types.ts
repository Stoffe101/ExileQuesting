export type GuidanceMode = 'beginner' | 'balanced' | 'racer';

export interface CampaignCondition {
  key: 'league-start' | 'bandit';
  value: string | string[];
}

export interface RawConditionalStep {
  condition: [string, string | string[]];
  lines: string[];
}

export type RawStep = string[] | RawConditionalStep;
export type RawGuide = RawStep[][];

export interface AreaRecord {
  id: string;
  name: string;
  lvl?: number;
  map_name?: string;
  crafting_recipe?: string;
}

export type RawAreas = AreaRecord[][];

export interface GuidanceAnnotation {
  title?: string;
  summary?: string;
  details?: string[];
  why?: string;
  warning?: string;
  speedrun?: string;
  selector: {
    act: number;
    areaId?: string;
    contains?: string[];
  };
}

export interface CampaignStep {
  id: string;
  act: number;
  indexInAct: number;
  title: string;
  targetAreaId?: string;
  targetArea?: string;
  areaLevel?: number;
  lines: string[];
  rawLines: string[];
  tags: string[];
  condition?: CampaignCondition;
  annotation?: Omit<GuidanceAnnotation, 'selector'>;
}

export interface CampaignDataset {
  schemaVersion: number;
  source: {
    repository: string;
    commit: string;
    fetchedAt: string;
    license: string;
  };
  steps: CampaignStep[];
  acts: Array<{ act: number; firstStep: number; stepCount: number }>;
  areas: AreaRecord[];
}

export interface CampaignValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  metrics: {
    acts: number;
    steps: number;
    areas: number;
    referencedAreas: number;
    unresolvedAreaReferences: number;
  };
}

export interface AppSettings {
  logPath: string;
  guidanceMode: GuidanceMode;
  leagueStart: boolean;
  bandit: 'none' | 'alira' | 'kraityn' | 'oak';
  showOptional: boolean;
  autoAdvance: boolean;
  autoShowOnZoneChange: boolean;
  overlayOpacity: number;
  overlayScale: number;
  overlayClickThrough: boolean;
  launchMinimized: boolean;
  hotkeys: {
    toggleOverlay: string;
    nextStep: string;
    previousStep: string;
  };
}

export interface CampaignSourceStatus {
  state: 'bundled' | 'current' | 'checking' | 'update-available' | 'fallback' | 'error';
  activeCommit: string;
  latestCommit?: string;
  checkedAt?: string;
  message: string;
  validation?: CampaignValidation;
}

export interface RuntimeState {
  settings: AppSettings;
  dataset: CampaignDataset;
  sourceStatus: CampaignSourceStatus;
  progress: number;
  currentZone?: string;
  logConnected: boolean;
  appVersion: string;
  diagnosticsPath: string;
}

export interface ZoneEvent {
  areaName?: string;
  areaId?: string;
  areaLevel?: number;
  characterLevel?: number;
  timestamp?: string;
  raw: string;
}

