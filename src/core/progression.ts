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

  for (let index = start; index < end; index += 1) {
    const step = steps[index];
    if (event.areaId && step.targetAreaId === event.areaId) {
      const to = Math.min(index + 1, steps.length - 1);
      if (to === currentProgress) return null;
      return { to, reason: `Internal area ID ${event.areaId} matched the route transition.`, confidence: 'verified' };
    }
  }

  if (normalizedName) {
    for (let index = start; index < end; index += 1) {
      const step = steps[index];
      if (normalizeAreaName(step.targetArea) === normalizedName) {
        const to = Math.min(index + 1, steps.length - 1);
        if (to === currentProgress) return null;
        return { to, reason: `Displayed area name ${event.areaName} matched a nearby route transition.`, confidence: 'inferred' };
      }
    }
  }
  return null;
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
  const candidate = decideProgression(steps, savedProgress, detected);
  if (!candidate) return { state: 'none' };
  const distance = Math.abs(candidate.to - savedProgress);
  if (distance <= 3 && candidate.confidence === 'verified') return { state: 'none' };
  return {
    state: 'suggested',
    detectedAreaId: detected.areaId,
    detectedAreaName: detected.areaName,
    detectedProgress: candidate.to,
    savedProgress,
    message: `Current zone differs from saved route progress by ${distance} steps.`,
  };
}
