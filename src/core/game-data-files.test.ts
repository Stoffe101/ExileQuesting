import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateGameDataManifest } from './game-data-manifest';

const ROOT = path.join(process.cwd(), 'assets', 'game-data');

function sha256(value: Uint8Array): string {
  return createHash('sha256').update(value).digest('hex');
}

describe('bundled game-data physical files', () => {
  it('uses LF-stable bytes and matches every manifest file checksum', async () => {
    const manifestRaw = await readFile(path.join(ROOT, 'manifest.json'));
    expect(manifestRaw.includes(13), 'game-data manifest contains a raw carriage-return byte; .gitattributes must keep bundled game data LF-only').toBe(false);
    const manifest = validateGameDataManifest(JSON.parse(manifestRaw.toString('utf8')) as unknown);
    expect(manifest).toBeTruthy();

    for (const entry of manifest!.datasets) {
      const raw = await readFile(path.join(ROOT, entry.file));
      expect(raw.includes(13), `${entry.file} contains a raw carriage-return byte; physical file hashes must be cross-platform stable`).toBe(false);
      expect(raw.byteLength, `${entry.file} byte length differs from its manifest`).toBe(entry.sizeBytes);
      expect(sha256(raw), `${entry.file} SHA-256 differs from its manifest`).toBe(entry.checksum.value);
    }
  });
});
