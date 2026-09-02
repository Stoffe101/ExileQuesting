import { promises as fs } from 'node:fs';

const migrationPath = 'tools/finish-pr9.mjs';
let migration = await fs.readFile(migrationPath, 'utf8');
const start = migration.indexOf('const buildComponent = String.raw`');
const nextPatch = "await patch(\n  'src/ui/App.tsx',\n  `        {tab === 'guide'";
if (start >= 0) {
  const end = migration.indexOf(nextPatch, start);
  if (end < 0) throw new Error('Could not locate the App manager patch after the embedded Build workspace.');
  migration = migration.slice(0, start) + migration.slice(end);
  await fs.writeFile(migrationPath, migration, 'utf8');
}

const appPath = 'src/ui/App.tsx';
let app = await fs.readFile(appPath, 'utf8');
const importLine = "import BuildWorkspace from './BuildWorkspace';";
if (!app.includes(importLine)) {
  const anchor = "import { useEffect, useMemo, useRef, useState } from 'react';";
  if (!app.includes(anchor)) throw new Error('Could not locate the React import in App.tsx.');
  app = app.replace(anchor, `${anchor}\n${importLine}`);
  await fs.writeFile(appPath, app, 'utf8');
}

console.log('PR #9 migration hardened for standalone BuildWorkspace.tsx.');
