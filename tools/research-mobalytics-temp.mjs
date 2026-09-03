import { writeFile } from 'node:fs/promises';

const ORIGIN = 'https://mobalytics.gg';
const UA = 'ExileQuesting-mobalytics-research (github.com/Stoffe101/ExileQuesting)';
const MAX_BUILDS = 80;

async function fetchText(url, maxBytes = 15 * 1024 * 1024) {
  const response = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml' }, redirect: 'follow', signal: AbortSignal.timeout(25_000) });
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

function excerpts(html, terms) {
  const lower = html.toLowerCase();
  const out = {};
  for (const term of terms) {
    const i = lower.indexOf(term.toLowerCase());
    out[term] = i >= 0 ? html.slice(Math.max(0, i - 250), Math.min(html.length, i + 700)).replace(/\s+/g, ' ') : undefined;
  }
  return out;
}

function scriptSummary(html) {
  const scripts = [];
  for (const match of html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = match[1] ?? '';
    const body = match[2] ?? '';
    const type = attrs.match(/type=["']([^"']+)["']/i)?.[1];
    const id = attrs.match(/id=["']([^"']+)["']/i)?.[1];
    const src = attrs.match(/src=["']([^"']+)["']/i)?.[1];
    const interesting = /(pob|path.?of.?building|variant|passive|skill|equipment|build)/i.test(body);
    scripts.push({ type, id, src, bytes: body.length, interesting });
  }
  return scripts.slice(0, 200);
}

function apiCandidates(html) {
  const found = new Set();
  for (const match of html.matchAll(/https?:\\?\/\\?\/[^"'<>\\s]+/gi)) {
    const value = match[0].replaceAll('\\/', '/');
    if (/api|graphql|build|planner/i.test(value)) found.add(value.slice(0, 500));
  }
  for (const match of html.matchAll(/["'](\/(?:api|graphql)[^"']{1,300})["']/gi)) found.add(match[1]);
  return [...found].slice(0, 120);
}

function probablePobTokens(html) {
  const found = new Set();
  for (const match of html.matchAll(/(?:pobCode|pob_code|pathOfBuildingCode|path_of_building_code|pobbIn|pobbin)["'\\:\s=]+([^"'<>{}\s]{20,2000})/gi)) found.add(match[0].slice(0, 2100));
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
    const html = await fetchText(page);
    buildUrls(html).forEach((url) => urls.add(url));
  }
  const candidates = [...urls].slice(0, MAX_BUILDS);
  console.log(`Discovered ${candidates.length} Mobalytics build URLs from public listings.`);

  const reports = [];
  for (const [index, url] of candidates.entries()) {
    try {
      const html = await fetchText(url);
      const text = visibleText(html);
      const title = titleFromHtml(html);
      const speedLeveling = /\bSpeed Leveling\b/i.test(text);
      const starter = /\bStarter\b/i.test(text);
      const leveling = /\blevel(?:ing|ling)\b/i.test(`${title} ${text.slice(0, 20_000)}`);
      const report = {
        ok: true,
        url,
        title,
        bytes: html.length,
        starter,
        speedLeveling,
        leveling,
        variants: variantCandidates(text),
        pobSignals: probablePobTokens(html),
        apiCandidates: apiCandidates(html),
        scripts: scriptSummary(html).filter((script) => script.interesting || script.id || script.type?.includes('json')).slice(0, 60),
        excerpts: index < 5 ? excerpts(html, ['__NEXT_DATA__', '__NUXT__', 'pobCode', 'Path of Building', 'variants', 'buildVariants', 'passiveTree', 'skills', 'equipment', 'graphql']) : undefined,
      };
      reports.push(report);
      console.log(`[${index + 1}/${candidates.length}] ${speedLeveling || leveling ? 'LEVEL' : 'build'} ${title}`);
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
    withPobSignals: relevant.filter((report) => report.pobSignals?.length).length,
    withVariantSignals: relevant.filter((report) => report.variants?.length).length,
    guides: relevant,
    failures: reports.filter((report) => !report.ok),
  };
  await writeFile('mobalytics-structure-report.json', `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ discovered: summary.discovered, parsed: summary.parsed, failed: summary.failed, relevant: summary.relevant, withPobSignals: summary.withPobSignals, withVariantSignals: summary.withVariantSignals }, null, 2));
}

main().catch((error) => { console.error(error instanceof Error ? error.stack ?? error.message : String(error)); process.exitCode = 1; });
