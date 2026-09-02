import { emptyRunSession } from './run';
import type { AppSettings, ProgressHistoryEntry, RunHistoryEntry, RunSession } from './types';

export const SETTINGS_SCHEMA_VERSION = 1;
export const MAX_SETTINGS_BYTES = 256 * 1024;
export const MAX_PROGRESS_HISTORY = 80;
export const MAX_RUN_HISTORY = 20;

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}
function boolean(value: unknown, fallback: boolean): boolean { return typeof value === 'boolean' ? value : fallback; }
function finite(value: unknown, fallback: number, min: number, max: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}
function boundedString(value: unknown, fallback: string, max = 4096): string { return typeof value === 'string' && value.length <= max ? value : fallback; }
function enumValue<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value) ? value as T : fallback;
}

export function parseBoundedJson(text: string, maxBytes = MAX_SETTINGS_BYTES): unknown {
  if (Buffer.byteLength(text, 'utf8') > maxBytes) throw new Error(`JSON document exceeds ${maxBytes} bytes.`);
  return JSON.parse(text) as unknown;
}

/**
 * Settings written before the migration registry existed were a flat object.
 * Treat that format as schema v0. Schema v1 wraps the payload so future
 * migrations can be explicit without guessing based on which fields happen to
 * exist. Unknown future fields are ignored by normalization rather than copied
 * into runtime settings.
 */
export function migrateSettingsDocument(value: unknown): { schemaVersion: number; settings: Record<string, unknown> } {
  const source = record(value) ?? {};
  const declared = Number.isInteger(source.schemaVersion) ? Number(source.schemaVersion) : 0;
  if (declared <= 0) return { schemaVersion: SETTINGS_SCHEMA_VERSION, settings: source };
  if (declared === 1) return { schemaVersion: SETTINGS_SCHEMA_VERSION, settings: record(source.settings) ?? {} };
  // A newer app may have written this file. Do not destroy it or trust unknown
  // structure; consume only a recognizable settings payload using current
  // field normalization and leave the file untouched until the user changes a
  // setting in this version.
  return { schemaVersion: SETTINGS_SCHEMA_VERSION, settings: record(source.settings) ?? {} };
}

export function settingsDocument(settings: AppSettings): { schemaVersion: number; settings: AppSettings } {
  return { schemaVersion: SETTINGS_SCHEMA_VERSION, settings };
}

export function normalizeSettingsDocument(value: unknown, defaults: AppSettings): AppSettings {
  const source = migrateSettingsDocument(value).settings;
  const typography = record(source.overlayTypography) ?? {};
  const position = record(source.overlayPosition) ?? {};
  const hotkeys = record(source.hotkeys) ?? {};
  return {
    logPath: boundedString(source.logPath, defaults.logPath),
    guidanceMode: enumValue(source.guidanceMode, ['beginner', 'balanced', 'racer'] as const, defaults.guidanceMode),
    leagueStart: boolean(source.leagueStart, defaults.leagueStart),
    bandit: enumValue(source.bandit, ['none', 'alira', 'kraityn', 'oak'] as const, defaults.bandit),
    showOptional: boolean(source.showOptional, defaults.showOptional),
    autoAdvance: boolean(source.autoAdvance, defaults.autoAdvance),
    autoShowOnZoneChange: boolean(source.autoShowOnZoneChange, defaults.autoShowOnZoneChange),
    overlayOpacity: finite(source.overlayOpacity, defaults.overlayOpacity, 0.35, 1),
    overlayScale: finite(source.overlayScale, defaults.overlayScale, 0.75, 1.5),
    overlayClickThrough: boolean(source.overlayClickThrough, defaults.overlayClickThrough),
    overlayMode: enumValue(source.overlayMode, ['focus', 'compact', 'coach'] as const, defaults.overlayMode),
    overlayTypography: {
      preset: enumValue(typography.preset, ['compact', 'default', 'large', 'extra-large', 'custom'] as const, defaults.overlayTypography.preset),
      objective: finite(typography.objective, defaults.overlayTypography.objective, 16, 34),
      actions: finite(typography.actions, defaults.overlayTypography.actions, 11, 24),
      guidance: finite(typography.guidance, defaults.overlayTypography.guidance, 10, 21),
      labels: finite(typography.labels, defaults.overlayTypography.labels, 9, 16),
      status: finite(typography.status, defaults.overlayTypography.status, 9, 16),
      density: enumValue(typography.density, ['compact', 'comfortable', 'spacious'] as const, defaults.overlayTypography.density),
    },
    overlayPosition: {
      preset: enumValue(position.preset, ['top-left', 'top-center', 'top-right', 'middle-left', 'middle-right', 'bottom-left', 'bottom-center', 'bottom-right', 'custom'] as const, defaults.overlayPosition.preset),
      x: position.x === undefined ? undefined : finite(position.x, 0, -100_000, 100_000),
      y: position.y === undefined ? undefined : finite(position.y, 0, -100_000, 100_000),
      displayId: position.displayId === undefined ? undefined : Math.trunc(finite(position.displayId, 0, 0, Number.MAX_SAFE_INTEGER)),
      locked: boolean(position.locked, defaults.overlayPosition.locked),
      snapToEdges: boolean(position.snapToEdges, defaults.overlayPosition.snapToEdges),
    },
    overlayAutoCollapse: boolean(source.overlayAutoCollapse, defaults.overlayAutoCollapse),
    overlayAutoCollapseSeconds: finite(source.overlayAutoCollapseSeconds, defaults.overlayAutoCollapseSeconds, 1, 30),
    passiveTreeHudEnabled: boolean(source.passiveTreeHudEnabled, defaults.passiveTreeHudEnabled),
    passiveTreeHudPathPreview: boolean(source.passiveTreeHudPathPreview, defaults.passiveTreeHudPathPreview),
    reducedMotion: boolean(source.reducedMotion, defaults.reducedMotion),
    reducedTransparency: boolean(source.reducedTransparency, defaults.reducedTransparency),
    onboardingComplete: boolean(source.onboardingComplete, defaults.onboardingComplete),
    launchMinimized: boolean(source.launchMinimized, defaults.launchMinimized),
    autoCheckAppUpdates: boolean(source.autoCheckAppUpdates, defaults.autoCheckAppUpdates),
    autoDownloadAppUpdates: boolean(source.autoDownloadAppUpdates, defaults.autoDownloadAppUpdates),
    autoStartRunTimer: boolean(source.autoStartRunTimer, defaults.autoStartRunTimer),
    showRunTimerInOverlay: boolean(source.showRunTimerInOverlay, defaults.showRunTimerInOverlay),
    hotkeys: {
      toggleOverlay: boundedString(hotkeys.toggleOverlay, defaults.hotkeys.toggleOverlay, 80),
      nextStep: boundedString(hotkeys.nextStep, defaults.hotkeys.nextStep, 80),
      previousStep: boundedString(hotkeys.previousStep, defaults.hotkeys.previousStep, 80),
      toggleInteraction: boundedString(hotkeys.toggleInteraction, defaults.hotkeys.toggleInteraction, 80),
      cycleOverlayMode: boundedString(hotkeys.cycleOverlayMode, defaults.hotkeys.cycleOverlayMode, 80),
    },
  };
}

