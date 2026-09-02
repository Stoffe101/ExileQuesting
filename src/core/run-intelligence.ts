import type { RunHistoryEntry, RunSession } from './types';

export const MAX_RUN_ZONE_VISITS = 600;

export interface RunZoneVisit {
  areaId: string;
  act?: number;
  enteredAt: string;
  leftAt?: string;
  durationMs: number;
  /** A resumed segment in the same area after pausing. It does not count as a revisit. */
  continuation?: boolean;
}

export interface RunZoneAggregate {
  areaId: string;
  act?: number;
  visits: number;
  totalMs: number;
  town: boolean;
}

export interface RunZoneDelta extends RunZoneAggregate {
  baselineMs: number;
  deltaMs: number;
}

export interface RunActDelta {
  act: number;
  currentMs: number;
  baselineMs: number;
  deltaMs: number;
}

export interface RunIntelligence {
  trackedZoneMs: number;
  uniqueZones: number;
  revisitCount: number;
  townShare: number;
  mostTime?: RunZoneAggregate;
  largestPbLoss?: RunZoneDelta;
  actDeltas: RunActDelta[];
}

type RunWithVisits = (RunSession | RunHistoryEntry) & { zoneVisits?: unknown };

function boundedString(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
}

function timestamp(value: unknown): string | undefined {
  const candidate = boundedString(value, 80);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : undefined;
}

function boundedNumber(value: unknown, min: number, max: number): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : undefined;
}

function normalizeVisit(value: unknown): RunZoneVisit | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  const areaId = boundedString(source.areaId, 256);
  const enteredAt = timestamp(source.enteredAt);
  const leftAt = source.leftAt === undefined ? undefined : timestamp(source.leftAt);
  const durationMs = boundedNumber(source.durationMs, 0, 24 * 60 * 60 * 1000);
  const act = source.act === undefined ? undefined : boundedNumber(source.act, 1, 10);
  if (!areaId || !enteredAt || durationMs === undefined || (source.leftAt !== undefined && !leftAt) || (source.act !== undefined && act === undefined)) return undefined;
  if (leftAt && Date.parse(leftAt) < Date.parse(enteredAt)) return undefined;
  return {
    areaId,
    ...(act === undefined ? {} : { act: Math.trunc(act) }),
    enteredAt,
    ...(leftAt ? { leftAt } : {}),
    durationMs: Math.trunc(durationMs),
    ...(source.continuation === true ? { continuation: true } : {}),
  };
}

export function normalizeRunZoneVisits(value: unknown): RunZoneVisit[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate) => {
    const visit = normalizeVisit(candidate);
    return visit ? [visit] : [];
  }).slice(-MAX_RUN_ZONE_VISITS);
}

export function zoneVisitsFor(value: RunSession | RunHistoryEntry): RunZoneVisit[] {
  return normalizeRunZoneVisits((value as RunWithVisits).zoneVisits);
}

export function withRunZoneVisits<T extends RunSession | RunHistoryEntry>(value: T, visits: RunZoneVisit[]): T {
  return { ...value, zoneVisits: normalizeRunZoneVisits(visits) } as T;
}

function activeDuration(visit: RunZoneVisit, value: RunSession | RunHistoryEntry, now: number): number {
  if (visit.leftAt) return visit.durationMs;
  if ('state' in value && value.state === 'running') {
    const entered = Date.parse(visit.enteredAt);
    return Number.isFinite(entered) ? Math.max(0, now - entered) : 0;
  }
  return visit.durationMs;
}

export function settleRunZoneVisit(session: RunSession, now = new Date()): RunSession {
  const visits = zoneVisitsFor(session);
  const last = visits.at(-1);
  if (!last || last.leftAt) return withRunZoneVisits(session, visits);
  const entered = Date.parse(last.enteredAt);
  const leftAt = now.toISOString();
  const durationMs = Number.isFinite(entered) ? Math.max(0, now.getTime() - entered) : 0;
  visits[visits.length - 1] = { ...last, leftAt, durationMs };
  return withRunZoneVisits(session, visits);
}

export function beginRunZoneVisit(session: RunSession, areaId: string, act: number | undefined, now = new Date(), continuation = false): RunSession {
  const id = boundedString(areaId, 256);
  if (!id) return session;
  const visits = zoneVisitsFor(session);
  const normalizedAct = Number.isInteger(act) && Number(act) >= 1 && Number(act) <= 10 ? Number(act) : undefined;
  visits.push({
    areaId: id,
    ...(normalizedAct === undefined ? {} : { act: normalizedAct }),
    enteredAt: now.toISOString(),
    durationMs: 0,
    ...(continuation ? { continuation: true } : {}),
  });
  return withRunZoneVisits(session, visits.slice(-MAX_RUN_ZONE_VISITS));
}

