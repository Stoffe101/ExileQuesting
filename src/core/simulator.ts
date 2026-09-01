import { isStepEnabled } from './campaign';
import { parseClientLogLine } from './log-parser';
import { decideProgression } from './progression';
import type { AppSettings, CampaignDataset, CampaignStep, ProgressConfidence, ZoneEvent } from './types';

export type SimulationIssueSeverity = 'error' | 'warning';
export type SimulationEventKind = 'zone' | 'duplicate' | 'display-name' | 'backtrack' | 'manual';

export interface SimulationIssue {
  severity: SimulationIssueSeverity;
  code: string;
  message: string;
  routeIndex: number;
  progress: number;
  areaId?: string;
}

export interface SimulationTraceEntry {
  sequence: number;
  kind: SimulationEventKind;
  routeIndex: number;
  progressBefore: number;
  progressAfter: number;
  event?: ZoneEvent;
  confidence?: ProgressConfidence;
  reason: string;
}

export interface CampaignSimulationReport {
  generatedAt: string;
  routePages: number;
  enabledPages: number;
  finalProgress: number;
  automaticAdvances: number;
  manualAdvances: number;
  duplicateEvents: number;
  backtrackProbes: number;
  maxAutomaticJump: number;
  actsVisited: number[];
  trace: SimulationTraceEntry[];
  issues: SimulationIssue[];
  passed: boolean;
}

export interface CampaignSimulationOptions {
  leagueStart?: boolean;
  bandit?: AppSettings['bandit'];
  showOptional?: boolean;
  injectDuplicates?: boolean;
  injectDisplayNames?: boolean;
  injectBacktracks?: boolean;
}

function routeSettings(options: CampaignSimulationOptions) {
  return {
    leagueStart: options.leagueStart ?? true,
    bandit: options.bandit ?? 'none',
    showOptional: options.showOptional ?? true,
  };
}

function generatedEvent(step: CampaignStep, sequence: number): ZoneEvent | null {
  if (!step.targetAreaId) return null;
  const level = step.areaLevel ?? 1;
  return parseClientLogLine(`2026/09/01 12:${String(sequence % 60).padStart(2, '0')}:00 [DEBUG Client] Generating level ${level} area "${step.targetAreaId}" with seed ${1000 + sequence}`);
}

function enteredEvent(step: CampaignStep, sequence: number): ZoneEvent | null {
  if (!step.targetArea) return null;
  return parseClientLogLine(`2026/09/01 12:${String(sequence % 60).padStart(2, '0')}:01 [INFO Client] You have entered ${step.targetArea}.`);
}

function nextEnabledIndex(indices: number[], current: number, fallback: number): number {
  return indices.find((index) => index > current) ?? fallback;
}

