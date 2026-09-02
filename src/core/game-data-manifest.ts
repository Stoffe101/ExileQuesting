export type GameDataDatasetId = 'gem-acquisition' | 'passive-tree';

export interface GameDataChecksum {
  algorithm: 'sha256';
  scope: 'file';
  value: string;
}

export interface GameDataSourceProvenance {
  kind: 'git' | 'url';
  url: string;
  repository?: string;
  revision?: string;
  license?: string;
  paths: string[];
}

export interface GameDataManifestEntry {
  id: GameDataDatasetId;
  datasetRevision: number;
  file: string;
  schemaVersion: number;
  gameVersion: string;
  generatedAt: string;
  sizeBytes: number;
  checksum: GameDataChecksum;
  source: GameDataSourceProvenance;
}

export interface GameDataManifest {
  schemaVersion: 1;
  datasets: GameDataManifestEntry[];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function boundedString(value: unknown, max: number): string | undefined {
  return typeof value === 'string' && value.trim() && value.length <= max ? value.trim() : undefined;
}

function positiveInteger(value: unknown, max = Number.MAX_SAFE_INTEGER): number | undefined {
  return Number.isSafeInteger(value) && Number(value) >= 1 && Number(value) <= max ? Number(value) : undefined;
}

function safeHttpsUrl(value: unknown): string | undefined {
  const input = boundedString(value, 2048);
  if (!input) return undefined;
  try {
    const parsed = new URL(input);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : undefined;
  } catch {
    return undefined;
  }
}

function safeRelativePath(value: unknown): string | undefined {
  const input = boundedString(value, 400);
  if (!input || input.startsWith('/') || input.startsWith('\\') || /^[a-z]:/i.test(input)) return undefined;
  const segments = input.replaceAll('\\', '/').split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) return undefined;
  return segments.join('/');
}

function validDatasetId(value: unknown): value is GameDataDatasetId {
  return value === 'gem-acquisition' || value === 'passive-tree';
}

function validGeneratedAt(value: unknown): string | undefined {
  const input = boundedString(value, 80);
  if (!input || !Number.isFinite(Date.parse(input))) return undefined;
  return input;
}

function validateSource(value: unknown): GameDataSourceProvenance | null {
  const source = record(value);
  if (!source || (source.kind !== 'git' && source.kind !== 'url')) return null;
  const url = safeHttpsUrl(source.url);
  if (!url) return null;

  const repository = source.repository === undefined ? undefined : boundedString(source.repository, 200);
  const revision = source.revision === undefined ? undefined : boundedString(source.revision, 200);
  const license = source.license === undefined ? undefined : boundedString(source.license, 120);
  if (source.repository !== undefined && (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository))) return null;
  if (source.revision !== undefined && !revision) return null;
  if (source.license !== undefined && !license) return null;
  if (source.kind === 'git' && (!repository || !revision)) return null;

  if (!Array.isArray(source.paths) || source.paths.length > 20) return null;
  const paths: string[] = [];
  for (const candidate of source.paths) {
    const parsed = safeRelativePath(candidate);
    if (!parsed || paths.includes(parsed)) return null;
    paths.push(parsed);
  }

  return {
    kind: source.kind,
    url,
    ...(repository ? { repository } : {}),
    ...(revision ? { revision } : {}),
    ...(license ? { license } : {}),
    paths,
  };
}

function validateEntry(value: unknown): GameDataManifestEntry | null {
  const entry = record(value);
  if (!entry || !validDatasetId(entry.id)) return null;
  const datasetRevision = positiveInteger(entry.datasetRevision, 1_000_000);
  const file = safeRelativePath(entry.file);
  const schemaVersion = positiveInteger(entry.schemaVersion, 10_000);
  const gameVersion = boundedString(entry.gameVersion, 40);
  const generatedAt = validGeneratedAt(entry.generatedAt);
  const sizeBytes = positiveInteger(entry.sizeBytes, 100 * 1024 * 1024);
  const checksum = record(entry.checksum);
  const source = validateSource(entry.source);
  if (!datasetRevision || !file || file.includes('/') || !file.endsWith('.json') || !schemaVersion || !gameVersion || !generatedAt || !sizeBytes || !checksum || !source) return null;
  if (checksum.algorithm !== 'sha256' || checksum.scope !== 'file' || typeof checksum.value !== 'string' || !/^[a-f0-9]{64}$/i.test(checksum.value)) return null;

  return {
    id: entry.id,
    datasetRevision,
    file,
    schemaVersion,
    gameVersion,
    generatedAt,
    sizeBytes,
    checksum: { algorithm: 'sha256', scope: 'file', value: checksum.value.toLowerCase() },
    source,
  };
}

export function validateGameDataManifest(value: unknown): GameDataManifest | null {
  const root = record(value);
  if (!root || root.schemaVersion !== 1 || !Array.isArray(root.datasets) || root.datasets.length < 1 || root.datasets.length > 50) return null;
  const datasets: GameDataManifestEntry[] = [];
  const ids = new Set<GameDataDatasetId>();
  const files = new Set<string>();
  for (const candidate of root.datasets) {
    const entry = validateEntry(candidate);
    if (!entry || ids.has(entry.id) || files.has(entry.file)) return null;
    ids.add(entry.id);
    files.add(entry.file);
    datasets.push(entry);
  }
  return { schemaVersion: 1, datasets };
}

export function gameDataManifestEntry(manifest: GameDataManifest, id: GameDataDatasetId): GameDataManifestEntry | undefined {
  return manifest.datasets.find((entry) => entry.id === id);
}