export function resumeRunZoneVisit(session: RunSession, now = new Date()): RunSession {
  if (!session.lastAreaId) return withRunZoneVisits(session, zoneVisitsFor(session));
  const visits = zoneVisitsFor(session);
  const last = visits.at(-1);
  if (last && !last.leftAt) return withRunZoneVisits(session, visits);
  return beginRunZoneVisit(withRunZoneVisits(session, visits), session.lastAreaId, session.currentAct, now, true);
}

export function sanitizeRunTelemetry(session: RunSession, history: RunHistoryEntry[]): { session: RunSession; history: RunHistoryEntry[] } {
  return {
    session: withRunZoneVisits(session, zoneVisitsFor(session)),
    history: history.map((entry) => withRunZoneVisits(entry, zoneVisitsFor(entry))),
  };
}

function isTown(areaId: string): boolean {
  return /(?:^|_)town$/i.test(areaId);
}

export function runZoneAggregates(value: RunSession | RunHistoryEntry, now = Date.now()): RunZoneAggregate[] {
  const aggregates = new Map<string, RunZoneAggregate>();
  for (const visit of zoneVisitsFor(value)) {
    const durationMs = activeDuration(visit, value, now);
    const existing = aggregates.get(visit.areaId) ?? {
      areaId: visit.areaId,
      act: visit.act,
      visits: 0,
      totalMs: 0,
      town: isTown(visit.areaId),
    };
    existing.totalMs += durationMs;
    if (!visit.continuation) existing.visits += 1;
    if (existing.act === undefined && visit.act !== undefined) existing.act = visit.act;
    aggregates.set(visit.areaId, existing);
  }
  return [...aggregates.values()];
}

function actDurations(splits: Array<{ act: number; elapsedMs: number }>): Map<number, number> {
  const ordered = [...splits].sort((left, right) => left.act - right.act);
  const result = new Map<number, number>();
  let previous = 0;
  for (const split of ordered) {
    if (!Number.isInteger(split.act) || split.act < 1 || split.act > 10 || !Number.isFinite(split.elapsedMs)) continue;
    const elapsed = Math.max(previous, split.elapsedMs);
    result.set(split.act, Math.max(0, elapsed - previous));
    previous = elapsed;
  }
  return result;
}

export function buildRunIntelligence(
  session: RunSession,
  personalBest?: RunHistoryEntry,
  now = Date.now(),
): RunIntelligence {
  const current = runZoneAggregates(session, now);
  const trackedZoneMs = current.reduce((sum, zone) => sum + zone.totalMs, 0);
  const nonTown = current.filter((zone) => !zone.town);
  const revisitCount = nonTown.reduce((sum, zone) => sum + Math.max(0, zone.visits - 1), 0);
  const mostTime = [...nonTown].sort((left, right) => right.totalMs - left.totalMs)[0];
  const townMs = current.filter((zone) => zone.town).reduce((sum, zone) => sum + zone.totalMs, 0);

  let largestPbLoss: RunZoneDelta | undefined;
  if (personalBest) {
    const baseline = new Map(runZoneAggregates(personalBest).map((zone) => [zone.areaId, zone]));
    const losses = nonTown.flatMap((zone) => {
      const comparison = baseline.get(zone.areaId);
      if (!comparison) return [];
      const deltaMs = zone.totalMs - comparison.totalMs;
      return deltaMs > 30_000 ? [{ ...zone, baselineMs: comparison.totalMs, deltaMs }] : [];
    });
    largestPbLoss = losses.sort((left, right) => right.deltaMs - left.deltaMs)[0];
  }

  const actDeltas: RunActDelta[] = [];
  if (personalBest) {
    const currentActs = actDurations(session.splits);
    const baselineActs = actDurations(personalBest.splits);
    for (const [act, currentMs] of currentActs) {
      const baselineMs = baselineActs.get(act);
      if (baselineMs === undefined) continue;
      actDeltas.push({ act, currentMs, baselineMs, deltaMs: currentMs - baselineMs });
    }
  }

  return {
    trackedZoneMs,
    uniqueZones: current.length,
    revisitCount,
    townShare: trackedZoneMs > 0 ? townMs / trackedZoneMs : 0,
    mostTime,
    largestPbLoss,
    actDeltas: actDeltas.sort((left, right) => left.act - right.act),
  };
}
