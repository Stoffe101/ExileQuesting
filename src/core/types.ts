export type GuidanceMode = 'beginner' | 'balanced' | 'racer';
export type OverlayMode = 'focus' | 'compact' | 'coach';
export type OverlayTypographyPreset = 'compact' | 'default' | 'large' | 'extra-large' | 'custom';
export type OverlayDensity = 'compact' | 'comfortable' | 'spacious';
export type OverlayPositionPreset = 'top-left' | 'top-center' | 'top-right' | 'middle-left' | 'middle-right' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'custom';
export type ProgressConfidence = 'verified' | 'inferred' | 'manual';
export type XpPace = 'behind' | 'efficient' | 'overlevelled' | 'unknown';

export type RouteActionType =
  | 'travel'
  | 'kill'
  | 'talk'
  | 'collect'
  | 'quest-item'
  | 'reward'
  | 'waypoint'
  | 'passive'
  | 'trial'
  | 'vendor'
  | 'gem'
  | 'portal'
  | 'relog'
  | 'craft'
  | 'build'
  | 'warning'
  | 'context';

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

export interface RouteAction {
  id: string;
  type: RouteActionType;
  title: string;
  detail?: string;
  target?: string;
  priority: 'now' | 'then' | 'next' | 'context';
  critical?: boolean;
  optional?: boolean;
  sourceLine?: string;
}

export interface LayoutHint {
  areaId: string;
  text: string;
  confidence: 'high' | 'medium' | 'low';
  source?: string;
  gameVersion?: string;
  enabled?: boolean;
}

export interface PermanentReward {
  id: string;
  act: number;
  type: 'passive' | 'trial';
  label: string;
  stepId: string;
  requiredForStory?: boolean;
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
  actions: RouteAction[];
  condition?: CampaignCondition;
  annotation?: Omit<GuidanceAnnotation, 'selector'>;
  layoutHints?: LayoutHint[];
  permanentReward?: PermanentReward['type'];
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

export interface OverlayTypography {
  preset: OverlayTypographyPreset;
  objective: number;
  actions: number;
  guidance: number;
  labels: number;
  status: number;
  density: OverlayDensity;
}

export interface OverlayPosition {
  preset: OverlayPositionPreset;
  x?: number;
  y?: number;
  displayId?: number;
  locked: boolean;
  snapToEdges: boolean;
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
  overlayMode: OverlayMode;
  overlayTypography: OverlayTypography;
  overlayPosition: OverlayPosition;
  overlayAutoCollapse: boolean;
  overlayAutoCollapseSeconds: number;
  reducedMotion: boolean;
  reducedTransparency: boolean;
  onboardingComplete: boolean;
  launchMinimized: boolean;
  hotkeys: {
    toggleOverlay: string;
    nextStep: string;
    previousStep: string;
    toggleInteraction: string;
    cycleOverlayMode: string;
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

export interface LogDiagnostics {
  path: string;
  fileExists: boolean;
  watcherActive: boolean;
  pollingActive: boolean;
  lastFileChangeAt?: string;
  lastParsedEventAt?: string;
  lastRawEvent?: string;
  lastAreaId?: string;
  lastAreaName?: string;
  areaLevel?: number;
  characterLevel?: number;
  lastError?: string;
}

export interface ProgressHistoryEntry {
  id: string;
  at: string;
  from: number;
  to: number;
  reason: string;
  confidence: ProgressConfidence;
  areaId?: string;
  areaName?: string;
  automatic: boolean;
}

export interface RewardProgress {
  passive: { completed: number; knownTotal: number };
  trials: { completed: number; knownTotal: number };
}

export interface XpGuidance {
  characterLevel?: number;
  areaLevel?: number;
  pace: XpPace;
  delta?: number;
  safeZone?: number;
  message: string;
}

export interface StartupReconciliation {
  state: 'none' | 'suggested';
  detectedAreaId?: string;
  detectedAreaName?: string;
  detectedProgress?: number;
  savedProgress?: number;
  message?: string;
}

export interface CampaignCompatibilityManifest {
  schemaVersion: number;
  upstream: {
    repository: string;
    guidePath: string;
    areasPath: string;
    supportedCommit?: string;
  };
  adapterVersion: number;
  campaignSchemaVersion: number;
  updatedAt: string;
}

export interface RuntimeState {
  settings: AppSettings;
  dataset: CampaignDataset;
  sourceStatus: CampaignSourceStatus;
  progress: number;
  currentZone?: string;
  currentAreaId?: string;
  currentAreaLevel?: number;
  characterLevel?: number;
  xpGuidance: XpGuidance;
  rewardProgress: RewardProgress;
  progressHistory: ProgressHistoryEntry[];
  startupReconciliation: StartupReconciliation;
  logConnected: boolean;
  logDiagnostics: LogDiagnostics;
  appVersion: string;
  diagnosticsPath: string;
}

export type ZoneEventType = 'area-generated' | 'area-entered' | 'character-level';

export interface ZoneEvent {
  type: ZoneEventType;
  areaName?: string;
  areaId?: string;
  areaLevel?: number;
  characterLevel?: number;
  timestamp?: string;
  raw: string;
}
