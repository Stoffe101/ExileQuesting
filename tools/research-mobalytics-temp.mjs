import { writeFile } from 'node:fs/promises';

const ORIGIN = 'https://mobalytics.gg';
const MAX_BUILDS = 80;
const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:128.0) Gecko/20100101 Firefox/128.0',
  Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
  'Cache-Control': 'no-cache',
};

async function fetchText(url, maxBytes = 15 * 1024 * 1024) {
  const response = await fetch(url, { headers: HEADERS, redirect: 'follow', signal: AbortSignal.timeout(25_000) });
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) throw new Error(`Response too large: ${url} (${bytes.byteLength})`);
  return new TextDecoder().decode(bytes);
}

function decode(value) {
  return value.replaceAll('&amp;', '&').replaceAll('&quot;', '"').replaceAll('&#39;', "'").replaceAll('&lt;', '<').replaceAll('&gt;', '>');
}

function buildUrls(text) {
  const out = new Set();
  for (const match of text.matchAll(/href=["'](\/poe\/(?:profile\/[a-z0-9_-]+\/builds|builds)\/[a-z0-9_-]+)[^"']*["']/gi)) out.add(`${ORIGIN}${match[1]}`);
  for (const match of text.matchAll(/https?:\/\/mobalytics\.gg(\/poe\/(?:profile\/[a-z0-9_-]+\/builds|builds)\/[a-z0-9_-]+)/gi)) out.add(`${ORIGIN}${match[1]}`);
  return [...out];
}

function titleFromHtml(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return match ? decode(match[1]).replace(/<[^>]+>/g, '').trim() : '';
}

function visibleText(html) {
  return decode(html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')).trim();
}

function extractBalancedJsonAfter(html, marker) {
  const markerIndex = html.indexOf(marker);
  if (markerIndex < 0) return undefined;
  const start = html.indexOf('{', markerIndex + marker.length);
  if (start < 0) return undefined;
  let depth = 0;
  let quote = false;
  let escaped = false;
  for (let i = start; i < html.length; i += 1) {
    const c = html[i];
    if (quote) {
      if (escaped) escaped = false;
      else if (c === '\\') escaped = true;
      else if (c === '"') quote = false;
      continue;
    }
    if (c === '"') quote = true;
    else if (c === '{') depth += 1;
    else if (c === '}') {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(html.slice(start, i + 1)); } catch { return undefined; }
      }
    }
  }
  return undefined;
}

