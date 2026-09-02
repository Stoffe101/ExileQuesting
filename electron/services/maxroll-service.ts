import type { PassiveTreeSnapshot } from '../../src/core/passive-data';
import {
  canonicalMaxrollGuideUrl,
  maxrollPlannerIdFromHtml,
  parseMaxrollGuide,
  type MaxrollGuideMetadata,
} from '../../src/core/maxroll';
import type { PobBuildSummary } from '../../src/core/pob';
import { readBoundedResponseText } from '../../src/core/security';

const MAX_MAXROLL_GUIDE_BYTES = 4 * 1024 * 1024;
const MAX_MAXROLL_PLANNER_BYTES = 12 * 1024 * 1024;
const MAXROLL_TIMEOUT_MS = 15_000;

export interface ImportedMaxrollBuild {
  id: string;
  importedAt: string;
  sourceKind: 'maxroll';
  source: string;
  build: PobBuildSummary;
  maxroll: MaxrollGuideMetadata;
}

function isAllowedMaxrollResponse(value: string, expected: 'guide' | 'planner'): boolean {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (url.protocol !== 'https:' || url.username || url.password || !['maxroll.gg', 'www.maxroll.gg'].includes(host)) return false;
    return expected === 'guide'
      ? /^\/poe\/build-guides\/[a-z0-9-]+\/?$/i.test(url.pathname)
      : /^\/poe\/planner\/[A-Za-z0-9_-]{3,80}\/?$/i.test(url.pathname);
  } catch {
    return false;
  }
}

async function fetchMaxrollHtml(url: string, expected: 'guide' | 'planner', appVersion: string, maxBytes: number): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'User-Agent': `ExileQuesting/${appVersion} (github.com/Stoffe101/ExileQuesting)`,
      Accept: 'text/html,application/xhtml+xml',
    },
    redirect: 'follow',
    signal: AbortSignal.timeout(MAXROLL_TIMEOUT_MS),
  });
  if (!response.ok) throw new Error(`Maxroll returned HTTP ${response.status}.`);
  if (!isAllowedMaxrollResponse(response.url, expected)) throw new Error('Maxroll redirected the import to an unexpected location.');
  const html = await readBoundedResponseText(response, maxBytes);
  if (!html.includes('window.__remixContext')) throw new Error('Maxroll page did not expose the expected public page state.');
  return html;
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

export async function importMaxrollGuide(
  input: string,
  appVersion: string,
  passiveSnapshot?: PassiveTreeSnapshot,
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
    build: parsed.build,
    maxroll: parsed.metadata,
  };
}
