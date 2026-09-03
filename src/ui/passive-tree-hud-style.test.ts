import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const css = readFileSync(resolve(process.cwd(), 'src/ui/passive-tree-hud.css'), 'utf8');

describe('Passive Tree HUD render budget', () => {
  it('keeps the overlay static instead of running permanent compositor animations', () => {
    expect(css).not.toMatch(/@keyframes\s+passive-/i);
    expect(css).not.toMatch(/filter:\s*drop-shadow/i);
    expect(css).toMatch(/\.passive-tree-hud-root \*[\s\S]*animation:\s*none\s*!important/i);
    expect(css).toMatch(/\.passive-tree-hud-root \*[\s\S]*transition:\s*none\s*!important/i);
  });
});
