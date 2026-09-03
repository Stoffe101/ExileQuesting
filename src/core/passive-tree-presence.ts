import type { ScreenPoint } from './passive-tree-hud';

export interface PassiveTreePresenceOptions {
  minimumCandidates?: number;
  minimumOccupiedCells?: number;
  minimumHorizontalSpan?: number;
  minimumVerticalSpan?: number;
  gridColumns?: number;
  gridRows?: number;
}

export interface PassiveTreePresence {
  visible: boolean;
  candidateCount: number;
  occupiedCells: number;
  horizontalSpan: number;
  verticalSpan: number;
  score: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Cheap pre-registration gate for the in-game passive tree.
 *
 * The passive tree is unusual among PoE screens because it contains many small
 * radial nodes distributed across a large fraction of the client. We use that
 * structural fact rather than a copyrighted screenshot/template. This is only
 * a visibility gate: exact node placement is still proven separately by the
 * geometry registration step.
 */
export function passiveTreePresence(
  candidates: ScreenPoint[],
  width: number,
  height: number,
  options: PassiveTreePresenceOptions = {},
): PassiveTreePresence {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    return { visible: false, candidateCount: 0, occupiedCells: 0, horizontalSpan: 0, verticalSpan: 0, score: 0 };
  }

  const minimumCandidates = Math.max(4, Math.trunc(options.minimumCandidates ?? 11));
  const gridColumns = Math.max(2, Math.min(6, Math.trunc(options.gridColumns ?? 3)));
  const gridRows = Math.max(2, Math.min(6, Math.trunc(options.gridRows ?? 3)));
  const minimumOccupiedCells = Math.max(3, Math.min(gridColumns * gridRows, Math.trunc(options.minimumOccupiedCells ?? 5)));
  const minimumHorizontalSpan = clamp(options.minimumHorizontalSpan ?? 0.36, 0.1, 0.95);
  const minimumVerticalSpan = clamp(options.minimumVerticalSpan ?? 0.32, 0.1, 0.95);

  const bounded = candidates.filter((candidate) => Number.isFinite(candidate.x)
    && Number.isFinite(candidate.y)
    && candidate.x >= 0 && candidate.x <= width
    && candidate.y >= 0 && candidate.y <= height);
  if (!bounded.length) {
    return { visible: false, candidateCount: 0, occupiedCells: 0, horizontalSpan: 0, verticalSpan: 0, score: 0 };
  }

  const xs = bounded.map((candidate) => candidate.x);
  const ys = bounded.map((candidate) => candidate.y);
  const horizontalSpan = (Math.max(...xs) - Math.min(...xs)) / width;
  const verticalSpan = (Math.max(...ys) - Math.min(...ys)) / height;
  const occupied = new Set<string>();
  for (const candidate of bounded) {
    const column = Math.min(gridColumns - 1, Math.max(0, Math.floor((candidate.x / width) * gridColumns)));
    const row = Math.min(gridRows - 1, Math.max(0, Math.floor((candidate.y / height) * gridRows)));
    occupied.add(`${column}:${row}`);
  }

  const candidateScore = clamp(bounded.length / minimumCandidates, 0, 1);
  const cellScore = clamp(occupied.size / minimumOccupiedCells, 0, 1);
  const xScore = clamp(horizontalSpan / minimumHorizontalSpan, 0, 1);
  const yScore = clamp(verticalSpan / minimumVerticalSpan, 0, 1);
  const score = candidateScore * 0.34 + cellScore * 0.28 + xScore * 0.19 + yScore * 0.19;
  const visible = bounded.length >= minimumCandidates
    && occupied.size >= minimumOccupiedCells
    && horizontalSpan >= minimumHorizontalSpan
    && verticalSpan >= minimumVerticalSpan;

  return {
    visible,
    candidateCount: bounded.length,
    occupiedCells: occupied.size,
    horizontalSpan,
    verticalSpan,
    score,
  };
}
