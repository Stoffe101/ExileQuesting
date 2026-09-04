import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('retired Passive Tree HUD runtime', () => {
  const source = readFileSync(path.join(process.cwd(), 'electron', 'main.ts'), 'utf8');

  it('does not create the full-screen Passive Tree HUD window during normal startup', () => {
    expect(source).not.toContain('passiveTreeHudWindow = createPassiveTreeHudWindow();');
  });

  it('does not initialize the Passive Tree HUD service during normal startup', () => {
    expect(source).not.toMatch(/\n\s*initializePassiveTreeHud\(\);/);
  });

  it('documents the migration-only disabled state at startup', () => {
    expect(source).toContain('passiveTreeHudState = passiveTreeHudIdle(false);');
    expect(source).toContain('must never affect capture');
  });
});
