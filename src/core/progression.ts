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
  currentAreaId?: string;
  currentAreaName?: string;
  recentAreaIds?: readonly string[];
  recentAreaNames?: readonly string[];
  /**
   * Off by default for live safety. A zone may only complete the route page the
   * player is currently being shown. Diagnostics/specialized callers can opt in
   * when they intentionally want bounded catch-up through missed events.
   */
  allowAheadMatch?: boolean;
}

function normalizeAreaName(value?: string): string | undefined {
  return value?.toLowerCase().replace(/^the\s+/, '').replace(/[.!]$/, '').trim();
}

function sameArea(left: Pick<ZoneEvent, 'areaId' | 'areaName'>, right: { areaId?: string; areaName?: string }): boolean {
  if (left.areaId && right.areaId) return left.areaId === right.areaId;
  const leftName = normalizeAreaName(left.areaName);
  const rightName = normalizeAreaName(right.areaName);
  return Boolean(leftName && rightName && leftName === rightName);
}

function appearsInRecentAreaHistory(event: Pick<ZoneEvent, 'areaId' | 'areaName'>, options: ProgressionOptions): boolean {
  if (event.areaId && options.recentAreaIds?.includes(event.areaId)) return true;
  const name = normalizeAreaName(event.areaName);
  return Boolean(name && options.recentAreaNames?.some((candidate) => normalizeAreaName(candidate) === name));
}

function matchesArea(step: CampaignStep, event: Pick<ZoneEvent, 'areaId' | 'areaName'>): 'id' | 'name' | null {
  if (event.areaId && step.targetAreaId === event.areaId) return 'id';
  const normalizedName = normalizeAreaName(event.areaName);
  if (normalizedName && normalizeAreaName(step.targetArea) === normalizedName) return 'name';
  return null;
}

function nextEnabledAfter(
  steps: CampaignStep[],
  matchedIndex: number,
  enabled: (step: CampaignStep, index: number) => boolean,
): number {
  for (let index = matchedIndex + 1; index < steps.length; index += 1) {
    if (enabled(steps[index], index)) return index;
  }
  for (let index = steps.length - 1; index >= 0; index -= 1) {
    if (enabled(steps[index], index)) return index;
  }
  return Math.max(0, Math.min(matchedIndex, steps.length - 1));
}

function currentEnabledAtOrAfter(
  steps: CampaignStep[],
  currentProgress: number,
  enabled: (step: CampaignStep, index: number) => boolean,
): number | undefined {
  for (let index = Math.max(0, currentProgress); index < steps.length; index += 1) {
    if (enabled(steps[index], index)) return index;
  }
  return undefined;
}

/**
 * Client.txt can prove that a zone changed, but it cannot prove that a Book of
 * Skill was claimed, an Ascendancy Trial was completed, or a Labyrinth was
 * finished. These pages deliberately require an explicit player completion so
 * the campaign cursor can never silently run past permanent rewards.
 */
export function requiresManualCampaignCompletion(step?: CampaignStep): boolean {
  return Boolean(step && (
    step.permanentReward === 'passive' ||
    step.permanentReward === 'trial' ||
    step.tags?.includes('labyrinth')
  ));
}

export function decideProgression(
  steps: CampaignStep[],
  currentProgress: number,
  event: Pick<ZoneEvent, 'areaId' | 'areaName'>,
  options: ProgressionOptions = {},
): ProgressDecision | null {
  if (!event.areaId && !event.areaName) return null;
  if (sameArea(event, { areaId: options.currentAreaId, areaName: options.currentAreaName })) return null;
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

  const currentEnabled = currentEnabledAtOrAfter(steps, currentProgress, enabled);
  if (currentEnabled !== undefined && requiresManualCampaignCompletion(steps[currentEnabled])) return null;

  // Live campaign tracking must fail closed. Entering a later route zone through
  // a party portal, waypoint, missed log burst or deliberate detour must not
  // silently skip the objectives between the saved cursor and that zone. The UI
  // can still show CATCHING UP / I'M LOST recovery and let the player resume
  // explicitly. Specialized diagnostics may opt into bounded catch-up, except
  // across manual-completion pages which remain protected in every mode.
  if (options.allowAheadMatch !== true) {
    if (currentEnabled === undefined || forwardMatch.index !== currentEnabled) return null;
  }

  // A zone that was visited only moments ago is a strong backtrack signal. It may
  // still legitimately be the exact objective currently displayed, such as
  // returning from a side zone to its parent. It must never be allowed to skip a
  // different current objective merely because the same parent area reappears
  // later in the route.
  if (appearsInRecentAreaHistory(event, options) && forwardMatch.index > currentProgress) return null;

  // A recently completed matching transition usually means the player briefly
  // backtracked. Do not skip several objectives to a later repeat of the same
  // area. A match on the current route page is still allowed so intentional
  // return trips such as side-zone -> parent-zone continue to work.
  const recentStart = Math.max(0, currentProgress - recentLookBehind);
  const hasRecentMatch = steps
    .slice(recentStart, currentProgress)
    .some((step, offset) => enabled(step, recentStart + offset) && Boolean(matchesArea(step, event)));
  if (hasRecentMatch && forwardMatch.index > currentProgress + 1) return null;

  // Route conditions can place mutually exclusive pages next to each other. Once
  // a zone transition completes a page, land on the next *enabled* page instead
  // of briefly pointing progress at a disabled league-start/bandit/optional page.
  const to = nextEnabledAfter(steps, forwardMatch.index, enabled);
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
  candidates.sort((a, b) => Math.abs(nextEnabledAfter(steps, a.index, isEnabled) - savedProgress) - Math.abs(nextEnabledAfter(steps, b.index, isEnabled) - savedProgress));
  return { index: nextEnabledAfter(steps, candidates[0].index, isEnabled), confidence: idMatches.length ? 'verified' : 'inferred' };
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
  return {
    state: 'suggested',
    detectedAreaId: detected.areaId,
    detectedAreaName: detected.areaName,
    detectedProgress: match.index,
    savedProgress,
    message: `Current zone differs from saved route progress by ${distance} steps.`,
  };
}
