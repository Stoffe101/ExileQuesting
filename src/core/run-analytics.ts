import type {
  RunAnalytics,
  RunHistoryEntry,
  RunInsight,
  RunSession,
  RunZoneSummary,
  RunZoneVisit,
} from './types';

function finiteTimestamp(value?: string): number | undefined {
  if (!value) return undefined;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function runTotalMs(session: RunSession, now: number): number {
  const started = finiteTimestamp(session.startedAt);
  if (started === undefined) return 0;
  const finished = finiteTimestamp(session.finishedAt);
  const paused = session.state === 'paused' ? finiteTimestamp(session.pausedAt) : undefined;
  const end = finished ?? paused ?? now;
  return Math.max(0, end - started - Math.max(0, session.pausedMs));
}

function effectiveVisits(session: RunSession, now: number): RunZoneVisit[] {
  const visits = (session.visits ?? []).map((visit) => ({ ...visit }));
  if (session.state !== 'running' || !session.activeVisitStartedAt || !visits.length) return visits;
  const started = finiteTimestamp(session.activeVisitStartedAt);
  if (started === undefined) return visits;
  const active = visits.at(-1);
  if (!active || active.areaId !== session.lastAreaId) return visits;
  active.durationMs += Math.max(0, now - started);
  return visits;
}

function summarizeVisits(visits: RunZoneVisit[]): RunZoneSummary[] {
  const byArea = new Map<string, RunZoneSummary>();
  for (const visit of visits) {
    const current = byArea.get(visit.areaId) ?? {
      areaId: visit.areaId,
      areaName: visit.areaName,
      act: visit.act,
      totalMs: 0,
      firstVisitMs: 0,
      revisitMs: 0,
      visits: 0,
      town: visit.town,
    };
    current.areaName = visit.areaName ?? current.areaName;
    current.act = visit.act ?? current.act;
    current.totalMs += Math.max(0, visit.durationMs);
    current.visits += 1;
    if (visit.revisit) current.revisitMs += Math.max(0, visit.durationMs);
    else current.firstVisitMs += Math.max(0, visit.durationMs);
    current.town ||= visit.town;
    byArea.set(visit.areaId, current);
  }
  return [...byArea.values()];
}

function historySummaries(entry?: RunHistoryEntry): Map<string, RunZoneSummary> {
  return new Map(summarizeVisits(entry?.visits ?? []).map((summary) => [summary.areaId, summary]));
}

function areaLabel(zone: RunZoneSummary): string {
  return zone.areaName?.trim() || zone.areaId;
}

function compactDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(Math.abs(milliseconds) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}:${String(remainder).padStart(2, '0')}` : `${remainder}s`;
}

function deltaText(milliseconds: number): string {
  return `${milliseconds >= 0 ? '+' : '-'}${compactDuration(milliseconds)}`;
}

function buildInsights(
  session: RunSession,
  zones: RunZoneSummary[],
  revisitCount: number,
  revisitMs: number,
  townTimeMs: number,
  townShare: number,
  currentTotalMs: number,
  previous?: RunHistoryEntry,
  personalBestReference?: RunHistoryEntry,
): RunInsight[] {
  const insights: RunInsight[] = [];

  if (session.state === 'finished' && personalBestReference && currentTotalMs < personalBestReference.totalMs) {
    const saved = personalBestReference.totalMs - currentTotalMs;
    insights.push({
      id: 'pace:new-pb',
      kind: 'pace',
      tone: 'good',
      title: 'New personal best',
      detail: `You finished ${compactDuration(saved)} faster than your previous best.`,
      metricMs: saved,
    });
  } else if (session.state === 'finished' && previous) {
    const delta = currentTotalMs - previous.totalMs;
    insights.push({
      id: 'pace:previous',
      kind: 'pace',
      tone: delta <= 0 ? 'good' : 'neutral',
      title: delta <= 0 ? 'Faster than previous run' : 'Previous run was faster',
      detail: `${deltaText(delta)} compared with your previous completed campaign.`,
      metricMs: Math.abs(delta),
    });
  }

  const regression = zones
    .filter((zone) => !zone.town && zone.deltaVsPreviousMs !== undefined && zone.deltaVsPreviousMs >= 45_000 && zone.totalMs >= 60_000)
    .sort((left, right) => (right.deltaVsPreviousMs ?? 0) - (left.deltaVsPreviousMs ?? 0))[0];
  if (regression) {
    insights.push({
      id: `slow:${regression.areaId}`,
      kind: 'slow-zone',
      tone: 'attention',
      title: 'Biggest zone regression',
      detail: `${areaLabel(regression)} took ${compactDuration(regression.deltaVsPreviousMs ?? 0)} longer than your previous run.`,
      metricMs: regression.deltaVsPreviousMs,
    });
  }

  if (revisitCount > 0 && revisitMs >= 60_000) {
    const repeated = zones
      .filter((zone) => !zone.town && zone.revisitMs > 0)
      .sort((left, right) => right.revisitMs - left.revisitMs)
      .slice(0, 2)
      .map(areaLabel)
      .join(' and ');
    insights.push({
      id: 'route:revisits',
      kind: 'revisit',
      tone: 'attention',
      title: 'Revisit time is adding up',
      detail: `${compactDuration(revisitMs)} was spent on repeat area visits${repeated ? `, led by ${repeated}` : ''}. Some route returns are intentional, so treat this as a review signal rather than an automatic mistake.`,
      metricMs: revisitMs,
    });
  }

  if (townTimeMs >= 180_000 && townShare >= 0.18) {
    insights.push({
      id: 'route:town-share',
      kind: 'town',
      tone: 'attention',
      title: 'Town time is a large slice',
      detail: `${Math.round(townShare * 100)}% of tracked area time was spent in town (${compactDuration(townTimeMs)}). Vendor, stash and gem sequencing are the easiest places to inspect first.`,
      metricMs: townTimeMs,
    });
  }

  if (!insights.some((insight) => insight.tone === 'attention') && zones.filter((zone) => !zone.town).length >= 10 && revisitCount === 0) {
    insights.push({
      id: 'route:clean',
      kind: 'revisit',
      tone: 'good',
      title: 'Clean route trace',
      detail: 'No repeat non-town area visits have been recorded in this run so far.',
    });
  }

  return insights.slice(0, 4);
}

export function buildRunAnalytics(
  session: RunSession,
  previous?: RunHistoryEntry,
  personalBestReference?: RunHistoryEntry,
  now = Date.now(),
): RunAnalytics {
  const visits = effectiveVisits(session, now);
  const previousByArea = historySummaries(previous);
  const pbByArea = historySummaries(personalBestReference);
  const zones = summarizeVisits(visits).map((zone) => {
    const previousZone = previousByArea.get(zone.areaId);
    const pbZone = pbByArea.get(zone.areaId);
    return {
      ...zone,
      previousMs: previousZone?.totalMs,
      personalBestMs: pbZone?.totalMs,
      deltaVsPreviousMs: previousZone ? zone.totalMs - previousZone.totalMs : undefined,
      deltaVsPersonalBestMs: pbZone ? zone.totalMs - pbZone.totalMs : undefined,
    };
  });

  const nonTownVisits = visits.filter((visit) => !visit.town);
  const zoneTimeMs = nonTownVisits.reduce((sum, visit) => sum + Math.max(0, visit.durationMs), 0);
  const revisitVisits = nonTownVisits.filter((visit) => visit.revisit);
  const revisitMs = revisitVisits.reduce((sum, visit) => sum + Math.max(0, visit.durationMs), 0);
  const townFromVisits = visits.filter((visit) => visit.town).reduce((sum, visit) => sum + Math.max(0, visit.durationMs), 0);
  const townTimeMs = Math.max(session.townTimeMs, townFromVisits);
  const trackedMs = zoneTimeMs + townTimeMs;
  const currentTotalMs = runTotalMs(session, now);
  const newPersonalBest = session.state === 'finished'
    && currentTotalMs > 0
    && Boolean(personalBestReference)
    && currentTotalMs < (personalBestReference?.totalMs ?? Number.POSITIVE_INFINITY);

  const slowestZones = zones
    .filter((zone) => !zone.town && zone.totalMs > 0)
    .sort((left, right) => right.totalMs - left.totalMs)
    .slice(0, 5);

  return {
    zoneTimeMs,
    uniqueZones: new Set(visits.map((visit) => visit.areaId)).size,
    transitions: Math.max(0, visits.length - 1),
    revisitCount: revisitVisits.length,
    revisitMs,
    townTimeMs,
    townShare: trackedMs > 0 ? townTimeMs / trackedMs : 0,
    zones: zones.sort((left, right) => right.totalMs - left.totalMs),
    slowestZones,
    insights: buildInsights(session, zones, revisitVisits.length, revisitMs, townTimeMs, trackedMs > 0 ? townTimeMs / trackedMs : 0, currentTotalMs, previous, personalBestReference),
    totalDeltaVsPreviousMs: session.state === 'finished' && previous ? currentTotalMs - previous.totalMs : undefined,
    totalDeltaVsPersonalBestMs: session.state === 'finished' && personalBestReference ? currentTotalMs - personalBestReference.totalMs : undefined,
    newPersonalBest,
  };
}
