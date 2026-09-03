import { writeFile } from 'node:fs/promises';
import { extractRemixContext, maxrollPlannerIdFromHtml, parseMaxrollGuide } from '../src/core/maxroll';

const UA = 'ExileQuesting-corpus-research (github.com/Stoffe101/ExileQuesting)';
const ORIGIN = 'https://maxroll.gg';
const GUIDE_PREFIX = '/poe/build-guides/';
const MAX_GUIDES = 220;

async function fetchText(url: string, maxBytes = 12 * 1024 * 1024): Promise<string> {
  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,application/xml,text/xml' }, signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  const buf = new Uint8Array(await response.arrayBuffer());
  if (buf.byteLength > maxBytes) throw new Error(`Response too large (${buf.byteLength}): ${url}`);
  return new TextDecoder().decode(buf);
}

function decode(value: string): string {
  return value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function guideUrlsFromText(text: string): string[] {
  const found = new Set<string>();
  for (const match of text.matchAll(/https?:\/\/(?:www\.)?maxroll\.gg(\/poe\/build-guides\/[a-z0-9-]+)\/?/gi)) found.add(`${ORIGIN}${match[1].replace(/\/$/, '')}`);
  for (const match of text.matchAll(/href=["'](\/poe\/build-guides\/[a-z0-9-]+)\/?["']/gi)) found.add(`${ORIGIN}${match[1].replace(/\/$/, '')}`);
  return [...found];
}

async function discoverGuides(): Promise<string[]> {
  const found = new Set<string>();
  for (const seed of [`${ORIGIN}/poe/build-guides`, `${ORIGIN}/sitemap.xml`]) {
    try {
      const text = await fetchText(seed, 20 * 1024 * 1024);
      guideUrlsFromText(text).forEach((url) => found.add(url));
      if (seed.endsWith('sitemap.xml')) {
        const sitemapUrls = [...text.matchAll(/<loc>(https?:\/\/[^<]+\.xml[^<]*)<\/loc>/gi)].map((match) => match[1]).slice(0, 80);
        for (const sitemap of sitemapUrls) {
          try { guideUrlsFromText(await fetchText(sitemap, 20 * 1024 * 1024)).forEach((url) => found.add(url)); } catch { /* continue */ }
        }
      }
    } catch (error) {
      console.error(`Discovery seed failed: ${seed}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return [...found].sort().slice(0, MAX_GUIDES);
}

type Rec = Record<string, unknown>;
function record(value: unknown): Rec | undefined { return value && typeof value === 'object' && !Array.isArray(value) ? value as Rec : undefined; }
function postFromHtml(html: string): Rec | undefined {
  const context = extractRemixContext(html);
  const loader = record(record(context?.state)?.loaderData);
  const branch = record(loader?.['branch-posts']);
  return record(branch?.post) ?? record(record(branch?.data)?.post);
}

const TIP_TERMS = /\b(regex|vendor|filter|movement speed|boots|resistance|craft|chromatic|socket|link|waypoint|labyrinth|lab|bandit|quest reward|gem|transition|leveling unique|twink|hollow palm|poet.?s pen|lightning warp)\b/i;
function collectTipCandidates(value: unknown): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const visit = (node: unknown, depth = 0) => {
    if (depth > 10 || out.length >= 80) return;
    if (typeof node === 'string') {
      const clean = decode(node);
      if (clean.length >= 20 && clean.length <= 1800 && TIP_TERMS.test(clean)) {
        const pieces = clean.split(/(?<=[.!?])\s+/).filter((piece) => TIP_TERMS.test(piece));
        for (const piece of pieces) {
          const bounded = piece.slice(0, 420).trim();
          if (bounded.length >= 20 && !seen.has(bounded)) { seen.add(bounded); out.push(bounded); if (out.length >= 80) break; }
        }
      }
      return;
    }
    if (Array.isArray(node)) { for (const child of node.slice(0, 1000)) visit(child, depth + 1); return; }
    const source = record(node); if (!source) return;
    for (const child of Object.values(source).slice(0, 1000)) visit(child, depth + 1);
  };
  visit(value);
  return out;
}

async function poolMap<T, R>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length); let cursor = 0;
  async function worker() { while (true) { const index = cursor++; if (index >= items.length) return; results[index] = await fn(items[index], index); } }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

const urls = await discoverGuides();
console.log(`Discovered ${urls.length} PoE build-guide URLs.`);

const reports = await poolMap(urls, 4, async (url) => {
  try {
    const guideHtml = await fetchText(url, 5 * 1024 * 1024);
    const plannerId = maxrollPlannerIdFromHtml(guideHtml);
    let plannerHtml: string | undefined;
    if (plannerId) {
      try { plannerHtml = await fetchText(`${ORIGIN}/poe/planner/${plannerId}`); } catch (error) { console.error(`Planner failed ${plannerId}: ${error instanceof Error ? error.message : String(error)}`); }
    }
    const parsed = parseMaxrollGuide(url, guideHtml, plannerHtml);
    const post = postFromHtml(guideHtml);
    const tips = collectTipCandidates(post);
    const title = parsed.metadata.guideTitle;
    const slug = parsed.metadata.guideSlug;
    const taxonomyBlob = JSON.stringify(post ?? {}).slice(0, 500_000);
    const levelingSignal = /\blevel(?:ing|ling)\b/i.test(`${title} ${slug} ${taxonomyBlob}`);
    const twinkSignal = parsed.metadata.mode === 'twink' || /\btwink\b/i.test(`${title} ${slug} ${taxonomyBlob}`);
    return {
      ok: true, url, title, slug, mode: parsed.metadata.mode, plannerId,
      levelingSignal, twinkSignal,
      treeVersion: parsed.metadata.plannerTreeVersion,
      compatibility: parsed.metadata.compatibility,
      passiveOperations: parsed.metadata.passiveOperations.length,
      skillMilestones: parsed.metadata.skillMilestones,
      equipmentMilestones: parsed.metadata.equipmentMilestones.map((milestone) => ({ name: milestone.name, items: milestone.itemNames })),
      alternateSkillPaths: parsed.metadata.alternateSkillPaths,
      tips,
    };
  } catch (error) {
    return { ok: false, url, error: error instanceof Error ? error.message : String(error) };
  }
});

const relevant = reports.filter((report: any) => report.ok && (report.levelingSignal || report.twinkSignal));
const summary = {
  generatedAt: new Date().toISOString(),
  discovered: urls.length,
  parsed: reports.filter((report: any) => report.ok).length,
  failed: reports.filter((report: any) => !report.ok).length,
  relevant: relevant.length,
  twink: relevant.filter((report: any) => report.twinkSignal).length,
  guides: relevant,
  failures: reports.filter((report: any) => !report.ok),
};
await writeFile('maxroll-corpus-report.json', `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ discovered: summary.discovered, parsed: summary.parsed, failed: summary.failed, relevant: summary.relevant, twink: summary.twink }, null, 2));
