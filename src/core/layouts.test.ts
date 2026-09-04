import { describe, expect, it } from 'vitest';
import { focusHint, hintsForArea, layoutAuditStatus, validateLayoutHints } from './layouts';
import type { LayoutHint } from './types';

const hint = (overrides: Partial<LayoutHint>): LayoutHint => ({
  areaId: '1_1_3',
  text: 'Follow the shoreline.',
  confidence: 'medium',
  ...overrides,
});

describe('audited layout guidance', () => {
  it('prefers reviewed evidence over a higher-confidence unaudited hint', () => {
    const selected = focusHint([
      hint({ text: 'Unaudited high confidence', confidence: 'high', auditStatus: 'unaudited' }),
      hint({ text: 'Reviewed medium confidence', confidence: 'medium', auditStatus: 'reviewed' }),
    ]);
    expect(selected?.text).toBe('Reviewed medium confidence');
  });

  it('never surfaces outdated layout hints in normal area guidance', () => {
    const visible = hintsForArea([
      hint({ text: 'Old route', confidence: 'high', auditStatus: 'outdated' }),
      hint({ text: 'Current route', confidence: 'medium', auditStatus: 'reviewed' }),
    ], '1_1_3');
    expect(visible.map((entry) => entry.text)).toEqual(['Current route']);
  });

  it('normalizes legacy hints to unaudited instead of silently treating them as reviewed', () => {
    const [legacy] = validateLayoutHints([{ areaId: '1_1_3', text: 'Legacy clue', confidence: 'high' }]);
    expect(layoutAuditStatus(legacy)).toBe('unaudited');
  });

  it('ranks verified before reviewed at equal confidence', () => {
    const selected = focusHint([
      hint({ text: 'Reviewed', confidence: 'high', auditStatus: 'reviewed' }),
      hint({ text: 'Verified', confidence: 'high', auditStatus: 'verified' }),
    ]);
    expect(selected?.text).toBe('Verified');
  });
});
