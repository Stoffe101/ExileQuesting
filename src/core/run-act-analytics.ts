import { elapsedRunMs } from './run';
import type { ActSplit, RunHistoryEntry, RunSession } from './types';

export interface RunActPace {
  act: number;
  elapsedMs: number;
  cumulativeMs: number;
  complete: boolean;
  previousMs?: number;
  personalBestMs?: number;
  deltaVsPreviousMs?: number;
  deltaVsPersonalBestMs?: number;
  cumulativeDeltaVsPreviousMs?: number;
  cumulativeDeltaVsPersonalBestMs?: number;
}

export interface RunActPaceInsight {
  kind: 'regression' | 'gain' | 'pace';
  tone: 'attention' | 'good' | 'neutral';
  title: string;
  detail: string;
  act?: number;
  deltaMs?: number;
}

export interface RunActAnalytics {
  acts: RunActPace[];
  completedActs: number;
  currentAct?: number;
  biggestRegression?: RunActPace;
  biggestGain?: RunActPace;
  latestCompleted?: RunActPace;
  insights: RunActPaceInsight[];
}

interface ActTiming {
  act: number;
  elapsedMs: number;
  cumulativeMs: number;
  complete: boolean;
}

function compactDuration(milliseconds: number): string {
  const seconds = Math.max(0, Math.round(Math.abs(milliseconds) / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainder = seconds % 60;
  return minutes > 0 ? `${minutes}:${String(remainder).padStart(2, '0')}` : `${remainder}s`;
}

function signedDuration(milliseconds: number): string {
  if (milliseconds === 0) return 'even';
  return `${milliseconds > 0 ? '+' : '-'}${compactDuration(milliseconds)}`;
}

function normalizedSplits(splits: ActSplit[]): ActSplit[] {
  return [...splits]
    .filter((split) => Number.isInteger(split.act) && split.act >= 1 && split.act <= 10 && Number.isFinite(split.elapsedMs) && split.elapsedMs >= 0)
    .sort((left, right) => left.act - right.act)
    .filter((split, index, all) => all.findIndex((candidate) => candidate.act === split.act) === index);
}

function baseTimings(splits: ActSplit[]): ActTiming[] {
  const timings: ActTiming[] = [];
  let previousCumulative = 0;
  for (const split of normalizedSplits(splits)) {
    const cumulativeMs = Math.max(previousCumulative, split.elapsedMs);
    timings.push({
      act: split.act,
      elapsedMs: Math.max(0, cumulativeMs - previousCumulative),
      cumulativeMs,
      complete: true,
    });
    previousCumulative = cumulativeMs;
  }
  return timings;
}

function sessionTimings(session: RunSession, now: number): ActTiming[] {
  const timings = baseTimings(session.splits);
  const currentAct = session.currentAct;
  if (!currentAct || currentAct < 1 || currentAct > 10) return timings;

  // A split for an Act is comparison-safe only after the run has transitioned
  // into a later Act. finishRun() also writes the current Act as a final split,
  // but the user can press Finish mid-Act, so that last segment is not proof of
  // Act completion and must stay non-comparable.
  for (const timing of timings) timing.complete = timing.act < currentAct;

  if (!timings.some((timing) => timing.act === currentAct)) {
    const previousCumulative = timings.at(-1)?.cumulativeMs ?? 0;
    const cumulativeMs = Math.max(previousCumulative, elapsedRunMs(session, now));
    timings.push({
      act: currentAct,
      elapsedMs: Math.max(0, cumulativeMs - previousCumulative),
      cumulativeMs,
      complete: false,
    });
  }
  return timings.sort((left, right) => left.act - right.act);
}

function historyTimings(entry?: RunHistoryEntry): Map<number, ActTiming> {
  if (!entry) return new Map();
  const timings = baseTimings(entry.splits);
  // RunHistoryEntry intentionally stores raw split facts rather than duplicated
  // analytics. finishRun() writes the active Act as the final split even when the
  // player ends mid-Act, so only splits followed by a later Act boundary are
  // historically proven complete. The final split remains visible as baseline
  // context but is never used for a scored comparison.
  if (timings.length > 0) timings[timings.length - 1].complete = false;
  return new Map(timings.map((timing) => [timing.act, timing]));
}

function buildInsights(acts: RunActPace[], active: boolean): RunActPaceInsight[] {
  const comparable = acts.filter((act) => act.complete && act.deltaVsPreviousMs !== undefined);
  const biggestRegression = [...comparable].sort((left, right) => (right.deltaVsPreviousMs ?? 0) - (left.deltaVsPreviousMs ?? 0))[0];
  const biggestGain = [...comparable].sort((left, right) => (left.deltaVsPreviousMs ?? 0) - (right.deltaVsPreviousMs ?? 0))[0];
  const latest = comparable.at(-1);
  const insights: RunActPaceInsight[] = [];

  if (biggestRegression && (biggestRegression.deltaVsPreviousMs ?? 0) >= 45_000) {
    insights.push({
      kind: 'regression',
      tone: 'attention',
      title: `Act ${biggestRegression.act} was your biggest slowdown`,
      detail: `${signedDuration(biggestRegression.deltaVsPreviousMs ?? 0)} versus the same Act in your previous run.`,
      act: biggestRegression.act,
      deltaMs: biggestRegression.deltaVsPreviousMs,
    });
  }

  if (biggestGain && (biggestGain.deltaVsPreviousMs ?? 0) <= -45_000) {
    insights.push({
      kind: 'gain',
      tone: 'good',
      title: `Act ${biggestGain.act} gained the most time`,
      detail: `${compactDuration(biggestGain.deltaVsPreviousMs ?? 0)} faster than your previous run.`,
      act: biggestGain.act,
      deltaMs: biggestGain.deltaVsPreviousMs,
    });
  }

  if (active && latest?.cumulativeDeltaVsPreviousMs !== undefined) {
    const delta = latest.cumulativeDeltaVsPreviousMs;
    insights.push({
      kind: 'pace',
      tone: delta <= 0 ? 'good' : 'neutral',
      title: `Through Act ${latest.act}: ${signedDuration(delta)}`,
      detail: delta <= 0
        ? 'Your completed-Act pace is ahead of your previous run.'
        : 'Your completed-Act pace is behind your previous run. The current Act is not compared until a later Act transition confirms completion.',
      act: latest.act,
      deltaMs: delta,
    });
  }

  return insights.slice(0, 3);
}

export function buildRunActAnalytics(
  session: RunSession,
  previous?: RunHistoryEntry,
  personalBestReference?: RunHistoryEntry,
  now = Date.now(),
): RunActAnalytics {
  const current = sessionTimings(session, now);
  const previousActs = historyTimings(previous);
  const pbActs = historyTimings(personalBestReference);

  const acts: RunActPace[] = current.map((timing) => {
    const previousTiming = previousActs.get(timing.act);
    const pbTiming = pbActs.get(timing.act);
    const comparable = timing.complete;
    const previousComparable = previousTiming?.complete === true;
    const pbComparable = pbTiming?.complete === true;
    return {
      ...timing,
      previousMs: previousComparable ? previousTiming.elapsedMs : undefined,
      personalBestMs: pbComparable ? pbTiming.elapsedMs : undefined,
      deltaVsPreviousMs: comparable && previousComparable ? timing.elapsedMs - previousTiming.elapsedMs : undefined,
      deltaVsPersonalBestMs: comparable && pbComparable ? timing.elapsedMs - pbTiming.elapsedMs : undefined,
      cumulativeDeltaVsPreviousMs: comparable && previousComparable ? timing.cumulativeMs - previousTiming.cumulativeMs : undefined,
      cumulativeDeltaVsPersonalBestMs: comparable && pbComparable ? timing.cumulativeMs - pbTiming.cumulativeMs : undefined,
    };
  });

  const completed = acts.filter((act) => act.complete);
  const comparable = completed.filter((act) => act.deltaVsPreviousMs !== undefined);
  const biggestRegression = [...comparable].sort((left, right) => (right.deltaVsPreviousMs ?? 0) - (left.deltaVsPreviousMs ?? 0))[0];
  const biggestGain = [...comparable].sort((left, right) => (left.deltaVsPreviousMs ?? 0) - (right.deltaVsPreviousMs ?? 0))[0];
  const active = session.state === 'running' || session.state === 'paused';

  return {
    acts,
    completedActs: completed.length,
    currentAct: session.currentAct,
    biggestRegression: biggestRegression && (biggestRegression.deltaVsPreviousMs ?? 0) > 0 ? biggestRegression : undefined,
    biggestGain: biggestGain && (biggestGain.deltaVsPreviousMs ?? 0) < 0 ? biggestGain : undefined,
    latestCompleted: completed.at(-1),
    insights: buildInsights(acts, active),
  };
}
