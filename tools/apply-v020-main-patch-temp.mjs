// Temporary release-prep helper. Delete before opening the v0.2 pull request.
import fs from 'node:fs';

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
if (packageJson.version !== '0.2.0') throw new Error(`Expected package.json version 0.2.0, found ${packageJson.version}`);

const file = 'package-lock.json';
let text = fs.readFileSync(file, 'utf8');
const before = text;
let replacements = 0;
text = text.replace(/"version": "0\.1\.4"/g, (match) => {
  if (replacements >= 2) return match;
  replacements += 1;
  return '"version": "0.2.0"';
});
if (replacements !== 2) throw new Error(`Expected two top-level v0.1.4 lockfile version fields, replaced ${replacements}.`);
if (text === before) throw new Error('Lockfile did not change.');
fs.writeFileSync(file, text);
