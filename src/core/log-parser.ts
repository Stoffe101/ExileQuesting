import type { ZoneEvent } from './types';

const ENTERED_AREA = /(?:You have entered|You have joined area)\s+(.+?)[.!]?$/i;
const GENERATED_AREA = /Generating level\s+(\d+)\s+area\s+"([^"]+)"(?:\s+with seed\s+(\d+))?/i;
const CHARACTER_LEVEL = /\b(?:You|[^\[\]:]+\([^\)]+\))\s+is now level\s+(\d+)\b/i;

function timestampFor(line: string): string | undefined {
  return line.match(/^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/)?.[1];
}

export function parseClientLogLine(line: string): ZoneEvent | null {
  const generated = line.match(GENERATED_AREA);
  if (generated) {
    return {
      type: 'area-generated',
      areaId: generated[2],
      areaLevel: Number(generated[1]),
      timestamp: timestampFor(line),
      raw: line,
    };
  }

  const entered = line.match(ENTERED_AREA);
  if (entered) {
    return {
      type: 'area-entered',
      areaName: entered[1]?.trim().replace(/[.!]$/, ''),
      timestamp: timestampFor(line),
      raw: line,
    };
  }

  const characterLevel = line.match(CHARACTER_LEVEL);
  if (characterLevel) {
    return {
      type: 'character-level',
      characterLevel: Number(characterLevel[1]),
      timestamp: timestampFor(line),
      raw: line,
    };
  }

  return null;
}

export function parseLogTail(content: string): ZoneEvent[] {
  return content
    .split(/\r?\n/)
    .map(parseClientLogLine)
    .filter((event): event is ZoneEvent => Boolean(event));
}

export function latestZoneEvent(events: ZoneEvent[]): ZoneEvent | undefined {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.type === 'area-generated' || event.type === 'area-entered') return event;
  }
  return undefined;
}
