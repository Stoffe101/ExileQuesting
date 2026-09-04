import type { LayoutAuditStatus, LayoutHint } from './types';

const AUDIT_SCORE: Record<LayoutAuditStatus, number> = {
  verified: 4,
  reviewed: 3,
  unaudited: 2,
  outdated: 0,
};
const CONFIDENCE_SCORE: Record<LayoutHint['confidence'], number> = { high: 3, medium: 2, low: 1 };

export function layoutAuditStatus(hint: LayoutHint): LayoutAuditStatus {
  return hint.auditStatus ?? 'unaudited';
}

export function hintsForArea(hints: LayoutHint[], areaId?: string): LayoutHint[] {
  if (!areaId) return [];
  return hints
    .filter((hint) => hint.areaId === areaId && hint.enabled !== false && layoutAuditStatus(hint) !== 'outdated')
    .sort((left, right) => {
      const audit = AUDIT_SCORE[layoutAuditStatus(right)] - AUDIT_SCORE[layoutAuditStatus(left)];
      if (audit) return audit;
      return CONFIDENCE_SCORE[right.confidence] - CONFIDENCE_SCORE[left.confidence];
    });
}

export function focusHint(hints: LayoutHint[]): LayoutHint | undefined {
  return [...hints]
    .filter((hint) => hint.enabled !== false && layoutAuditStatus(hint) !== 'outdated')
    .sort((left, right) => {
      const audit = AUDIT_SCORE[layoutAuditStatus(right)] - AUDIT_SCORE[layoutAuditStatus(left)];
      if (audit) return audit;
      return CONFIDENCE_SCORE[right.confidence] - CONFIDENCE_SCORE[left.confidence];
    })[0];
}

export function validateLayoutHints(value: unknown): LayoutHint[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((candidate): LayoutHint[] => {
    if (!candidate || typeof candidate !== 'object') return [];
    const hint = candidate as Partial<LayoutHint>;
    if (typeof hint.areaId !== 'string'
      || typeof hint.text !== 'string'
      || !['high', 'medium', 'low'].includes(String(hint.confidence))) return [];
    const auditStatus = ['verified', 'reviewed', 'unaudited', 'outdated'].includes(String(hint.auditStatus))
      ? hint.auditStatus as LayoutAuditStatus
      : 'unaudited';
    return [{ ...hint as LayoutHint, auditStatus }];
  });
}