function validHistoryEntry(value: unknown): value is ProgressHistoryEntry {
  const item = record(value);
  return Boolean(item && typeof item.id === 'string' && typeof item.at === 'string' && Number.isInteger(item.from) && Number.isInteger(item.to) && typeof item.reason === 'string' && ['verified', 'inferred', 'manual'].includes(String(item.confidence)));
}
export function normalizeProgressDocument(value: unknown, maxStepIndex: number): { progress: number; history: ProgressHistoryEntry[] } {
  const source = record(value) ?? {};
  const progress = Math.max(0, Math.min(maxStepIndex, Number.isInteger(source.progress) ? Number(source.progress) : 0));
  const history = Array.isArray(source.history) ? source.history.filter(validHistoryEntry).slice(-MAX_PROGRESS_HISTORY) : [];
  return { progress, history };
}
function validRunHistory(value: unknown): value is RunHistoryEntry {
  const item = record(value);
  return Boolean(item && typeof item.id === 'string' && typeof item.startedAt === 'string' && typeof item.finishedAt === 'string' && Number.isFinite(item.totalMs) && Number(item.totalMs) >= 0 && Array.isArray(item.splits));
}
export function normalizeRunDocument(value: unknown): { session: RunSession; history: RunHistoryEntry[] } {
  const source = record(value) ?? {};
  const candidate = record(source.session);
  let session = emptyRunSession();
  if (candidate && ['idle', 'running', 'paused', 'finished'].includes(String(candidate.state))) {
    session = {
      ...session,
      ...(candidate as unknown as RunSession),
      state: candidate.state as RunSession['state'],
      pausedMs: finite(candidate.pausedMs, 0, 0, Number.MAX_SAFE_INTEGER),
      townTimeMs: finite(candidate.townTimeMs, 0, 0, Number.MAX_SAFE_INTEGER),
      splits: Array.isArray(candidate.splits) ? candidate.splits.filter((split) => record(split) && Number.isInteger((split as { act?: unknown }).act)).slice(0, 10) as RunSession['splits'] : [],
    };
  }
  const history = Array.isArray(source.history) ? source.history.filter(validRunHistory).slice(-MAX_RUN_HISTORY) : [];
  return { session, history };
}
export function normalizeRewardDocument(value: unknown, allowedStepIds?: Set<string>): Set<string> {
  const source = record(value) ?? {};
  const ids = Array.isArray(source.confirmedStepIds) ? source.confirmedStepIds.filter((id): id is string => typeof id === 'string' && id.length <= 256) : [];
  return new Set(allowedStepIds ? ids.filter((id) => allowedStepIds.has(id)) : ids);
}
