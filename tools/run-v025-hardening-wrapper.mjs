import { execFileSync } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const input = 'tools/apply-v025-character-hardening.mjs';
let source = await readFile(input, 'utf8');

const fixes = [
  [
    "reason: `Current zone is ${nearest} route step${nearest === 1 ? '' : 's'} from this saved character cursor.`",
    "reason: 'Current zone is ' + nearest + ' route step' + (nearest === 1 ? '' : 's') + ' from this saved character cursor.'",
  ],
  [
    "className={`panel character-card ${profile.id === tracking.activeProfileId ? 'active' : ''}`}",
    "className={'panel character-card ' + (profile.id === tracking.activeProfileId ? 'active' : '')}",
  ],
  [
    "{tracked ? \\`${tracked.identitySource} · ${tracked.identityConfidence}\\` : 'None'}",
    "{tracked ? tracked.identitySource + ' · ' + tracked.identityConfidence : 'None'}",
  ],
];

for (const [before, after] of fixes) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Patch wrapper expected exactly one '${before.slice(0, 80)}' target, found ${count}.`);
  source = source.replace(before, after);
}

// stageRuntime is itself TypeScript source stored inside a template string in the
// patch generator. Its own ${...} expressions must survive literally until the
// generated TypeScript runs, rather than being evaluated by the patch generator.
const stageStartMarker = 'const stageRuntime = `';
const stageEndMarker = "`;\nawait writeFile('tools/stage-pob-runtime.ts', stageRuntime, 'utf8');";
const stageStart = source.indexOf(stageStartMarker);
const stageEnd = source.indexOf(stageEndMarker, stageStart + stageStartMarker.length);
if (stageStart < 0 || stageEnd < 0) throw new Error('Could not isolate stageRuntime template for interpolation escaping.');
const stageBodyStart = stageStart + stageStartMarker.length;
const stageBody = source.slice(stageBodyStart, stageEnd).replace(/(?<!\\)\$\{/g, '\\${');
source = source.slice(0, stageBodyStart) + stageBody + source.slice(stageEnd);

await mkdir('.tmp', { recursive: true });
const output = path.resolve('.tmp/v025-hardening-executable.mjs');
await writeFile(output, source, 'utf8');
execFileSync(process.execPath, ['--check', output], { stdio: 'inherit' });
console.log(`Prepared and syntax-checked hardening patch at ${output}.`);
await import(pathToFileURL(output).href);