export function simulateCanonicalCampaign(
  dataset: CampaignDataset,
  options: CampaignSimulationOptions = {},
): CampaignSimulationReport {
  const settings = routeSettings(options);
  const enabled = (step: CampaignStep) => isStepEnabled(step, settings);
  const enabledIndices = dataset.steps.map((step, index) => ({ step, index })).filter(({ step }) => enabled(step)).map(({ index }) => index);
  const enabledSet = new Set(enabledIndices);
  const trace: SimulationTraceEntry[] = [];
  const issues: SimulationIssue[] = [];
  const actsVisited = new Set<number>();
  let progress = enabledIndices[0] ?? 0;
  let sequence = 0;
  let automaticAdvances = 0;
  let manualAdvances = 0;
  let duplicateEvents = 0;
  let backtrackProbes = 0;
  let maxAutomaticJump = 0;
  let currentAreaId = '';
  let previousAreaId = '';

  const recordEvent = (kind: SimulationEventKind, routeIndex: number, event: ZoneEvent, allowAdvance: boolean) => {
    const before = progress;
    const decision = decideProgression(dataset.steps, progress, event, {
      isStepEnabled: (step) => enabled(step),
      maxLookAhead: 28,
      recentLookBehind: 3,
    });
    if (decision && allowAdvance) {
      const jump = decision.to - progress;
      maxAutomaticJump = Math.max(maxAutomaticJump, jump);
      if (decision.to < progress) {
        issues.push({ severity: 'error', code: 'backward-auto-progress', message: `Automatic progression moved backwards from ${progress} to ${decision.to}.`, routeIndex, progress, areaId: event.areaId });
      }
      if (decision.to > routeIndex + 1) {
        issues.push({ severity: 'error', code: 'future-skip', message: `Zone event for route page ${routeIndex + 1} skipped ahead to page ${decision.to + 1}.`, routeIndex, progress, areaId: event.areaId });
      }
      progress = Math.max(progress, decision.to);
      automaticAdvances += 1;
    } else if (decision && !allowAdvance) {
      issues.push({ severity: 'error', code: `${kind}-advanced`, message: `${kind} event would unexpectedly advance from ${progress} to ${decision.to}.`, routeIndex, progress, areaId: event.areaId });
    }
    trace.push({
      sequence: sequence++,
      kind,
      routeIndex,
      progressBefore: before,
      progressAfter: progress,
      event,
      confidence: decision?.confidence,
      reason: decision?.reason ?? 'No progression decision.',
    });
  };

  for (const routeIndex of enabledIndices) {
    const step = dataset.steps[routeIndex];
    actsVisited.add(step.act);
    if (progress < routeIndex) {
      const before = progress;
      progress = routeIndex;
      manualAdvances += 1;
      trace.push({ sequence: sequence++, kind: 'manual', routeIndex, progressBefore: before, progressAfter: progress, reason: 'Simulator completed non-zone objectives manually.' });
    }

    const event = generatedEvent(step, sequence);
    const enteringDifferentArea = Boolean(event?.areaId && event.areaId !== currentAreaId);
    if (event && enteringDifferentArea) {
      previousAreaId = currentAreaId;
      recordEvent('zone', routeIndex, event, true);
      currentAreaId = event.areaId ?? currentAreaId;

      if (options.injectDuplicates ?? true) {
        duplicateEvents += 1;
        recordEvent('duplicate', routeIndex, event, false);
      }
      if ((options.injectDisplayNames ?? true) && step.targetArea) {
        const display = enteredEvent(step, sequence);
        if (display) {
          duplicateEvents += 1;
          recordEvent('display-name', routeIndex, display, false);
        }
      }
      if ((options.injectBacktracks ?? true) && previousAreaId && routeIndex % 11 === 0) {
        const oldArea = dataset.areas.find((area) => area.id === previousAreaId);
        const backtrack: ZoneEvent = {
          type: 'area-generated',
          areaId: previousAreaId,
          areaLevel: oldArea?.lvl,
          raw: `SIMULATED BACKTRACK ${previousAreaId}`,
        };
        backtrackProbes += 1;
        recordEvent('backtrack', routeIndex, backtrack, false);
      }
    }

    if (progress <= routeIndex) {
      const before = progress;
      progress = nextEnabledIndex(enabledIndices, routeIndex, Math.min(routeIndex + 1, dataset.steps.length - 1));
      manualAdvances += 1;
      trace.push({ sequence: sequence++, kind: 'manual', routeIndex, progressBefore: before, progressAfter: progress, reason: 'Simulator completed the route page manually because no zone transition completed it.' });
    }

    if (!enabledSet.has(progress) && progress !== dataset.steps.length - 1) {
      issues.push({ severity: 'warning', code: 'disabled-progress-target', message: `Progress landed on disabled route page ${progress + 1}.`, routeIndex, progress });
    }
  }

  const errorCount = issues.filter((issue) => issue.severity === 'error').length;
  if (progress !== dataset.steps.length - 1) {
    issues.push({ severity: 'error', code: 'incomplete-route', message: `Simulation ended at page ${progress + 1}/${dataset.steps.length}.`, routeIndex: dataset.steps.length - 1, progress });
  }

  return {
    generatedAt: new Date().toISOString(),
    routePages: dataset.steps.length,
    enabledPages: enabledIndices.length,
    finalProgress: progress,
    automaticAdvances,
    manualAdvances,
    duplicateEvents,
    backtrackProbes,
    maxAutomaticJump,
    actsVisited: [...actsVisited].sort((a, b) => a - b),
    trace,
    issues,
    passed: errorCount === 0 && progress === dataset.steps.length - 1,
  };
}

export function simulationReportMarkdown(report: CampaignSimulationReport): string {
  const errors = report.issues.filter((issue) => issue.severity === 'error');
  const warnings = report.issues.filter((issue) => issue.severity === 'warning');
  return [
    '# Offline campaign simulation',
    '',
    `Generated: ${report.generatedAt}`,
    '',
    `- Result: **${report.passed ? 'PASS' : 'FAIL'}**`,
    `- Route pages: **${report.routePages}** (${report.enabledPages} enabled for this route profile)`,
    `- Acts visited: **${report.actsVisited.join(', ')}**`,
    `- Automatic advances exercised: **${report.automaticAdvances}**`,
    `- Manual/internal objective completions exercised: **${report.manualAdvances}**`,
    `- Duplicate/display-name events injected: **${report.duplicateEvents}**`,
    `- Backtrack probes injected: **${report.backtrackProbes}**`,
    `- Largest automatic jump: **${report.maxAutomaticJump} page(s)**`,
    `- Errors: **${errors.length}**`,
    `- Warnings: **${warnings.length}**`,
    '',
    '## Issues',
    '',
    ...(report.issues.length
      ? report.issues.map((issue) => `- **${issue.severity.toUpperCase()} · ${issue.code}** page ${issue.routeIndex + 1}: ${issue.message}`)
      : ['No unsafe progression behavior was detected.']),
    '',
    'The simulator intentionally mixes verified internal area IDs, duplicate display-name events, manual objective completion and periodic backtrack probes. It does not replace final in-game testing of GGG log timing or Windows overlay behavior.',
    '',
  ].join('\n');
}
