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
  [
    "\\`${JSON.stringify(manifest, null, 2)}\\\\n\\`",
    "\\`\\${JSON.stringify(manifest, null, 2)}\\\\n\\`",
  ],
];

for (const [before, after] of fixes) {
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`Patch wrapper expected exactly one '${before.slice(0, 80)}' target, found ${count}.`);
  source = source.replace(before, after);
}

await mkdir('.tmp', { recursive: true });
const output = path.resolve('.tmp/v025-hardening-executable.mjs');
await writeFile(output, source, 'utf8');
execFileSync(process.execPath, ['--check', output], { stdio: 'inherit' });
console.log(`Prepared and syntax-checked hardening patch at ${output}.`);
await import(pathToFileURL(output).href);
