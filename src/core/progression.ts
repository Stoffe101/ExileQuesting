import type { CampaignStep, ProgressConfidence, ProgressHistoryEntry, StartupReconciliation, ZoneEvent } from './types';

export interface ProgressDecision {
  to: number;
  reason: string;
  confidence: ProgressConfidence;
}

function normalizeAreaName(value?: string): string | undefined {
  return value?.toLowerCase().replace(/^the\s+/, '').replace(/[.!]$/, '').trim();
}

export function decideProgression(
  steps: CampaignStep[],
  currentProgress: number,
  event: Pick<ZoneEvent, 'areaId' | 'areaName'>,
): ProgressDecision | null {
  if (!event.areaId && !event.areaName) return null;
  const normalizedName = normalizeAreaName(event.areaName);
  const start = Math.max(0, currentProgress - 3);
  const end = Math.min(steps.length, currentProgress + 28);

  if (event.areaId) {
    for (let index = start; index < end; index += 1) {
      const step = steps[index];
      if (step.targetAreaId !== event.areaId) continue;
      const to = Math.min(index + 1, steps.length - 1);
      if (to === currentProgress) return null;
      return { to, reason: `Internal area ID ${event.areaId} matched the route transition.`, confidence: 'verified' };
    }
  }

  if (normalizedName) {
    for (let index = start; index < end; index += 1) {
      const step = steps[index];
      if (normalizeAreaName(step.targetArea) !== normalizedName) continue;
      const to = Math.min(index + 1, steps.length - 1);
      if (to === currentProgress) return null;
      return { to, reason: `Displayed area name ${event.areaName} matched a nearby route transition.`, confidence: 'inferred' };
    }
  }
  return null;
}

function closestGlobalMatch(
  steps: CampaignStep[],
  savedProgress: number,
  detected: Pick<ZoneEvent, 'areaId' | 'areaName'>,
): { index: number; confidence: ProgressConfidence } | undefined {
  const normalizedName = normalizeAreaName(detected.areaName);
  const idMatches = detected.areaId
    ? steps.map((step, index) => ({ step, index })).filter(({ step }) => step.targetAreaId === detected.areaId)
    : [];
  const nameMatches = !idMatches.length && normalizedName
    ? steps.map((step, index) => ({ step, index })).filter(({ step }) => normalizeAreaName(step.targetArea) === normalizedName)
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
): StartupReconciliation {
  if (!detected?.areaId && !detected?.areaName) return { state: 'none' };
  const match = closestGlobalMatch(steps, savedProgress, detected);
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
