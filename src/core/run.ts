import type { ActSplit, RunHistoryEntry, RunSession, RunStats } from './types';

export function emptyRunSession(): RunSession {
  return { state: 'idle', pausedMs: 0, townTimeMs: 0, splits: [] };
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

function settleTownTime(session: RunSession, now: Date): RunSession {
  if (!session.lastZoneChangedAt || !isTownAreaId(session.lastAreaId) || session.state !== 'running') return session;
  const changedAt = Date.parse(session.lastZoneChangedAt);
  if (!Number.isFinite(changedAt)) return session;
  return { ...session, townTimeMs: session.townTimeMs + Math.max(0, now.getTime() - changedAt) };
}

export function startRun(session: RunSession, act = 1, now = new Date()): RunSession {
  if (session.state === 'running') return session;
  if (session.state === 'paused' && session.startedAt && session.pausedAt) {
    const pauseStarted = Date.parse(session.pausedAt);
    const resumedAt = now.getTime();
    return {
      ...session,
      state: 'running',
      pausedAt: undefined,
      pausedMs: session.pausedMs + (Number.isFinite(pauseStarted) ? Math.max(0, resumedAt - pauseStarted) : 0),
      lastZoneChangedAt: isTownAreaId(session.lastAreaId) ? now.toISOString() : session.lastZoneChangedAt,
    };
  }
  return {
    state: 'running',
    startedAt: now.toISOString(),
    pausedMs: 0,
    townTimeMs: 0,
    currentAct: act,
    splits: [],
  };
}

export function pauseRun(session: RunSession, now = new Date()): RunSession {
  if (session.state !== 'running') return session;
  const settled = settleTownTime(session, now);
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

export function recordRunArea(session: RunSession, areaId: string | undefined, now = new Date()): RunSession {
  if (session.state !== 'running' || !areaId || areaId === session.lastAreaId) return session;
  const settled = settleTownTime(session, now);
  return { ...settled, lastAreaId: areaId, lastZoneChangedAt: now.toISOString() };
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
  let settled = settleTownTime(session, now);
  const elapsedMs = elapsedRunMs(settled, now.getTime());
  const splits: ActSplit[] = [...settled.splits];
  const currentAct = settled.currentAct;
  if (currentAct && !splits.some((split) => split.act === currentAct)) {
    splits.push({ act: currentAct, at: finishedAt, elapsedMs });
  }
  settled = { ...settled, state: 'finished', finishedAt, pausedAt: undefined, splits };
  return {
    session: settled,
    history: {
      id: `${startedAt}:${finishedAt}`,
      startedAt,
      finishedAt,
      totalMs: elapsedMs,
      townTimeMs: settled.townTimeMs,
      splits,
    },
  };
}

export function appendRunHistory(history: RunHistoryEntry[], entry: RunHistoryEntry, limit = 20): RunHistoryEntry[] {
  return [...history.filter((item) => item.id !== entry.id), entry].slice(-limit);
}

export function runStatsFor(session: RunSession, history: RunHistoryEntry[], now = Date.now()): RunStats {
  const completed = history.filter((entry) => entry.totalMs > 0);
  return {
    session,
    elapsedMs: elapsedRunMs(session, now),
    previous: completed.at(-1),
    personalBest: completed.length ? [...completed].sort((a, b) => a.totalMs - b.totalMs)[0] : undefined,
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
