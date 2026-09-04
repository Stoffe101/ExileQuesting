import { readFile, writeFile } from 'node:fs/promises';

async function rewrite(path, transform) {
  const before = await readFile(path, 'utf8');
  const after = transform(before);
  if (after === before) throw new Error(`${path}: cleanup made no changes.`);
  await writeFile(path, after, 'utf8');
}

await rewrite('electron/main.ts', (input) => {
  let text = input;
  text = text.replace('  screen,\n', '');
  text = text.replace("import { PassiveTreeHudService, type PassiveTreeHudContext } from './services/passive-tree-hud';\n", '');
  text = text.replace("import { buildPassiveTreeGuidePlan } from '../src/core/passive-tree-guide';\n", '');
  text = text.replace('passiveTreeHudEnabled: true, passiveTreeHudPathPreview: true', 'passiveTreeHudEnabled: false, passiveTreeHudPathPreview: false');
  text = text.replace('let passiveTreeHudWindow: BrowserWindow | null = null;\n', '');
  text = text.replace('let passiveTreeHudService: PassiveTreeHudService | null = null;\n', '');
  text = text.replace('let passiveTreeHudState: PassiveTreeHudState = passiveTreeHudIdle(true);', 'let passiveTreeHudState: PassiveTreeHudState = passiveTreeHudIdle(false);');

  const loadSettings = '  settings = await store.loadSettings(DEFAULT_SETTINGS);';
  if (!text.includes(loadSettings)) throw new Error('settings load marker missing');
  text = text.replace(loadSettings, `${loadSettings}\n  // Passive Tree HUD was retired by Campaign Guide 2. Legacy keys remain only for settings migration.\n  settings.passiveTreeHudEnabled = false;\n  settings.passiveTreeHudPathPreview = false;`);

  const runtimeBlock = /\nfunction passiveTreeHudContext\(\): PassiveTreeHudContext \{[\s\S]*?\n\}\n\nfunction rebuildBuildGuidance\(\): void \{/;
  if (!runtimeBlock.test(text)) throw new Error('passive HUD runtime block missing');
  text = text.replace(runtimeBlock, '\nfunction rebuildBuildGuidance(): void {');
  text = text.replace('  passiveTreeHudService?.poke();\n', '');
  text = text.replace("  if (passiveTreeHudWindow && !passiveTreeHudWindow.isDestroyed()) passiveTreeHudWindow.webContents.send('state:changed', real);\n", '');

  const windowBlock = /\nfunction createPassiveTreeHudWindow\(\): BrowserWindow \{[\s\S]*?\n\}\nfunction toggleOverlay/;
  if (!windowBlock.test(text)) throw new Error('passive HUD BrowserWindow block missing');
  text = text.replace(windowBlock, '\nfunction toggleOverlay');
  text = text.replace("mode: 'manager' | 'overlay' | 'lab' | 'passive-tree-hud'", "mode: 'manager' | 'overlay' | 'lab'");

  text = text.replace(/\n    if \(safePatch\.passiveTreeHudEnabled !== undefined \|\| safePatch\.passiveTreeHudPathPreview !== undefined\) \{[\s\S]*?\n    \}/, '');
  text = text.replace('  passiveTreeHudService?.stop();\n', '');

  for (const token of ['PassiveTreeHudService', 'passiveTreeHudWindow', 'createPassiveTreeHudWindow', 'initializePassiveTreeHud', 'setContentProtection(true)']) {
    if (text.includes(token)) throw new Error(`retired HUD token survived in main.ts: ${token}`);
  }
  return text;
});

await rewrite('src/ui/App.tsx', (input) => input
  .replace("import PassiveTreeHudOverlay from './PassiveTreeHudOverlay';\n", '')
  .replace("  if (mode === 'passive-tree-hud') return <PassiveTreeHudOverlay state={state} />;\n", ''));

await rewrite('src/main.tsx', (input) => input.replace("import './ui/passive-tree-hud.css';\n", ''));

await rewrite('package.json', (input) => {
  const text = input.replace(/^\s*"visual:passive-hud":.*\n/m, '');
  JSON.parse(text);
  return text;
});

console.log('Retired Passive Tree HUD runtime and renderer references removed.');
