export interface ReleaseAssetLike {
  id: number;
  name: string;
  size: number;
  browser_download_url: string;
  digest?: string | null;
}

export interface GithubReleaseLike {
  tag_name: string;
  name?: string | null;
  body?: string | null;
  draft?: boolean;
  prerelease?: boolean;
  published_at?: string | null;
  html_url?: string;
  assets?: ReleaseAssetLike[];
}

export interface ParsedAppRelease {
  version: string;
  tag: string;
  name: string;
  notes: string;
  publishedAt?: string;
  setupAsset: ReleaseAssetLike;
}

export function normalizeVersion(value: string): string {
  return value.trim().replace(/^v/i, '').split('+')[0];
}

function numericParts(value: string): number[] | null {
  const normalized = normalizeVersion(value);
  const match = normalized.match(/^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?$/);
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

export function compareVersions(left: string, right: string): number {
  const a = numericParts(left);
  const b = numericParts(right);
  if (!a || !b) return normalizeVersion(left).localeCompare(normalizeVersion(right));
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] > b[index] ? 1 : -1;
  }
  const leftPre = normalizeVersion(left).includes('-');
  const rightPre = normalizeVersion(right).includes('-');
  if (leftPre !== rightPre) return leftPre ? -1 : 1;
  return 0;
}

export function isNewerVersion(candidate: string, current: string): boolean {
  return compareVersions(candidate, current) > 0;
}

export function parseLatestRelease(value: unknown): ParsedAppRelease | null {
  if (!value || typeof value !== 'object') return null;
  const release = value as GithubReleaseLike;
  if (!release.tag_name || release.draft || release.prerelease) return null;
  const version = normalizeVersion(release.tag_name);
  if (!numericParts(version)) return null;
  const expected = `ExileQuesting-${version}-setup.exe`.toLowerCase();
  const setupAsset = (release.assets ?? []).find((asset) => asset.name.toLowerCase() === expected);
  if (!setupAsset || !/^https:\/\/github\.com\//i.test(setupAsset.browser_download_url)) return null;
  return {
    version,
    tag: release.tag_name,
    name: release.name?.trim() || release.tag_name,
    notes: release.body?.trim() || 'A new ExileQuesting release is available.',
    publishedAt: release.published_at ?? undefined,
    setupAsset,
  };
}

export function parseSha256Digest(value?: string | null): string | undefined {
  if (!value) return undefined;
  const match = value.match(/^sha256:([a-f0-9]{64})$/i);
  return match?.[1].toLowerCase();
}
