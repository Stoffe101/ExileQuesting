import type { ZoneEvent } from './types';

const ENTERED_AREA = /(?:You have entered|You have joined area)\s+(.+?)[.!]?$/i;
const GENERATED_AREA = /Generating level\s+(\d+)\s+area\s+"([^"]+)"(?:\s+with seed\s+(\d+))?/i;
const NAMED_CHARACTER_LEVEL = /\[INFO Client[^\]]*\]\s*:?\s*([^:\r\n]+?)\s+\(([^)]+)\)\s+is now level\s+(\d+)\b/i;
const YOU_CHARACTER_LEVEL = /\bYou\s+(?:are|is)\s+now level\s+(\d+)\b/i;

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

  const namedCharacterLevel = line.match(NAMED_CHARACTER_LEVEL);
  if (namedCharacterLevel) {
    return {
      type: 'character-level',
      characterName: namedCharacterLevel[1]?.trim(),
      characterClass: namedCharacterLevel[2]?.trim(),
      characterLevel: Number(namedCharacterLevel[3]),
      timestamp: timestampFor(line),
      raw: line,
    };
  }

  const youCharacterLevel = line.match(YOU_CHARACTER_LEVEL);
  if (youCharacterLevel) {
    return {
      type: 'character-level',
      characterLevel: Number(youCharacterLevel[1]),
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
    if (event.type === 'area-generated') return event;
    if (event.type !== 'area-entered') continue;
    for (let generatedIndex = index - 1; generatedIndex >= 0; generatedIndex -= 1) {
      const previous = events[generatedIndex];
      if (previous.type === 'area-entered') break;
      if (previous.type === 'area-generated') return { ...event, areaId: previous.areaId, areaLevel: previous.areaLevel };
    }
    return event;
  }
  return undefined;
}
