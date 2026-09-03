import { createHash } from 'node:crypto';
import { appendFile, readFile } from 'node:fs/promises';
import { parseMobalyticsEmbeddedBuild } from '../src/core/mobalytics';
import { maxrollPlannerIdFromHtml, parseMaxrollGuide } from '../src/core/maxroll';
import type { GameDataManifest } from '../src/core/game-data-manifest';

const USER_AGENT = 'ExileQuesting-upstream-monitor (github.com/Stoffe101/ExileQuesting)';
const MAXROLL_GUIDE_BYTES = 5 * 1024 * 1024;
const MAXROLL_PLANNER_BYTES = 14 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 25_000;

const MAXROLL_CONTRACTS = [
  {
    id: 'normal-leveling',
    url: 'https://maxroll.gg/poe/build-guides/explosive-concoction-deadeye-leveling-build-guide',
    expectedMode: 'league-start',
    minimumSkills: 4,
    minimumPassives: 50,
    minimumEquipment: 0,
  },
  {
    id: 'twink-leveling',
    url: 'https://maxroll.gg/poe/build-guides/leveling-twink-ranger',
    expectedMode: 'twink',
    minimumSkills: 5,
    minimumPassives: 50,
    minimumEquipment: 2,
  },
] as const;

const MOBALYTICS_PROBE = 'https://mobalytics.gg/poe/profile/ronarray/builds/holy-absolution-guardian-build-step-by-step-guide-from-league-starter-to-ubers';

type Finding = { id: string; state: 'pass' | 'info' | 'review'; detail: string };

type GitHubCommit = { sha?: string };
type GitHubCompare = { files?: Array<{ filename?: string }> };

