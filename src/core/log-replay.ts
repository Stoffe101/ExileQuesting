import { parseClientLogLine } from './log-parser';
import { LogLineBuffer } from './log-stream';
import { decideProgression, type ProgressionOptions } from './progression';
import type { CampaignStep, ZoneEvent } from './types';

export interface LogReplayDecision {
  event: ZoneEvent;
  progressBefore: number;
  progressAfter: number;
  reason: string;
}

export interface LogReplayReport {
  chunks: number;
  lines: number;
  parsedEvents: number;
  finalProgress: number;
  decisions: LogReplayDecision[];
  errors: string[];
}

export function deterministicChunks(text: string, seed = 0x5eed, maxChunk = 37): string[] {
  let state = seed >>> 0;
  const chunks: string[] = [];
  let offset = 0;
  while (offset < text.length) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const size = 1 + (state % Math.max(1, maxChunk));
    chunks.push(text.slice(offset, offset + size));
    offset += size;
  }
  return chunks;
}

export function replayClientLogChunks(
  chunks: string[],
  steps: CampaignStep[],
  initialProgress = 0,
  progressionOptions: ProgressionOptions = {},
): LogReplayReport {
  const buffer = new LogLineBuffer();
  const decisions: LogReplayDecision[] = [];
  const errors: string[] = [];
  let progress = initialProgress;
  let lines = 0;
  let parsedEvents = 0;

  const consume = (line: string) => {
    lines += 1;
    const event = parseClientLogLine(line);
    if (!event) return;
    parsedEvents += 1;
    if (event.type === 'character-level') return;
    const before = progress;
    const decision = decideProgression(steps, progress, event, progressionOptions);
    if (decision) progress = decision.to;
    if (progress < before) errors.push(`Progress regressed from ${before} to ${progress} for ${event.raw}`);
    decisions.push({
      event,
      progressBefore: before,
      progressAfter: progress,
      reason: decision?.reason ?? 'No matching route transition.',
    });
  };

  for (const chunk of chunks) {
    for (const line of buffer.push(chunk)) consume(line);
  }
  const pending = buffer.pending();
  if (pending) consume(pending);

  return { chunks: chunks.length, lines, parsedEvents, finalProgress: progress, decisions, errors };
}

export function buildNoisyLog(events: ZoneEvent[], duplicateEvery = 3): string {
  const lines: string[] = ['garbage before any useful event', '[INFO] unrelated renderer-style text'];
  events.forEach((event, index) => {
    lines.push(`noise ${index} ${'x'.repeat(index % 17)}`);
    lines.push(event.raw);
    if (index % duplicateEvery === 0) lines.push(event.raw);
    if (event.type === 'area-generated') lines.push(`2026/09/01 13:00:00 [INFO Client] harmless line level ${event.areaLevel ?? 1}`);
  });
  lines.push('trailing garbage without a newline');
  return `${lines.join('\n')}\n`;
}
