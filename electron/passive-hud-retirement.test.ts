import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('retired Passive Tree HUD runtime', () => {
  const source = readFileSync(path.join(process.cwd(), 'electron', 'main.ts'), 'utf8');
  const renderer = readFileSync(path.join(process.cwd(), 'src', 'ui', 'App.tsx'), 'utf8');
  const packageJson = readFileSync(path.join(process.cwd(), 'package.json'), 'utf8');

  it('contains no Passive Tree HUD BrowserWindow or capture service runtime', () => {
    for (const token of ['PassiveTreeHudService', 'passiveTreeHudWindow', 'createPassiveTreeHudWindow', 'initializePassiveTreeHud', 'setContentProtection(true)']) {
      expect(source, token).not.toContain(token);
    }
  });

  it('contains no Passive Tree HUD renderer mode or visual command', () => {
    expect(renderer).not.toContain("mode === 'passive-tree-hud'");
    expect(renderer).not.toContain('PassiveTreeHudOverlay');
    expect(packageJson).not.toContain('visual:passive-hud');
  });

  it('removes HUD-only implementation files from the shipping source tree', () => {
    for (const relative of [
      'electron/services/passive-tree-hud.ts',
      'src/ui/PassiveTreeHudOverlay.tsx',
      'src/ui/passive-tree-hud.css',
      'tools/visual-passive-tree-hud.ts',
    ]) expect(existsSync(path.join(process.cwd(), relative)), relative).toBe(false);
  });

  it('forces legacy persisted HUD flags off while retaining schema compatibility', () => {
    expect(source).toContain('passiveTreeHudState = passiveTreeHudIdle(false);');
    expect(source).toContain('settings.passiveTreeHudEnabled = false;');
    expect(source).toContain('settings.passiveTreeHudPathPreview = false;');
  });
});