async function boundedText(response: Response, maxBytes: number): Promise<string> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error(`response declared ${declared} bytes, limit is ${maxBytes}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error(`response contained ${bytes.byteLength} bytes, limit is ${maxBytes}`);
  return new TextDecoder().decode(bytes);
}

async function fetchHtml(url: string, maxBytes: number, browser = false): Promise<{ status: number; text?: string; finalUrl: string }> {
  const headers: Record<string, string> = browser
    ? {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
      Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
    }
    : { 'User-Agent': USER_AGENT, Accept: 'text/html,application/xhtml+xml' };
  const response = await fetch(url, { headers, redirect: 'follow', signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
  return {
    status: response.status,
    text: response.ok ? await boundedText(response, maxBytes) : undefined,
    finalUrl: response.url || url,
  };
}

async function githubJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`GitHub returned HTTP ${response.status} for ${url}`);
  return await response.json() as T;
}

async function checkMaxroll(): Promise<Finding[]> {
  const findings: Finding[] = [];
  for (const contract of MAXROLL_CONTRACTS) {
    try {
      const guide = await fetchHtml(contract.url, MAXROLL_GUIDE_BYTES);
      if (guide.status !== 200 || !guide.text) throw new Error(`guide HTTP ${guide.status}`);
      if (!guide.text.includes('window.__remixContext')) throw new Error('guide lost window.__remixContext');
      const plannerId = maxrollPlannerIdFromHtml(guide.text);
      if (!plannerId) throw new Error('guide did not expose a planner id');
      const plannerUrl = `https://maxroll.gg/poe/planner/${plannerId}`;
      const planner = await fetchHtml(plannerUrl, MAXROLL_PLANNER_BYTES);
      if (planner.status !== 200 || !planner.text) throw new Error(`planner HTTP ${planner.status}`);
      const parsed = parseMaxrollGuide(contract.url, guide.text, planner.text);
      const failures: string[] = [];
      if (parsed.metadata.mode !== contract.expectedMode) failures.push(`mode ${parsed.metadata.mode} != ${contract.expectedMode}`);
      if (parsed.metadata.skillMilestones.length < contract.minimumSkills) failures.push(`only ${parsed.metadata.skillMilestones.length} skill milestones`);
      if (parsed.metadata.passiveOperations.length < contract.minimumPassives) failures.push(`only ${parsed.metadata.passiveOperations.length} passive operations`);
      if (parsed.metadata.equipmentMilestones.length < contract.minimumEquipment) failures.push(`only ${parsed.metadata.equipmentMilestones.length} equipment milestones`);
      findings.push({
        id: `maxroll:${contract.id}`,
        state: failures.length ? 'review' : 'pass',
        detail: failures.length
          ? `${contract.id} contract drifted: ${failures.join('; ')}`
          : `${contract.id} OK: planner ${plannerId}, ${parsed.metadata.skillMilestones.length} skill milestones, ${parsed.metadata.passiveOperations.length} passive operations, ${parsed.metadata.equipmentMilestones.length} equipment milestones`,
      });
    } catch (error) {
      findings.push({ id: `maxroll:${contract.id}`, state: 'review', detail: `${contract.id} probe failed: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return findings;
}

async function checkMobalytics(): Promise<Finding> {
  try {
    const result = await fetchHtml(MOBALYTICS_PROBE, 16 * 1024 * 1024, true);
    if (result.status === 403) {
      return { id: 'mobalytics:access', state: 'info', detail: 'Mobalytics still returns HTTP 403 to non-browser application probes; keep the PoB/POBb.in bridge as the supported path.' };
    }
    if (result.status !== 200 || !result.text) {
      return { id: 'mobalytics:access', state: 'review', detail: `Mobalytics access behavior changed from expected 403 to HTTP ${result.status}; review provider integration assumptions.` };
    }
    try {
      const parsed = parseMobalyticsEmbeddedBuild(MOBALYTICS_PROBE, result.text);
      return {
        id: 'mobalytics:access',
        state: 'review',
        detail: `Mobalytics is now directly readable and exposes ${parsed.pobCode ? 'a PoB code' : 'no PoB code'} plus ${parsed.variants.length} structured variants. Review whether safe direct URL import can be enabled.`,
      };
    } catch (error) {
      return { id: 'mobalytics:access', state: 'review', detail: `Mobalytics became HTTP 200 but embedded PoE1 parsing failed: ${error instanceof Error ? error.message : String(error)}` };
    }
  } catch (error) {
    return { id: 'mobalytics:access', state: 'info', detail: `Mobalytics probe was unavailable: ${error instanceof Error ? error.message : String(error)}. PoB bridge remains unaffected.` };
  }
}

async function checkGameData(): Promise<Finding[]> {
  const manifest = JSON.parse(await readFile(new URL('../assets/game-data/manifest.json', import.meta.url), 'utf8')) as GameDataManifest;
  const findings: Finding[] = [];
  for (const entry of manifest.datasets) {
    if (entry.source.kind !== 'git' || !entry.source.repository || !entry.source.revision) continue;
    try {
      const repository = entry.source.repository;
      const latest = await githubJson<GitHubCommit>(`https://api.github.com/repos/${repository}/commits/HEAD`);
      if (!latest.sha) throw new Error('latest commit response did not contain sha');
      if (latest.sha === entry.source.revision) {
        findings.push({ id: `game-data:${entry.id}`, state: 'pass', detail: `${entry.id} source is still pinned to repository HEAD ${latest.sha.slice(0, 12)}.` });
        continue;
      }
      const compare = await githubJson<GitHubCompare>(`https://api.github.com/repos/${repository}/compare/${entry.source.revision}...${latest.sha}`);
      const changed = new Set((compare.files ?? []).flatMap((file) => typeof file.filename === 'string' ? [file.filename] : []));
      const relevant = entry.source.paths.filter((sourcePath) => changed.has(sourcePath));
      findings.push({
        id: `game-data:${entry.id}`,
        state: relevant.length ? 'review' : 'info',
        detail: relevant.length
          ? `${entry.id} source moved ${entry.source.revision.slice(0, 12)} -> ${latest.sha.slice(0, 12)} and changed pinned path${relevant.length === 1 ? '' : 's'}: ${relevant.join(', ')}`
          : `${entry.id} repository moved to ${latest.sha.slice(0, 12)}, but none of the pinned source paths changed.`,
      });
    } catch (error) {
      findings.push({ id: `game-data:${entry.id}`, state: 'info', detail: `${entry.id} drift probe unavailable: ${error instanceof Error ? error.message : String(error)}` });
    }
  }
  return findings;
}

async function main(): Promise<void> {
  const findings = [...await checkMaxroll(), await checkMobalytics(), ...await checkGameData()];
  const review = findings.filter((finding) => finding.state === 'review');
  const fingerprint = createHash('sha256').update(JSON.stringify(review.map((finding) => [finding.id, finding.detail]))).digest('hex').slice(0, 12);
  const reason = review.length ? review.map((finding) => finding.id).join(', ') : 'none';

  if (process.env.GITHUB_OUTPUT) {
    await appendFile(process.env.GITHUB_OUTPUT, [
      `review=${review.length > 0}`,
      `fingerprint=${fingerprint}`,
      `reason=${reason}`,
      '',
    ].join('\n'), 'utf8');
  }

  const summary = [
    '# ExileQuesting companion upstream monitor',
    '',
    `Review required: **${review.length ? 'yes' : 'no'}**`,
    '',
    '| Contract | State | Detail |',
    '|---|---|---|',
    ...findings.map((finding) => `| ${finding.id.replaceAll('|', '\\|')} | **${finding.state.toUpperCase()}** | ${finding.detail.replaceAll('|', '\\|')} |`),
    '',
    'A REVIEW state does not mutate production data. It asks for a human compatibility review before adapters, fixtures, or pinned datasets are advanced.',
    '',
  ].join('\n');
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, summary, 'utf8');
  console.log(summary);
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