function findBuildDocument(value, depth = 0) {
  if (depth > 14 || value == null) return undefined;
  if (Array.isArray(value)) {
    for (const child of value.slice(0, 5000)) {
      const found = findBuildDocument(child, depth + 1);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof value !== 'object') return undefined;
  const source = value;
  if (source.buildVariants && typeof source.buildVariants === 'object') return source;
  for (const child of Object.values(source).slice(0, 5000)) {
    const found = findBuildDocument(child, depth + 1);
    if (found) return found;
  }
  return undefined;
}

function variantSummary(doc) {
  const variants = doc?.buildVariants?.values;
  if (!Array.isArray(variants)) return [];
  return variants.slice(0, 60).map((variant) => ({
    id: typeof variant?.id === 'string' || typeof variant?.id === 'number' ? String(variant.id) : undefined,
    level: variant?.level ?? variant?.characterLevel ?? variant?.requiredLevel,
    passiveKeys: variant?.passiveTree && typeof variant.passiveTree === 'object' ? Object.keys(variant.passiveTree).slice(0, 30) : [],
    equipmentKeys: variant?.equipment && typeof variant.equipment === 'object' ? Object.keys(variant.equipment).slice(0, 30) : [],
    skillKeys: variant?.skillGems && typeof variant.skillGems === 'object' ? Object.keys(variant.skillGems).slice(0, 30) : [],
  }));
}

function excerpts(html, terms) {
  const lower = html.toLowerCase();
  const out = {};
  for (const term of terms) {
    const i = lower.indexOf(term.toLowerCase());
    out[term] = i >= 0 ? html.slice(Math.max(0, i - 250), Math.min(html.length, i + 700)).replace(/\s+/g, ' ') : undefined;
  }
  return out;
}

function probablePobTokens(html) {
  const found = new Set();
  for (const match of html.matchAll(/(?:pobCode|pob_code|pathOfBuildingCode|path_of_building_code|pobbIn|pobbin)["'\\:\s=]+([^"'<>{}\s]{20,4000})/gi)) found.add(match[0].slice(0, 4100));
  for (const match of html.matchAll(/https?:\/\/pobb\.in\/[A-Za-z0-9_-]{3,80}/g)) found.add(match[0]);
  return [...found].slice(0, 40);
}

function variantCandidates(text) {
  const found = new Set();
  for (const match of text.matchAll(/\b(?:lvl|level)\s*\d{1,3}\+?(?:\s*[-–]\s*\d{1,3}\+?)?(?:\s*\([^)]{1,80}\))?/gi)) found.add(match[0].trim());
  return [...found].slice(0, 60);
}

async function main() {
  const listingPages = [`${ORIGIN}/poe/starter-builds`, `${ORIGIN}/poe/builds`];
  const urls = new Set();
  for (const page of listingPages) {
    try {
      const html = await fetchText(page);
      buildUrls(html).forEach((url) => urls.add(url));
    } catch (error) {
      console.error(`Listing fetch failed ${page}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (!urls.size) {
    [
      `${ORIGIN}/poe/profile/ronarray/builds/holy-absolution-guardian-build-step-by-step-guide-from-league-starter-to-ubers`,
      `${ORIGIN}/poe/profile/peuget2/builds/3-29-winter-orb-elementalist-league-starter`,
    ].forEach((url) => urls.add(url));
  }
  const candidates = [...urls].slice(0, MAX_BUILDS);
  console.log(`Discovered ${candidates.length} Mobalytics build URLs from public pages/seeds.`);

  const reports = [];
  for (const [index, url] of candidates.entries()) {
    try {
      const html = await fetchText(url);
      const text = visibleText(html);
      const title = titleFromHtml(html);
      const state = extractBalancedJsonAfter(html, 'window.__PRELOADED_STATE__');
      const doc = findBuildDocument(state);
      const speedLeveling = /\bSpeed Leveling\b/i.test(text);
      const starter = /\bStarter\b/i.test(text);
      const leveling = /\blevel(?:ing|ling)\b/i.test(`${title} ${text.slice(0, 25_000)}`);
      reports.push({
        ok: true,
        url,
        title,
        bytes: html.length,
        starter,
        speedLeveling,
        leveling,
        hasPreloadedState: Boolean(state),
        hasBuildDocument: Boolean(doc),
        structuredVariants: variantSummary(doc),
        variants: variantCandidates(text),
        pobSignals: probablePobTokens(html),
        excerpts: index < 5 ? excerpts(html, ['__PRELOADED_STATE__', 'userGeneratedDocumentBySlug', 'buildVariants', 'passiveTree', 'skillGems', 'equipment', 'Path of Building']) : undefined,
      });
      console.log(`[${index + 1}/${candidates.length}] ${doc ? 'STRUCTURED' : 'HTML'} ${title}`);
    } catch (error) {
      reports.push({ ok: false, url, error: error instanceof Error ? error.message : String(error) });
    }
  }

  const relevant = reports.filter((report) => report.ok && (report.starter || report.speedLeveling || report.leveling));
  const summary = {
    generatedAt: new Date().toISOString(),
    discovered: candidates.length,
    parsed: reports.filter((report) => report.ok).length,
    failed: reports.filter((report) => !report.ok).length,
    relevant: relevant.length,
    withPreloadedState: relevant.filter((report) => report.hasPreloadedState).length,
    withBuildDocument: relevant.filter((report) => report.hasBuildDocument).length,
    withPobSignals: relevant.filter((report) => report.pobSignals?.length).length,
    withVariantSignals: relevant.filter((report) => report.variants?.length || report.structuredVariants?.length).length,
    guides: relevant,
    failures: reports.filter((report) => !report.ok),
  };
  await writeFile('mobalytics-structure-report.json', `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ discovered: summary.discovered, parsed: summary.parsed, failed: summary.failed, relevant: summary.relevant, withPreloadedState: summary.withPreloadedState, withBuildDocument: summary.withBuildDocument, withPobSignals: summary.withPobSignals, withVariantSignals: summary.withVariantSignals }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
