import { buildRunAnalytics } from './run-analytics';
import type { ActSplit, RunHistoryEntry, RunSession, RunStats, RunZoneVisit } from './types';

const MAX_RUN_ZONE_VISITS = 800;

export function emptyRunSession(): RunSession {
  return { state: 'idle', pausedMs: 0, townTimeMs: 0, splits: [], visits: [] };
}

export function elapsedRunMs(session: RunSession, now = Date.now()): number {
  if (!session.startedAt) return 0;
  const start = Date.parse(session.startedAt);
  const end = session.finishedAt
    ? Date.parse(session.finishedAt)
    : session.state === 'paused' && session.pausedAt
      ? Date.parse(session.pausedAt)
      : now;
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(0, end - start - Math.max(0, session.pausedMs));
}

export function isTownAreaId(areaId?: string): boolean {
  return Boolean(areaId && /(?:^|_)town$/i.test(areaId));
}

export function liveTownTimeMs(session: RunSession, now = Date.now()): number {
  if (!session.lastZoneChangedAt || !isTownAreaId(session.lastAreaId) || session.state !== 'running') return session.townTimeMs;
  const changedAt = Date.parse(session.lastZoneChangedAt);
  if (!Number.isFinite(changedAt)) return session.townTimeMs;
  return session.townTimeMs + Math.max(0, now - changedAt);
}

function settleTownTime(session: RunSession, now: Date): RunSession {
  if (!session.lastZoneChangedAt || !isTownAreaId(session.lastAreaId) || session.state !== 'running') return session;
  const changedAt = Date.parse(session.lastZoneChangedAt);
  if (!Number.isFinite(changedAt)) return session;
  return { ...session, townTimeMs: session.townTimeMs + Math.max(0, now.getTime() - changedAt) };
}

function settleActiveVisit(session: RunSession, now: Date): RunSession {
  if (!session.activeVisitStartedAt) return session;
  const startedAt = Date.parse(session.activeVisitStartedAt);
  const visits = [...(session.visits ?? [])];
  const activeIndex = visits.length - 1;
  const active = visits[activeIndex];
  if (!Number.isFinite(startedAt) || !active || active.areaId !== session.lastAreaId) {
    return { ...session, activeVisitStartedAt: undefined, visits };
  }
  visits[activeIndex] = {
    ...active,
    durationMs: Math.max(0, active.durationMs) + Math.max(0, now.getTime() - startedAt),
  };
  return { ...session, activeVisitStartedAt: undefined, visits };
}

export function startRun(session: RunSession, act = 1, now = new Date()): RunSession {
  if (session.state === 'running') return session;
  if (session.state === 'paused' && session.startedAt && session.pausedAt) {
    const pauseStarted = Date.parse(session.pausedAt);
    const resumedAt = now.getTime();
    const visits = session.visits ?? [];
    const canResumeVisit = Boolean(session.lastAreaId && visits.at(-1)?.areaId === session.lastAreaId);
    return {
      ...session,
      state: 'running',
      pausedAt: undefined,
      pausedMs: session.pausedMs + (Number.isFinite(pauseStarted) ? Math.max(0, resumedAt - pauseStarted) : 0),
      lastZoneChangedAt: isTownAreaId(session.lastAreaId) ? now.toISOString() : session.lastZoneChangedAt,
      activeVisitStartedAt: canResumeVisit ? now.toISOString() : undefined,
    };
  }
  return {
    state: 'running',
    startedAt: now.toISOString(),
    pausedMs: 0,
    townTimeMs: 0,
    currentAct: act,
    splits: [],
    visits: [],
  };
}

export function pauseRun(session: RunSession, now = new Date()): RunSession {
  if (session.state !== 'running') return session;
  const settled = settleActiveVisit(settleTownTime(session, now), now);
  return {
    ...settled,
    state: 'paused',
    pausedAt: now.toISOString(),
    lastZoneChangedAt: isTownAreaId(settled.lastAreaId) ? now.toISOString() : settled.lastZoneChangedAt,
  };
}

export function resetRun(): RunSession {
  return emptyRunSession();
}

