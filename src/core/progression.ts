import type { CampaignStep, ProgressConfidence, ProgressHistoryEntry, StartupReconciliation, ZoneEvent } from './types';

export interface ProgressDecision {
  to: number;
  reason: string;
  confidence: ProgressConfidence;
}

export interface ProgressionOptions {
  isStepEnabled?: (step: CampaignStep, index: number) => boolean;
  maxLookAhead?: number;
  recentLookBehind?: number;
}

function normalizeAreaName(value?: string): string | undefined {
  return value?.toLowerCase().replace(/^the\s+/, '').replace(/[.!]$/, '').trim();
}

function matchesArea(step: CampaignStep, event: Pick<ZoneEvent, 'areaId' | 'areaName'>): 'id' | 'name' | null {
  if (event.areaId && step.targetAreaId === event.areaId) return 'id';
  const normalizedName = normalizeAreaName(event.areaName);
  if (normalizedName && normalizeAreaName(step.targetArea) === normalizedName) return 'name';
  return null;
}

export function decideProgression(
  steps: CampaignStep[],
  currentProgress: number,
  event: Pick<ZoneEvent, 'areaId' | 'areaName'>,
  options: ProgressionOptions = {},
): ProgressDecision | null {
  if (!event.areaId && !event.areaName) return null;
  const maxLookAhead = Math.max(1, options.maxLookAhead ?? 28);
  const recentLookBehind = Math.max(0, options.recentLookBehind ?? 3);
  const enabled = options.isStepEnabled ?? (() => true);
  const start = Math.max(0, currentProgress);
  const end = Math.min(steps.length, currentProgress + maxLookAhead);

  let forwardMatch: { index: number; kind: 'id' | 'name' } | undefined;
  for (let index = start; index < end; index += 1) {
    const step = steps[index];
    if (!enabled(step, index)) continue;
    const kind = matchesArea(step, event);
    if (!kind) continue;
    forwardMatch = { index, kind };
    break;
  }
  if (!forwardMatch) return null;

  // A recently completed matching transition usually means a duplicate log event or
  // the player briefly backtracked. Do not skip several objectives to a later repeat
  // of the same area. A match on the current/next route page is still allowed so
  // intentional return trips such as side-zone -> parent-zone continue to work.
  const recentStart = Math.max(0, currentProgress - recentLookBehind);
  const hasRecentMatch = steps
    .slice(recentStart, currentProgress)
    .some((step, offset) => enabled(step, recentStart + offset) && Boolean(matchesArea(step, event)));
  if (hasRecentMatch && forwardMatch.index > currentProgress + 1) return null;

  const to = Math.min(forwardMatch.index + 1, steps.length - 1);
  if (to <= currentProgress) return null;
  if (forwardMatch.kind === 'id') {
    return { to, reason: `Internal area ID ${event.areaId} matched the next valid route transition.`, confidence: 'verified' };
  }
  return { to, reason: `Displayed area name ${event.areaName} matched the next valid route transition.`, confidence: 'inferred' };
}

function closestGlobalMatch(
  steps: CampaignStep[],
  savedProgress: number,
  detected: Pick<ZoneEvent, 'areaId' | 'areaName'>,
  isEnabled: (step: CampaignStep, index: number) => boolean = () => true,
): { index: number; confidence: ProgressConfidence } | undefined {
  const normalizedName = normalizeAreaName(detected.areaName);
  const idMatches = detected.areaId
    ? steps.map((step, index) => ({ step, index })).filter(({ step, index }) => isEnabled(step, index) && step.targetAreaId === detected.areaId)
    : [];
  const nameMatches = !idMatches.length && normalizedName
    ? steps.map((step, index) => ({ step, index })).filter(({ step, index }) => isEnabled(step, index) && normalizeAreaName(step.targetArea) === normalizedName)
    : [];
  const candidates = idMatches.length ? idMatches : nameMatches;
  if (!candidates.length) return undefined;
  candidates.sort((a, b) => Math.abs((a.index + 1) - savedProgress) - Math.abs((b.index + 1) - savedProgress));
  return { index: Math.min(candidates[0].index + 1, steps.length - 1), confidence: idMatches.length ? 'verified' : 'inferred' };
}

export function makeHistoryEntry(
  from: number,
  to: number,
  reason: string,
  confidence: ProgressConfidence,
  automatic: boolean,
  event?: Pick<ZoneEvent, 'areaId' | 'areaName'>,
): ProgressHistoryEntry {
  const at = new Date().toISOString();
  return {
    id: `${at}:${from}:${to}`,
    at,
    from,
    to,
    reason,
    confidence,
    automatic,
    areaId: event?.areaId,
    areaName: event?.areaName,
  };
}

export function appendHistory(history: ProgressHistoryEntry[], entry: ProgressHistoryEntry, limit = 80): ProgressHistoryEntry[] {
  return [...history, entry].slice(-limit);
}

export function reconcileStartup(
  steps: CampaignStep[],
  savedProgress: number,
  detected: Pick<ZoneEvent, 'areaId' | 'areaName'> | undefined,
  isEnabled: (step: CampaignStep, index: number) => boolean = () => true,
): StartupReconciliation {
  if (!detected?.areaId && !detected?.areaName) return { state: 'none' };
  const match = closestGlobalMatch(steps, savedProgress, detected, isEnabled);
  if (!match || match.index === savedProgress) return { state: 'none' };
  const distance = Math.abs(match.index - savedProgress);
  if (distance <= 3 && match.confidence === 'verified') return { state: 'none' };
  return {
    state: 'suggested',
    detectedAreaId: detected.areaId,
    detectedAreaName: detected.areaName,
    detectedProgress: match.index,
    savedProgress,
    message: `Current zone differs from saved route progress by ${distance} steps.`,
  };
}
