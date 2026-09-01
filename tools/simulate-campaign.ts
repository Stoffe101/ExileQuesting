import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { normalizeCampaign } from '../src/core/campaign';
import { simulateCanonicalCampaign, simulationReportMarkdown } from '../src/core/simulator';
import type { GuidanceAnnotation, LayoutHint, RawAreas, RawGuide } from '../src/core/types';

const root = process.cwd();
async function json<T>(name: string): Promise<T> {
  return JSON.parse(await readFile(path.join(root, 'assets', 'campaign', name), 'utf8')) as T;
}

const [guide, areas, annotations, layouts, manifest] = await Promise.all([
  json<RawGuide>('guide.json'),
  json<RawAreas>('areas.json'),
  json<GuidanceAnnotation[]>('annotations.json'),
  json<LayoutHint[]>('layouts.json'),
  json<{ commit: string; fetchedAt: string }>('manifest.json'),
]);

const dataset = normalizeCampaign(guide, areas, annotations, {
  repository: 'Lailloken/Exile-UI',
  commit: manifest.commit,
  fetchedAt: manifest.fetchedAt,
  license: 'MIT',
}, layouts);

const scenarios = [
  { name: 'League start · all optional · kill all bandits', options: { leagueStart: true, showOptional: true, bandit: 'none' as const } },
  { name: 'League start · optional hidden', options: { leagueStart: true, showOptional: false, bandit: 'none' as const } },
  { name: 'Twink/non-league-start · all optional', options: { leagueStart: false, showOptional: true, bandit: 'none' as const } },
  { name: 'Bandit · Alira', options: { leagueStart: true, showOptional: true, bandit: 'alira' as const } },
  { name: 'Bandit · Kraityn', options: { leagueStart: true, showOptional: true, bandit: 'kraityn' as const } },
  { name: 'Bandit · Oak', options: { leagueStart: true, showOptional: true, bandit: 'oak' as const } },
];

const results = scenarios.map((scenario) => ({ ...scenario, report: simulateCanonicalCampaign(dataset, scenario.options) }));
const outputDir = path.join(root, 'artifacts', 'simulation');
await mkdir(outputDir, { recursive: true });
await writeFile(path.join(outputDir, 'campaign-simulation.json'), JSON.stringify(results, null, 2), 'utf8');

const summary = [
  '# Pre-playtest campaign simulation',
  '',
  `Generated: ${new Date().toISOString()}`,
  `Bundled campaign: ${manifest.commit}`,
  '',
  '| Scenario | Result | Enabled pages | Auto | Manual | Duplicates | Backtracks | Errors |',
  '|---|---:|---:|---:|---:|---:|---:|---:|',
  ...results.map(({ name, report }) => `| ${name} | ${report.passed ? 'PASS' : 'FAIL'} | ${report.enabledPages} | ${report.automaticAdvances} | ${report.manualAdvances} | ${report.duplicateEvents} | ${report.backtrackProbes} | ${report.issues.filter((issue) => issue.severity === 'error').length} |`),
  '',
  '## Default-route detail',
  '',
  simulationReportMarkdown(results[0].report),
  '',
  '## What this proves',
  '',
  '- All ten acts can be traversed through the same normalized route and progression engine used by the app.',
  '- Duplicate internal-ID/display-name events are exercised instead of assuming one perfect event per zone.',
  '- Periodic backtrack probes verify that revisiting a recent zone cannot silently move route progress backwards or skip to a distant repeated area.',
  '- Conditional league-start, optional-content, and bandit profiles are exercised independently.',
  '',
  '## What still requires the real game',
  '',
  '- GGG client log timing/order changes that are not represented in captured fixtures.',
  '- Windows always-on-top/click-through behavior against the actual game window.',
  '- Human readability while actively fighting and mixed-DPI monitor placement.',
  '',
].join('\n');

await writeFile(path.join(outputDir, 'campaign-simulation.md'), summary, 'utf8');
console.log(summary);

if (results.some(({ report }) => !report.passed)) process.exitCode = 1;
