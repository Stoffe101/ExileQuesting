import { describe, expect, it } from 'vitest';
import { normalizeProgressDocument, normalizeRewardDocument, normalizeRunDocument, normalizeSettingsDocument, parseBoundedJson } from './persistence';
import type { AppSettings } from './types';

const defaults: AppSettings = {
  logPath: '', guidanceMode: 'beginner', leagueStart: true, bandit: 'none', showOptional: true, autoAdvance: true, autoShowOnZoneChange: true,
  overlayOpacity: 0.94, overlayScale: 1, overlayClickThrough: false, overlayMode: 'focus',
  overlayTypography: { preset: 'default', objective: 21, actions: 15, guidance: 13, labels: 10, status: 10, density: 'comfortable' },
  overlayPosition: { preset: 'top-right', locked: false, snapToEdges: true }, overlayAutoCollapse: true, overlayAutoCollapseSeconds: 5,
  reducedMotion: false, reducedTransparency: false, onboardingComplete: false, launchMinimized: false, autoCheckAppUpdates: true,
  autoDownloadAppUpdates: false, autoStartRunTimer: true, showRunTimerInOverlay: true,
  hotkeys: { toggleOverlay: 'Ctrl+H', nextStep: 'Right', previousStep: 'Left', toggleInteraction: 'Ctrl+I', cycleOverlayMode: 'Ctrl+M' },
};

describe('persistence migrations', () => {
  it('loads a sparse legacy settings document with current defaults', () => {
    const result = normalizeSettingsDocument({ guidanceMode: 'racer', overlayOpacity: 0.7 }, defaults);
    expect(result.guidanceMode).toBe('racer');
    expect(result.overlayOpacity).toBe(0.7);
    expect(result.overlayTypography).toEqual(defaults.overlayTypography);
    expect(result.hotkeys).toEqual(defaults.hotkeys);
  });

  it('clamps hostile/extreme settings instead of trusting persisted JSON', () => {
    const result = normalizeSettingsDocument({ overlayScale: 999, overlayOpacity: -4, overlayTypography: { objective: 999 }, overlayPosition: { x: 9e99, y: -9e99 } }, defaults);
    expect(result.overlayScale).toBe(2);
    expect(result.overlayOpacity).toBe(0.35);
    expect(result.overlayTypography.objective).toBe(34);
    expect(result.overlayPosition.x).toBe(100_000);
    expect(result.overlayPosition.y).toBe(-100_000);
  });

  it('drops malformed history and clamps old progress to the current dataset', () => {
    const result = normalizeProgressDocument({ progress: 9999, history: [{ nope: true }, { id: 'ok', at: 'now', from: 1, to: 2, reason: 'test', confidence: 'manual', automatic: false }] }, 227);
    expect(result.progress).toBe(227);
    expect(result.history).toHaveLength(1);
  });

  it('recovers malformed run state safely', () => {
    expect(normalizeRunDocument({ session: { state: 'wat' }, history: [{ broken: true }] }).session.state).toBe('idle');
    expect(normalizeRunDocument({ session: { state: 'running', pausedMs: -2, townTimeMs: -4, splits: [] } }).session.pausedMs).toBe(0);
  });

  it('filters reward confirmations against known current step IDs', () => {
    expect([...normalizeRewardDocument({ confirmedStepIds: ['good', 'stale'] }, new Set(['good']))]).toEqual(['good']);
  });

  it('rejects oversized JSON before parsing it', () => {
    expect(() => parseBoundedJson(JSON.stringify({ x: 'a'.repeat(100) }), 20)).toThrow(/exceeds/);
  });
});
