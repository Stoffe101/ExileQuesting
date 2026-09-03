import { createHash, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { BuildCalculationPayloadReference, BuildProfile } from '../../src/core/build-profiles';
import { MAX_POB_XML_BYTES } from '../../src/core/pob';

const PAYLOAD_DIRECTORY = 'build-calculations';
const SAFE_PROFILE_ID = /^[A-Za-z0-9._-]{1,256}$/;
const pendingPayloads = new Map<string, { xml: string; reference: BuildCalculationPayloadReference }>();

function sha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

function requireSafeProfileId(profileId: string): string {
  if (!SAFE_PROFILE_ID.test(profileId)) throw new Error('Build profile id cannot be used for a calculation payload path.');
  return profileId;
}

function normalizedXmlBuffer(xml: string): Buffer {
  const normalized = xml.trim();
  if (!normalized || !/^<\?xml\b|^<PathOfBuilding\b/i.test(normalized)) {
    throw new Error('Build Doctor calculation payload must be Path of Building XML.');
  }
  const buffer = Buffer.from(normalized, 'utf8');
  if (buffer.length < 1 || buffer.length > MAX_POB_XML_BYTES) {
    throw new Error(`Build Doctor calculation payload exceeds the ${MAX_POB_XML_BYTES} byte safety bound.`);
  }
  return buffer;
}

function sameReference(left: BuildCalculationPayloadReference, right: BuildCalculationPayloadReference): boolean {
  return left.schemaVersion === right.schemaVersion
    && left.kind === right.kind
    && left.bytes === right.bytes
    && left.sha256 === right.sha256;
}

export function buildCalculationPayloadPath(root: string, profileId: string): string {
  return path.join(path.resolve(root), PAYLOAD_DIRECTORY, `${requireSafeProfileId(profileId)}.xml`);
}

export function stagePobCalculationPayload(profileId: string, xml: string): BuildCalculationPayloadReference {
  requireSafeProfileId(profileId);
  const buffer = normalizedXmlBuffer(xml);
  const normalizedXml = buffer.toString('utf8');
  const reference: BuildCalculationPayloadReference = {
    schemaVersion: 1,
    kind: 'pob-xml',
    bytes: buffer.length,
    sha256: sha256(buffer),
  };
  pendingPayloads.set(profileId, { xml: normalizedXml, reference });
  return reference;
}

async function atomicWrite(filePath: string, content: Buffer): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporary = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, content, { flag: 'wx' });
  try {
    let lastError: unknown;
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        await fs.rename(temporary, filePath);
        return;
      } catch (error) {
        lastError = error;
        const code = error && typeof error === 'object' && 'code' in error ? String((error as { code?: unknown }).code) : '';
        if (!['EPERM', 'EBUSY', 'EACCES'].includes(code) || attempt === 4) throw error;
        await new Promise((resolve) => setTimeout(resolve, 10 * (attempt + 1)));
      }
    }
    throw lastError;
  } finally {
    await fs.rm(temporary, { force: true }).catch(() => undefined);
  }
}

export async function loadPobCalculationPayload(root: string, profile: Pick<BuildProfile, 'id' | 'calculation'>): Promise<string> {
  const reference = profile.calculation;
  if (!reference || reference.schemaVersion !== 1 || reference.kind !== 'pob-xml') {
    throw new Error('Build profile does not have a verified PoB calculation payload.');
  }
  const filePath = buildCalculationPayloadPath(root, profile.id);
  const item = await fs.stat(filePath).catch(() => null);
  if (!item?.isFile()) throw new Error('Build Doctor calculation payload is missing from local storage.');
  if (item.size !== reference.bytes || item.size < 1 || item.size > MAX_POB_XML_BYTES) {
    throw new Error('Build Doctor calculation payload size does not match its profile provenance.');
  }
  const buffer = await fs.readFile(filePath);
  if (buffer.length !== reference.bytes || sha256(buffer) !== reference.sha256) {
    throw new Error('Build Doctor calculation payload failed SHA-256 verification.');
  }
  const xml = buffer.toString('utf8');
  if (!Buffer.from(xml, 'utf8').equals(buffer)) throw new Error('Build Doctor calculation payload is not valid UTF-8.');
  if (!/^<\?xml\b|^<PathOfBuilding\b/i.test(xml.trim())) throw new Error('Build Doctor calculation payload is not Path of Building XML.');
  return xml;
}

export async function persistPendingPobCalculationPayloads(root: string, profiles: readonly BuildProfile[]): Promise<void> {
  for (const profile of profiles) {
    const pending = pendingPayloads.get(profile.id);
    if (!pending) continue;
    if (!profile.calculation || !sameReference(profile.calculation, pending.reference)) {
      throw new Error(`Build profile ${profile.id} calculation provenance does not match its staged payload.`);
    }
    const buffer = normalizedXmlBuffer(pending.xml);
    if (buffer.length !== pending.reference.bytes || sha256(buffer) !== pending.reference.sha256) {
      throw new Error(`Build profile ${profile.id} staged calculation payload changed before persistence.`);
    }
    await atomicWrite(buildCalculationPayloadPath(root, profile.id), buffer);
    await loadPobCalculationPayload(root, profile);
    pendingPayloads.delete(profile.id);
  }
}

export async function prunePobCalculationPayloads(root: string, profiles: readonly BuildProfile[]): Promise<void> {
  const directory = path.join(path.resolve(root), PAYLOAD_DIRECTORY);
  const entries = await fs.readdir(directory, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
    if (error.code === 'ENOENT') return [];
    throw error;
  });
  const allowed = new Set(profiles.filter((profile) => profile.calculation).map((profile) => `${profile.id}.xml`));
  for (const entry of entries) {
    if (!entry.name.endsWith('.xml') || allowed.has(entry.name)) continue;
    if (!entry.isFile() && !entry.isSymbolicLink()) continue;
    await fs.rm(path.join(directory, entry.name), { force: true });
  }
}

export function discardPendingPobCalculationPayload(profileId: string): void {
  pendingPayloads.delete(profileId);
}