export function recordRunArea(
  session: RunSession,
  areaId: string | undefined,
  now = new Date(),
  details: { areaName?: string; act?: number } = {},
): RunSession {
  if (session.state !== 'running' || !areaId || areaId === session.lastAreaId) return session;
  const settled = settleActiveVisit(settleTownTime(session, now), now);
  const existingVisits = settled.visits ?? [];
  const revisit = existingVisits.some((visit) => visit.areaId === areaId);
  const visit: RunZoneVisit = {
    id: `${now.toISOString()}:${areaId}:${existingVisits.length + 1}`,
    areaId,
    areaName: details.areaName?.trim() || undefined,
    act: details.act,
    enteredAt: now.toISOString(),
    durationMs: 0,
    revisit,
    town: isTownAreaId(areaId),
  };
  const visits = [...existingVisits, visit].slice(-MAX_RUN_ZONE_VISITS);
  return {
    ...settled,
    lastAreaId: areaId,
    lastZoneChangedAt: now.toISOString(),
    activeVisitStartedAt: now.toISOString(),
    visits,
  };
}

export function recordActTransition(session: RunSession, nextAct: number, now = new Date()): RunSession {
  if (session.state !== 'running') return session;
  const currentAct = session.currentAct ?? nextAct;
  if (nextAct <= currentAct) return { ...session, currentAct };
  const elapsedMs = elapsedRunMs(session, now.getTime());
  const splits = [...session.splits];
  for (let act = currentAct; act < nextAct; act += 1) {
    if (!splits.some((split) => split.act === act)) splits.push({ act, at: now.toISOString(), elapsedMs });
  }
  return { ...session, currentAct: nextAct, splits };
}

export function finishRun(session: RunSession, now = new Date()): { session: RunSession; history?: RunHistoryEntry } {
  if (!session.startedAt || session.state === 'idle' || session.state === 'finished') return { session };
  const startedAt = session.startedAt;
  const finishedAt = now.toISOString();
  let settled = settleActiveVisit(settleTownTime(session, now), now);
  const elapsedMs = elapsedRunMs(settled, now.getTime());
  const splits: ActSplit[] = [...settled.splits];
  const currentAct = settled.currentAct;
  if (currentAct && !splits.some((split) => split.act === currentAct)) {
    splits.push({ act: currentAct, at: finishedAt, elapsedMs });
  }
  settled = { ...settled, state: 'finished', finishedAt, pausedAt: undefined, activeVisitStartedAt: undefined, splits };
  return {
    session: settled,
    history: {
      id: `${startedAt}:${finishedAt}`,
      startedAt,
      finishedAt,
      totalMs: elapsedMs,
      townTimeMs: settled.townTimeMs,
      splits,
      visits: settled.visits ?? [],
    },
  };
}

export function appendRunHistory(history: RunHistoryEntry[], entry: RunHistoryEntry, limit = 20): RunHistoryEntry[] {
  return [...history.filter((item) => item.id !== entry.id), entry].slice(-limit);
}

export function runStatsFor(session: RunSession, history: RunHistoryEntry[], now = Date.now()): RunStats {
  const completed = history.filter((entry) => entry.totalMs > 0);
  const currentHistoryId = session.startedAt && session.finishedAt ? `${session.startedAt}:${session.finishedAt}` : undefined;
  const comparisonHistory = currentHistoryId ? completed.filter((entry) => entry.id !== currentHistoryId) : completed;
  const previous = comparisonHistory.at(-1);
  const personalBestReference = comparisonHistory.length
    ? [...comparisonHistory].sort((left, right) => left.totalMs - right.totalMs)[0]
    : undefined;
  const personalBest = completed.length ? [...completed].sort((left, right) => left.totalMs - right.totalMs)[0] : undefined;
  return {
    session,
    elapsedMs: elapsedRunMs(session, now),
    previous,
    personalBest,
    analytics: buildRunAnalytics(session, previous, personalBestReference, now),
  };
}

export function formatDuration(milliseconds: number): string {
  const totalSeconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
    : `${minutes}:${String(seconds).padStart(2, '0')}`;
}
