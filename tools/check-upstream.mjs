import { appendFile, readFile } from 'node:fs/promises';

const repository = 'Lailloken/Exile-UI';
const manifest = JSON.parse(await readFile(new URL('../assets/campaign/manifest.json', import.meta.url), 'utf8'));
const headers = { 'User-Agent': 'ExileQuesting-upstream-monitor (github.com/Stoffe101/ExileQuesting)' };

async function json(url) {
  const response = await fetch(url, { headers });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  return response.json();
}

const latest = await json(`https://api.github.com/repos/${repository}/commits/main`);
const changed = latest.sha !== manifest.commit;
const output = process.env.GITHUB_OUTPUT;
const summary = process.env.GITHUB_STEP_SUMMARY;

if (output) {
  await appendFile(output, `changed=${changed}\nlatest=${latest.sha}\npinned=${manifest.commit}\n`, 'utf8');
}

const report = [
  '# Exile-UI compatibility monitor',
  '',
  `- Pinned: \`${manifest.commit}\``,
  `- Latest: \`${latest.sha}\``,
  `- Changed: **${changed ? 'yes' : 'no'}**`,
  `- Latest message: ${String(latest.commit?.message ?? '').split('\n')[0]}`,
  '',
  changed
    ? 'The desktop app will stage and validate the new campaign data at runtime. Repository review is still required before the bundled fallback is advanced.'
    : 'The bundled fallback matches upstream HEAD.',
  '',
].join('\n');

if (summary) await appendFile(summary, report, 'utf8');
console.log(report);

