import { readFile, writeFile } from 'node:fs/promises';

const path = 'electron/main.ts';
const source = await readFile(path, 'utf8');
const from = "const imported = await importMaxrollGuide(input.trim(), app.getVersion(), passiveData.snapshot);";
const to = "const imported = await importMaxrollGuide(input.trim(), app.getVersion(), passiveData.snapshot, gemData.snapshot);";
if (!source.includes(from)) throw new Error('Maxroll import callsite patch anchor was not found.');
if (source.indexOf(from) !== source.lastIndexOf(from)) throw new Error('Maxroll import callsite patch anchor is not unique.');
await writeFile(path, source.replace(from, to), 'utf8');
console.log('Patched Maxroll runtime import with bundled gem data.');
