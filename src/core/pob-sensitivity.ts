import type { PobCalculationResult } from './pob-calculation';

export const MAX_POB_SENSITIVITY_SAMPLES = 64;
export const DEFAULT_POB_SLOPE_CHANGE_RATIO = 4;
export const DEFAULT_POB_FLAT_RELATIVE_CHANGE_EPSILON = 1e-6;

export const POB_SENSITIVITY_METRICS = [
  'total-dps',
  'effective-trigger-rate',
  'speed',
  'crit-chance',
  'effective-hit-pool',
  'physical-max-hit',
  'fire-max-hit',
  'cold-max-hit',
  'lightning-max-hit',
  'chaos-max-hit',
] as const;

export type PobSensitivityMetric = typeof POB_SENSITIVITY_METRICS[number];
export type PobBreakpointCandidateKind = 'plateau-onset' | 'plateau-exit' | 'direction-change' | 'slope-change';

export interface PobSensitivityAxis {
  id: string;
  label: string;
  unit?: string;
}

export interface PobSensitivitySample {
  axisValue: number;
  result: PobCalculationResult;
  label?: string;
}

export interface PobObservedSensitivitySample {
  axisValue: number;
  metricValue: number;
  requestId: string;
  label?: string;
}

export interface PobSensitivitySegment {
  fromAxisValue: number;
  toAxisValue: number;
  fromMetricValue: number;
  toMetricValue: number;
  absoluteChange: number;
  percentChange?: number;
  relativeChange: number;
  slope: number;
}

export interface PobBreakpointCandidate {
  kind: PobBreakpointCandidateKind;
  axisValue: number;
  previousSlope: number;
  nextSlope: number;
  slopeRatio?: number;
  evidence: 'derived-candidate';
  reason: string;
}

export interface PobSensitivityAnalysisOptions {
  slopeChangeRatio?: number;
  flatRelativeChangeEpsilon?: number;
}

export interface PobSensitivitySweepInput {
  axis: PobSensitivityAxis;
  metric: PobSensitivityMetric;
  samples: PobSensitivitySample[];
  options?: PobSensitivityAnalysisOptions;
}

export interface PobSensitivityAnalysis {
  axis: PobSensitivityAxis;
  metric: PobSensitivityMetric;
  samples: PobObservedSensitivitySample[];
  segments: PobSensitivitySegment[];
  breakpointCandidates: PobBreakpointCandidate[];
}

const METRIC_READERS: Record<PobSensitivityMetric, (result: PobCalculationResult) => number | undefined> = {
  'total-dps': (result) => result.offence.totalDps ?? result.offence.combinedDps,
  'effective-trigger-rate': (result) => result.offence.effectiveTriggerRate,
  speed: (result) => result.offence.speed,
  'crit-chance': (result) => result.offence.critChance,
  'effective-hit-pool': (result) => result.defence.effectiveHitPool,
  'physical-max-hit': (result) => result.defence.maximumHit?.physical,
  'fire-max-hit': (result) => result.defence.maximumHit?.fire,
  'cold-max-hit': (result) => result.defence.maximumHit?.cold,
  'lightning-max-hit': (result) => result.defence.maximumHit?.lightning,
  'chaos-max-hit': (result) => result.defence.maximumHit?.chaos,
};

function finiteNumber(value: number, name: string): number {
  if (!Number.isFinite(value)) throw new Error(`${name} must be a finite number.`);
  return value;
}

function metricValue(metric: PobSensitivityMetric, result: PobCalculationResult): number {
  const value = METRIC_READERS[metric](result);
  if (value === undefined || !Number.isFinite(value)) {
    throw new Error(`PoB sensitivity metric ${metric} is unavailable for request ${result.requestId}.`);
  }
  return value;
}

function percentChange(before: number, after: number): number | undefined {
  if (before === 0) return undefined;
  return ((after - before) / Math.abs(before)) * 100;
}

function relativeChange(before: number, after: number): number {
  return Math.abs(after - before) / Math.max(Math.abs(before), Math.abs(after), 1);
}

function slopeRatio(a: number, b: number): number | undefined {
  const smaller = Math.min(Math.abs(a), Math.abs(b));
  if (smaller === 0) return undefined;
  return Math.max(Math.abs(a), Math.abs(b)) / smaller;
}

function sign(value: number): -1 | 0 | 1 {
  if (value > 0) return 1;
  if (value < 0) return -1;
  return 0;
}

