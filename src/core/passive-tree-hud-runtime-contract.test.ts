import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const service = readFileSync('electron/services/passive-tree-hud.ts', 'utf8');
const entry = readFileSync('electron/main-entry.ts', 'utf8');
const capturePolicy = readFileSync('electron/services/capture-safe-policy.ts', 'utf8');

describe('Passive Tree HUD runtime contract', () => {
  it('does not continuously capture or visually detect the game', () => {
    expect(service).not.toContain('desktopCapturer');
    expect(service).not.toContain('detectPassiveTreeNodeCandidates');
    expect(service).not.toContain('registerPassiveTreePointCloud');
    expect(service).not.toContain('capturePoeWindow');
  });

  it('is explicitly toggled and calibrated instead of auto-showing on PoE launch', () => {
    expect(service).toContain("const TOGGLE_HOTKEY = 'CommandOrControl+Shift+P'");
    expect(service).toContain("const RECENTER_HOTKEY = 'CommandOrControl+Shift+C'");
    expect(service).toContain('private requestedVisible = false');
    expect(service).toContain('this.requestedVisible = !this.requestedVisible');
  });

  it('keeps ExileQuesting visible to normal screen-capture software', () => {
    expect(entry).toContain('installCaptureSafeWindowPolicy();');
    expect(capturePolicy).toContain('nativeSetContentProtection.call(this, false)');
    expect(capturePolicy).not.toContain('nativeSetContentProtection.call(this, true)');
  });
});
