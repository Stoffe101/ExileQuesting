export const MAX_REMOTE_JSON_BYTES = 16 * 1024 * 1024;
export const MAX_POBBIN_RAW_BYTES = 16 * 1024 * 1024;

const EXTERNAL_HOSTS = new Set([
  'github.com',
  'pobb.in',
  'pathofexile.com',
  'www.pathofexile.com',
  'poewiki.net',
  'www.poewiki.net',
]);

export function isAllowedExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && EXTERNAL_HOSTS.has(url.hostname.toLowerCase()) && !url.username && !url.password;
  } catch {
    return false;
  }
}

export function isAllowedDataUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== 'https:' || url.username || url.password) return false;
    return ['api.github.com', 'raw.githubusercontent.com', 'pobb.in'].includes(url.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function assertBoundedContentLength(headers: Headers, maxBytes: number): void {
  const raw = headers.get('content-length');
  if (!raw) return;
  const size = Number(raw);
  if (!Number.isFinite(size) || size < 0 || size > maxBytes) throw new Error(`Remote payload exceeds the ${maxBytes}-byte safety limit.`);
}

export async function readBoundedResponseText(response: Response, maxBytes: number): Promise<string> {
  assertBoundedContentLength(response.headers, maxBytes);
  if (!response.body) throw new Error('Remote response has no body.');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let result = '';
  let bytes = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.byteLength;
    if (bytes > maxBytes) {
      await reader.cancel();
      throw new Error(`Remote payload exceeds the ${maxBytes}-byte safety limit.`);
    }
    result += decoder.decode(value, { stream: true });
  }
  result += decoder.decode();
  return result;
}