export function analyzePobSensitivitySweep(input: PobSensitivitySweepInput): PobSensitivityAnalysis {
  if (!input.axis.id.trim() || !input.axis.label.trim()) {
    throw new Error('PoB sensitivity axis id and label must be non-empty.');
  }
  if (!Array.isArray(input.samples) || input.samples.length < 2) {
    throw new Error('PoB sensitivity analysis requires at least two calculation samples.');
  }
  if (input.samples.length > MAX_POB_SENSITIVITY_SAMPLES) {
    throw new Error(`PoB sensitivity analysis accepts at most ${MAX_POB_SENSITIVITY_SAMPLES} samples.`);
  }

  const slopeChangeThreshold = input.options?.slopeChangeRatio ?? DEFAULT_POB_SLOPE_CHANGE_RATIO;
  const flatEpsilon = input.options?.flatRelativeChangeEpsilon ?? DEFAULT_POB_FLAT_RELATIVE_CHANGE_EPSILON;
  finiteNumber(slopeChangeThreshold, 'slopeChangeRatio');
  finiteNumber(flatEpsilon, 'flatRelativeChangeEpsilon');
  if (slopeChangeThreshold <= 1) throw new Error('slopeChangeRatio must be greater than 1.');
  if (flatEpsilon < 0 || flatEpsilon >= 1) throw new Error('flatRelativeChangeEpsilon must be at least 0 and less than 1.');

  const samples = input.samples.map((sample) => ({
    axisValue: finiteNumber(sample.axisValue, 'axisValue'),
    metricValue: metricValue(input.metric, sample.result),
    requestId: sample.result.requestId,
    ...(sample.label ? { label: sample.label } : {}),
  })).sort((a, b) => a.axisValue - b.axisValue);

  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index - 1].axisValue === samples[index].axisValue) {
      throw new Error(`PoB sensitivity axis values must be unique; duplicate ${samples[index].axisValue}.`);
    }
  }

  const segments: PobSensitivitySegment[] = [];
  for (let index = 1; index < samples.length; index += 1) {
    const before = samples[index - 1];
    const after = samples[index];
    const axisDelta = after.axisValue - before.axisValue;
    const absoluteChange = after.metricValue - before.metricValue;
    segments.push({
      fromAxisValue: before.axisValue,
      toAxisValue: after.axisValue,
      fromMetricValue: before.metricValue,
      toMetricValue: after.metricValue,
      absoluteChange,
      percentChange: percentChange(before.metricValue, after.metricValue),
      relativeChange: relativeChange(before.metricValue, after.metricValue),
      slope: absoluteChange / axisDelta,
    });
  }

  const breakpointCandidates: PobBreakpointCandidate[] = [];
  for (let index = 1; index < segments.length; index += 1) {
    const previous = segments[index - 1];
    const next = segments[index];
    const axisValue = samples[index].axisValue;
    const previousFlat = previous.relativeChange <= flatEpsilon;
    const nextFlat = next.relativeChange <= flatEpsilon;

    if (!previousFlat && nextFlat) {
      breakpointCandidates.push({
        kind: 'plateau-onset',
        axisValue,
        previousSlope: previous.slope,
        nextSlope: next.slope,
        evidence: 'derived-candidate',
        reason: `The measured ${input.metric} response becomes flat after axis value ${axisValue}.`,
      });
      continue;
    }

    if (previousFlat && !nextFlat) {
      breakpointCandidates.push({
        kind: 'plateau-exit',
        axisValue,
        previousSlope: previous.slope,
        nextSlope: next.slope,
        evidence: 'derived-candidate',
        reason: `The measured ${input.metric} response leaves a flat region after axis value ${axisValue}.`,
      });
      continue;
    }

    if (!previousFlat && !nextFlat && sign(previous.slope) !== sign(next.slope)) {
      breakpointCandidates.push({
        kind: 'direction-change',
        axisValue,
        previousSlope: previous.slope,
        nextSlope: next.slope,
        evidence: 'derived-candidate',
        reason: `The measured ${input.metric} response changes direction at axis value ${axisValue}.`,
      });
      continue;
    }

    if (!previousFlat && !nextFlat) {
      const ratio = slopeRatio(previous.slope, next.slope);
      if (ratio !== undefined && ratio >= slopeChangeThreshold) {
        breakpointCandidates.push({
          kind: 'slope-change',
          axisValue,
          previousSlope: previous.slope,
          nextSlope: next.slope,
          slopeRatio: ratio,
          evidence: 'derived-candidate',
          reason: `The measured ${input.metric} response slope changes by ${ratio.toFixed(2)}x at axis value ${axisValue}.`,
        });
      }
    }
  }

  return {
    axis: { ...input.axis },
    metric: input.metric,
    samples,
    segments,
    breakpointCandidates,
  };
}
