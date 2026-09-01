import type { ZoneEvent } from './types';

const ENTERED_AREA = /(?:You have entered|You have joined area)\s+(.+?)[.!]?$/i;
const GENERATED_AREA = /Generating level\s+(\d+)\s+area\s+"([^"]+)"(?:\s+with seed\s+(\d+))?/i;
const CHARACTER_LEVEL = /(?:is now level|level)\s+(\d+)/i;

export function parseClientLogLine(line: string): ZoneEvent | null {
  const entered = line.match(ENTERED_AREA);
  const generated = line.match(GENERATED_AREA);
  const level = line.match(CHARACTER_LEVEL);
  if (!entered && !generated && !level) return null;

  const timestamp = line.match(/^(\d{4}\/\d{2}\/\d{2}\s+\d{2}:\d{2}:\d{2})/)?.[1];
  return {
    areaName: entered?.[1]?.trim().replace(/[.!]$/, ''),
    areaId: generated?.[2],
    areaLevel: generated ? Number(generated[1]) : undefined,
    characterLevel: level ? Number(level[1]) : undefined,
    timestamp,
    raw: line,
  };
}

