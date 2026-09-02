import type { PassiveTreeSnapshot } from '../../src/core/passive-data';
import type { GemAcquisitionSnapshot } from '../../src/core/gem-data';
import { indexGemData, resolveGemRequirement } from '../../src/core/gem-data';
import {
  canonicalMaxrollGuideUrl,
  maxrollPlannerIdFromHtml,
  parseMaxrollGuide,
  type MaxrollGuideMetadata,
} from '../../src/core/maxroll';
import type { PobBuildSummary, PobSkillGroupSummary, PobStageSummary } from '../../src/core/pob';
import { readBoundedResponseText } from '../../src/core/security';

const MAX_MAXROLL_GUIDE_BYTES = 4 * 1024 * 1024;
const MAX_MAXROLL_PLANNER_BYTES = 12 * 1024 * 1024;
const MAXROLL_TIMEOUT_MS = 15_000;
const MAX_MAXROLL_REDIRECTS = 3;

export interface ImportedMaxrollBuild {
  id: string;
  importedAt: string;
  sourceKind: 'maxroll';
  source: string;
  build: PobBuildSummary;
  maxroll: MaxrollGuideMetadata;
}

export function isAllowedMaxrollResponse(value: string, expected: 'guide' | 'planner'): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== 'https:'
      || url.username
      || url.password
      || (url.port && url.port !== '443')
      || !['maxroll.gg', 'www.maxroll.gg'].includes(host)
    ) return false;
    return expected === 'guide'
      ? /^\/poe\/build-guides\/[a-z0-9-]+\/?$/i.test(url.pathname)
      : /^\/poe\/planner\/[A-Za-z0-9_-]{3,80}\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function fetchMaxrollHtml(url: string, expected: 'guide' | 'planner', appVersion: string, maxBytes: number): Promise<string> {
  let currentUrl = url;
  for (let redirectCount = 0; redirectCount <= MAX_MAXROLL_REDIRECTS; redirectCount += 1) {
    if (!isAllowedMaxrollResponse(currentUrl, expected)) throw new Error('Maxroll import URL is outside the allowed public route.');
    const response = await fetch(currentUrl, {
      headers: {
        'User-Agent': `ExileQuesting/${appVersion} (github.com/Stoffe101/ExileQuesting)`,
        Accept: 'text/html,application/xhtml+xml',
      },
      redirect: 'manual',
      signal: AbortSignal.timeout(MAXROLL_TIMEOUT_MS),
    });

    if (response.status >= 300 && response.status < 400) {
      if (redirectCount >= MAX_MAXROLL_REDIRECTS) throw new Error('Maxroll exceeded the allowed redirect count.');
      const location = response.headers.get('location');
      if (!location) throw new Error(`Maxroll returned HTTP ${response.status} without a redirect location.`);
      let nextUrl: string;
      try { nextUrl = new URL(location, currentUrl).toString(); }
      catch { throw new Error('Maxroll returned an invalid redirect location.'); }
      if (!isAllowedMaxrollResponse(nextUrl, expected)) throw new Error('Maxroll redirected the import to an unexpected location.');
      currentUrl = nextUrl;
      continue;
    }

    if (!response.ok) throw new Error(`Maxroll returned HTTP ${response.status}.`);
    if (!isAllowedMaxrollResponse(response.url || currentUrl, expected)) throw new Error('Maxroll returned an unexpected response location.');
    const html = await readBoundedResponseText(response, maxBytes);
    if (!html.includes('window.__remixContext')) throw new Error('Maxroll page did not expose the expected public page state.');
    return html;
  }
  throw new Error('Maxroll import did not reach a final response.');
}

function importedId(metadata: MaxrollGuideMetadata, importedAt: string): string {
  const identity = `${metadata.guideUrl}:${metadata.plannerId ?? ''}:${metadata.guideModified ?? ''}:${importedAt}`;
  let hash = 2166136261;
  for (let index = 0; index < identity.length; index += 1) {
    hash ^= identity.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `maxroll-${(hash >>> 0).toString(36)}`;
}

function canonicalizeGroups(groups: PobSkillGroupSummary[], snapshot: GemAcquisitionSnapshot): PobSkillGroupSummary[] {
  const index = indexGemData(snapshot);
  return groups.map((group) => ({
    ...group,
    gems: group.gems.map((gem) => {
      const resolved = resolveGemRequirement({
        key: gem.skillId ? `skill:${gem.skillId.toLowerCase()}` : `name:${gem.name.toLowerCase()}`,
        name: gem.name,
        skillId: gem.skillId,
        count: 1,
      }, index);
      return resolved ? { ...gem, name: resolved.name, skillId: resolved.id } : gem;
    }),
  }));
}

function canonicalizeStage(stage: PobStageSummary, snapshot: GemAcquisitionSnapshot): PobStageSummary {
  return stage.skillGroups ? { ...stage, skillGroups: canonicalizeGroups(stage.skillGroups, snapshot) } : stage;
}

export function canonicalizeMaxrollBuildGems(build: PobBuildSummary, snapshot?: GemAcquisitionSnapshot): PobBuildSummary {
  if (!snapshot) return build;
  return {
    ...build,
    skillStages: build.skillStages.map((stage) => canonicalizeStage(stage, snapshot)),
    activeSkillGroups: canonicalizeGroups(build.activeSkillGroups, snapshot),
  };
}

export async function importMaxrollGuide(
  input: string,
  appVersion: string,
  passiveSnapshot?: PassiveTreeSnapshot,
  gemSnapshot?: GemAcquisitionSnapshot,
): Promise<ImportedMaxrollBuild> {
  const guideUrl = canonicalMaxrollGuideUrl(input);
  const guideHtml = await fetchMaxrollHtml(guideUrl, 'guide', appVersion, MAX_MAXROLL_GUIDE_BYTES);
  const plannerId = maxrollPlannerIdFromHtml(guideHtml);
  const plannerHtml = plannerId
    ? await fetchMaxrollHtml(`https://maxroll.gg/poe/planner/${plannerId}`, 'planner', appVersion, MAX_MAXROLL_PLANNER_BYTES)
    : undefined;
  const parsed = parseMaxrollGuide(guideUrl, guideHtml, plannerHtml, passiveSnapshot);
  const importedAt = new Date().toISOString();
  return {
    id: importedId(parsed.metadata, importedAt),
    importedAt,
    sourceKind: 'maxroll',
    source: guideUrl,
    build: canonicalizeMaxrollBuildGems(parsed.build, gemSnapshot),
    maxroll: parsed.metadata,
  };
}
