import type { LayoutHint } from './types';

export function hintsForArea(hints: LayoutHint[], areaId?: string): LayoutHint[] {
  if (!areaId) return [];
  return hints.filter((hint) => hint.areaId === areaId && hint.enabled !== false);
}

export function focusHint(hints: LayoutHint[]): LayoutHint | undefined {
  return hints.find((hint) => hint.confidence === 'high') ?? hints.find((hint) => hint.confidence === 'medium');
}

export function validateLayoutHints(value: unknown): LayoutHint[] {
  if (!Array.isArray(value)) return [];
  return value.filter((candidate): candidate is LayoutHint => {
    if (!candidate || typeof candidate !== 'object') return false;
    const hint = candidate as Partial<LayoutHint>;
    return typeof hint.areaId === 'string'
      && typeof hint.text === 'string'
      && ['high', 'medium', 'low'].includes(String(hint.confidence));
  });
}
